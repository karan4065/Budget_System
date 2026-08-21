const express = require('express');
const { getPool, syncLoanBalances } = require('../db');
const authMiddleware = require('../middleware/auth');
const { sendWhatsAppMessage, logReminder, normalizePhoneNumber } = require('../services/whatsapp');
const { runReminderSweep } = require('../services/scheduler');

const router = express.Router();

// GET /api/reminders - List reminder history logs with filters and pagination/counts
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const { status, loanId, clientId, limit = 50 } = req.query;

    let query = `
      SELECT 
        rl.id,
        rl.loan_id,
        rl.client_id,
        rl.phone_number,
        rl.reminder_type,
        rl.due_date,
        rl.amount,
        rl.message,
        rl.status,
        rl.sent_at,
        rl.whatsapp_message_id,
        rl.error_message,
        rl.created_at,
        c.name as client_name,
        lr.amount_taken as loan_principal,
        lr.total_payable as loan_total_payable,
        lr.remaining_amount as loan_current_remaining,
        lr.duration as loan_duration
      FROM reminder_logs rl
      LEFT JOIN clients c ON rl.client_id = c.id
      LEFT JOIN loan_records lr ON rl.loan_id = lr.id
      WHERE 1=1
    `;

    const params = [];

    if (status) {
      query += ` AND rl.status = ?`;
      params.push(status);
    }

    if (loanId) {
      query += ` AND rl.loan_id = ?`;
      params.push(loanId);
    }

    if (clientId) {
      query += ` AND rl.client_id = ?`;
      params.push(clientId);
    }

    query += ` ORDER BY rl.sent_at DESC LIMIT ?`;
    params.push(parseInt(limit, 10) || 50);

    const [logs] = await db.query(query, params);

    // Summary counts
    const [[counts]] = await db.query(`
      SELECT
        COUNT(*) as totalReminders,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sentCount,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedCount,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingCount
      FROM reminder_logs
    `);

    return res.json({
      logs: logs.map(l => ({
        id: l.id,
        loanId: l.loan_id,
        clientId: l.client_id,
        clientName: l.client_name || 'Client',
        phoneNumber: l.phone_number,
        reminderType: l.reminder_type,
        dueDate: l.due_date,
        amount: Number(l.amount),
        message: l.message,
        status: l.status,
        sentAt: l.sent_at,
        whatsappMessageId: l.whatsapp_message_id,
        errorMessage: l.error_message,
        loanPrincipal: Number(l.loan_principal || 0),
        loanTotalPayable: Number(l.loan_total_payable || 0),
        loanCurrentRemaining: Number(l.loan_current_remaining || 0),
        loanDuration: l.loan_duration
      })),
      counts: {
        total: Number(counts?.totalReminders || 0),
        sent: Number(counts?.sentCount || 0),
        failed: Number(counts?.failedCount || 0),
        pending: Number(counts?.pendingCount || 0)
      }
    });
  } catch (err) {
    console.error('Error fetching reminders:', err);
    return res.status(500).json({ error: 'Failed to fetch reminder history: ' + err.message });
  }
});

// POST /api/reminders/:loanId/prepare - Prepare WhatsApp reminder link without logging yet
router.post('/:loanId/prepare', authMiddleware, async (req, res) => {
  const loanId = req.params.loanId;
  const { customMessage } = req.body || {};

  try {
    const db = await getPool();
    await syncLoanBalances(loanId);

    const [rows] = await db.query(`
      SELECT 
        lr.*,
        c.name as client_name,
        c.mobile_number
      FROM loan_records lr
      JOIN clients c ON lr.client_id = c.id
      WHERE lr.id = ?
    `, [loanId]);

    const loan = rows[0];
    if (!loan) {
      return res.status(404).json({ error: 'Loan record not found.' });
    }

    if (Number(loan.remaining_amount) <= 0 || loan.status === 'completed') {
      return res.status(400).json({ error: 'Cannot send reminder. This loan is already fully paid.' });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const dueDateObj = new Date(loan.due_date);
    const dueDateStr = isNaN(dueDateObj.getTime()) ? String(loan.due_date) : dueDateObj.toISOString().split('T')[0];

    let reminderType = 'manual';
    if (dueDateStr === todayStr) {
      reminderType = 'due_today';
    } else if (dueDateStr < todayStr) {
      reminderType = 'overdue';
    }

    const formattedDueDate = dueDateObj.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    const sendResult = await sendWhatsAppMessage({
      to: loan.mobile_number,
      reminderType,
      clientName: loan.client_name,
      amount: loan.remaining_amount,
      totalPayable: loan.total_payable || (Number(loan.amount_taken) * 1.10),
      dueDate: formattedDueDate,
      customMessage
    });

    const normalizedRecipient = normalizePhoneNumber(loan.mobile_number) || loan.mobile_number;
    const recipientDigits = normalizedRecipient.replace(/\D/g, '');
    const directWhatsAppUrl = `https://api.whatsapp.com/send?phone=${recipientDigits}&text=${encodeURIComponent(sendResult.messageText)}`;

    return res.json({
      success: true,
      clientName: loan.client_name,
      recipient: normalizedRecipient,
      messageText: sendResult.messageText,
      directWhatsAppUrl,
      reminderType,
      dueDate: dueDateStr,
      amount: loan.remaining_amount
    });
  } catch (err) {
    console.error('Error preparing reminder:', err);
    return res.status(500).json({ error: 'Failed to prepare WhatsApp reminder: ' + err.message });
  }
});

// POST /api/reminders/:loanId/confirm - Log reminder into history after returning from WhatsApp
router.post('/:loanId/confirm', authMiddleware, async (req, res) => {
  const loanId = req.params.loanId;
  const { messageText, reminderType = 'manual' } = req.body || {};

  try {
    const db = await getPool();
    const [rows] = await db.query(`
      SELECT 
        lr.*,
        c.name as client_name,
        c.mobile_number
      FROM loan_records lr
      JOIN clients c ON lr.client_id = c.id
      WHERE lr.id = ?
    `, [loanId]);

    const loan = rows[0];
    if (!loan) {
      return res.status(404).json({ error: 'Loan record not found.' });
    }

    const normalizedRecipient = normalizePhoneNumber(loan.mobile_number) || loan.mobile_number;
    const dueDateObj = new Date(loan.due_date);
    const dueDateStr = isNaN(dueDateObj.getTime()) ? String(loan.due_date) : dueDateObj.toISOString().split('T')[0];

    const finalMessage = messageText || `Hello ${loan.client_name}, your loan payment is due. Please make payment on time.`;

    const logId = await logReminder({
      loanId: loan.id,
      clientId: loan.client_id,
      phoneNumber: normalizedRecipient,
      reminderType,
      dueDate: dueDateStr,
      amount: loan.remaining_amount,
      message: finalMessage,
      status: 'sent',
      whatsappMessageId: `wamid_manual_${Date.now()}`,
      errorMessage: null
    });

    return res.json({
      success: true,
      message: `WhatsApp reminder for ${loan.client_name} successfully recorded (+1)`,
      logId
    });
  } catch (err) {
    console.error('Error logging confirmed reminder:', err);
    return res.status(500).json({ error: 'Failed to record reminder log: ' + err.message });
  }
});

// POST /api/reminders/:loanId/send - Prepare and open reminder
router.post('/:loanId/send', authMiddleware, async (req, res) => {
  const loanId = req.params.loanId;
  const { customMessage } = req.body || {};

  try {
    const db = await getPool();
    await syncLoanBalances(loanId);

    const [rows] = await db.query(`
      SELECT 
        lr.*,
        c.name as client_name,
        c.mobile_number
      FROM loan_records lr
      JOIN clients c ON lr.client_id = c.id
      WHERE lr.id = ?
    `, [loanId]);

    const loan = rows[0];
    if (!loan) {
      return res.status(404).json({ error: 'Loan record not found.' });
    }

    if (Number(loan.remaining_amount) <= 0 || loan.status === 'completed') {
      return res.status(400).json({ error: 'Cannot send reminder. This loan is already fully paid.' });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const dueDateObj = new Date(loan.due_date);
    const dueDateStr = isNaN(dueDateObj.getTime()) ? String(loan.due_date) : dueDateObj.toISOString().split('T')[0];

    let reminderType = 'manual';
    if (dueDateStr === todayStr) {
      reminderType = 'due_today';
    } else if (dueDateStr < todayStr) {
      reminderType = 'overdue';
    }

    const formattedDueDate = dueDateObj.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    const sendResult = await sendWhatsAppMessage({
      to: loan.mobile_number,
      reminderType,
      clientName: loan.client_name,
      amount: loan.remaining_amount,
      totalPayable: loan.total_payable || (Number(loan.amount_taken) * 1.10),
      dueDate: formattedDueDate,
      customMessage
    });

    const normalizedRecipient = normalizePhoneNumber(loan.mobile_number) || loan.mobile_number;
    const recipientDigits = normalizedRecipient.replace(/\D/g, '');
    const directWhatsAppUrl = `https://api.whatsapp.com/send?phone=${recipientDigits}&text=${encodeURIComponent(sendResult.messageText)}`;

    return res.json({
      success: true,
      message: `Opening WhatsApp chat with ${loan.client_name} (${normalizedRecipient})...`,
      recipient: normalizedRecipient,
      messageText: sendResult.messageText,
      directWhatsAppUrl,
      reminderType,
      dueDate: dueDateStr
    });
  } catch (err) {
    console.error('Error sending manual reminder:', err);
    return res.status(500).json({ error: 'Failed to send WhatsApp reminder: ' + err.message });
  }
});

// POST /api/reminders/trigger-cron - Administrative / Production trigger for reminder sweep
router.post('/trigger-cron', authMiddleware, async (req, res) => {
  try {
    const sweepResult = await runReminderSweep();
    return res.json({
      message: 'Reminder sweep executed successfully.',
      ...sweepResult
    });
  } catch (err) {
    return res.status(500).json({ error: 'Cron sweep failed: ' + err.message });
  }
});

module.exports = router;
