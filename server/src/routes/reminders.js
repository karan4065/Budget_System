const express = require('express');
const mongoose = require('mongoose');
const { syncLoanBalances, getTodayStr } = require('../db');
const authMiddleware = require('../middleware/auth');
const { sendWhatsAppMessage, logReminder, normalizePhoneNumber } = require('../services/whatsapp');
const { runReminderSweep } = require('../services/scheduler');
const Loan = require('../models/Loan');
const Reminder = require('../models/Reminder');

const router = express.Router();

// ─── Helper: load loan with client ───────────────────────────────────────────
async function getLoanWithClient(loanId) {
  if (!mongoose.Types.ObjectId.isValid(loanId)) return null;
  return Loan.findById(loanId).populate('clientId', 'name mobileNumber').lean();
}

// GET /api/reminders - List reminder history logs with filters and pagination
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, loanId, clientId, limit = 50 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (loanId && mongoose.Types.ObjectId.isValid(loanId)) filter.loanId = loanId;
    if (clientId && mongoose.Types.ObjectId.isValid(clientId)) filter.clientId = clientId;

    const [logs, countAgg] = await Promise.all([
      Reminder.find(filter)
        .populate('clientId', 'name')
        .populate('loanId', 'amountTaken totalPayable remainingAmount duration')
        .sort({ sentAt: -1 })
        .limit(parseInt(limit, 10) || 50)
        .lean(),
      Reminder.aggregate([{
        $group: {
          _id: null,
          totalReminders: { $sum: 1 },
          sentCount: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
          failedCount: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } }
        }
      }])
    ]);

    const counts = countAgg[0] || { totalReminders: 0, sentCount: 0, failedCount: 0, pendingCount: 0 };

    return res.json({
      logs: logs.map(l => {
        const channel = l.channel || (l.reminderType?.startsWith('sms') ? 'sms' : 'whatsapp');
        return {
          id: l._id.toString(),
          loanId: l.loanId?._id?.toString() || l.loanId?.toString(),
          clientId: l.clientId?._id?.toString() || l.clientId?.toString(),
          clientName: l.clientId?.name || 'Client',
          phoneNumber: l.phoneNumber,
          reminderType: l.reminderType,
          channel,
          dueDate: l.dueDate,
          amount: Number(l.amount),
          message: l.message,
          status: l.status,
          sentAt: l.sentAt,
          whatsappMessageId: l.whatsappMessageId,
          errorMessage: l.errorMessage,
          loanPrincipal: Number(l.loanId?.amountTaken || 0),
          loanTotalPayable: Number(l.loanId?.totalPayable || 0),
          loanCurrentRemaining: Number(l.loanId?.remainingAmount || 0),
          loanDuration: l.loanId?.duration
        };
      }),
      counts: {
        total: Number(counts.totalReminders),
        sent: Number(counts.sentCount),
        failed: Number(counts.failedCount),
        pending: Number(counts.pendingCount)
      }
    });
  } catch (err) {
    console.error('Error fetching reminders:', err);
    return res.status(500).json({ error: 'Failed to fetch reminder history: ' + err.message });
  }
});

// POST /api/reminders/:loanId/prepare - Prepare WhatsApp reminder link
router.post('/:loanId/prepare', authMiddleware, async (req, res) => {
  const loanId = req.params.loanId;
  const { customMessage } = req.body || {};

  try {
    await syncLoanBalances(loanId);
    const loan = await getLoanWithClient(loanId);
    if (!loan) return res.status(404).json({ error: 'Loan record not found.' });
    if (Number(loan.remainingAmount) <= 0 || loan.status === 'completed') {
      return res.status(400).json({ error: 'Cannot send reminder. This loan is already fully paid.' });
    }

    const todayStr = getTodayStr();
    const dueDateStr = loan.dueDate || '';
    const client = loan.clientId || {};

    // Fetch all active loans for this client
    const allClientActiveLoans = await Loan.find({
      clientId: client._id,
      status: { $in: ['active', 'overdue'] },
      remainingAmount: { $gt: 0 },
      isSettledPending: { $ne: true }
    }).sort({ createdAt: 1 }).lean();

    const allClientLoans = await Loan.find({ clientId: client._id }).sort({ createdAt: 1 }).lean();

    let loansList = [];
    if (allClientActiveLoans.length > 1) {
      loansList = allClientActiveLoans.map(l => {
        const idxInAll = allClientLoans.findIndex(al => al._id.toString() === l._id.toString());
        const seq = idxInAll >= 0 ? idxInAll + 1 : 1;
        const ordinal = (seq === 1 ? '1st Loan' : seq === 2 ? '2nd Loan' : seq === 3 ? '3rd Loan' : `${seq}th Loan`);
        const formattedD = l.dueDate
          ? new Date(l.dueDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
          : 'scheduled date';
        return {
          loanId: l._id.toString(),
          remainingAmount: Number(l.remainingAmount),
          totalPayable: Number(l.totalPayable || (l.amountTaken * 1.10)),
          dueDate: l.dueDate,
          formattedDueDate: formattedD,
          ordinalLabel: ordinal,
          isOverdue: l.dueDate && todayStr > l.dueDate
        };
      });
    }

    let reminderType = 'manual', daysOverdue = 0, overdueWeeks = 0;
    const principal = Number(loan.amountTaken) || 0;
    const rate = Number(loan.interestRate) || 10;
    const baseInterest = Math.round(principal * (rate / 100) * 100) / 100;

    if (dueDateStr === todayStr) {
      reminderType = 'due_today';
    } else if (dueDateStr < todayStr) {
      reminderType = 'overdue';
      const d1 = new Date(dueDateStr + 'T00:00:00');
      const d2 = new Date(todayStr + 'T00:00:00');
      daysOverdue = Math.max(0, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
      overdueWeeks = Math.ceil(daysOverdue / 7);
    }
    const overdueInterest = overdueWeeks * baseInterest;

    const formattedDueDate = dueDateStr
      ? new Date(dueDateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'the scheduled date';

    const totalActiveAmount = allClientActiveLoans.length > 1
      ? allClientActiveLoans.reduce((sum, l) => sum + Number(l.remainingAmount || 0), 0)
      : loan.remainingAmount;

    const sendResult = await sendWhatsAppMessage({
      to: client.mobileNumber,
      reminderType,
      clientName: client.name,
      amount: totalActiveAmount,
      totalPayable: loan.totalPayable || (principal * 1.10),
      dueDate: formattedDueDate,
      daysOverdue, overdueWeeks, overdueInterest, principal,
      loansList,
      customMessage
    });

    const normalizedRecipient = normalizePhoneNumber(client.mobileNumber) || client.mobileNumber;
    const recipientDigits = normalizedRecipient.replace(/\D/g, '');
    const directWhatsAppUrl = `https://api.whatsapp.com/send?phone=${recipientDigits}&text=${encodeURIComponent(sendResult.messageText)}`;
    const directSmsUrl = `sms:+${recipientDigits}?body=${encodeURIComponent(sendResult.messageText)}`;

    return res.json({
      success: true,
      clientName: client.name,
      recipient: normalizedRecipient,
      phoneNumber: client.mobileNumber,
      messageText: sendResult.messageText,
      directWhatsAppUrl,
      directSmsUrl,
      reminderType,
      dueDate: dueDateStr,
      amount: totalActiveAmount,
      loansCount: allClientActiveLoans.length
    });
  } catch (err) {
    console.error('Error preparing reminder:', err);
    return res.status(500).json({ error: 'Failed to prepare reminder: ' + err.message });
  }
});

// POST /api/reminders/:loanId/confirm - Log reminder after returning from WhatsApp/SMS
router.post('/:loanId/confirm', authMiddleware, async (req, res) => {
  const loanId = req.params.loanId;
  const { messageText, reminderType = 'manual', channel = 'whatsapp' } = req.body || {};

  try {
    const loan = await getLoanWithClient(loanId);
    if (!loan) return res.status(404).json({ error: 'Loan record not found.' });

    const client = loan.clientId || {};
    const normalizedRecipient = normalizePhoneNumber(client.mobileNumber) || client.mobileNumber;
    const dueDateStr = loan.dueDate || getTodayStr();
    const finalMessage = messageText || `Hello ${client.name}, your loan payment is due. Please make payment on time.`;
    const channelPrefix = channel === 'sms' ? 'sms' : 'wamid';

    const logId = await logReminder({
      loanId: loan._id,
      clientId: loan.clientId._id || loan.clientId,
      phoneNumber: normalizedRecipient,
      reminderType: channel === 'sms' ? `sms_${reminderType}` : reminderType,
      channel: channel === 'sms' ? 'sms' : 'whatsapp',
      dueDate: dueDateStr,
      amount: loan.remainingAmount,
      message: finalMessage,
      status: 'sent',
      whatsappMessageId: `${channelPrefix}_manual_${Date.now()}`,
      errorMessage: null
    });

    await Loan.findByIdAndUpdate(loanId, {
      reminderSent: true,
      lastReminderSentAt: new Date()
    });

    const channelLabel = channel === 'sms' ? 'SMS' : 'WhatsApp';
    return res.json({
      success: true,
      message: `${channelLabel} reminder for ${client.name} successfully recorded (+1)`,
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
    await syncLoanBalances(loanId);
    const loan = await getLoanWithClient(loanId);
    if (!loan) return res.status(404).json({ error: 'Loan record not found.' });
    if (Number(loan.remainingAmount) <= 0 || loan.status === 'completed') {
      return res.status(400).json({ error: 'Cannot send reminder. This loan is already fully paid.' });
    }

    const todayStr = getTodayStr();
    const dueDateStr = loan.dueDate || '';
    const client = loan.clientId || {};

    // Fetch all active loans for this client
    const allClientActiveLoans = await Loan.find({
      clientId: client._id,
      status: { $in: ['active', 'overdue'] },
      remainingAmount: { $gt: 0 },
      isSettledPending: { $ne: true }
    }).sort({ createdAt: 1 }).lean();

    const allClientLoans = await Loan.find({ clientId: client._id }).sort({ createdAt: 1 }).lean();

    let loansList = [];
    if (allClientActiveLoans.length > 1) {
      loansList = allClientActiveLoans.map(l => {
        const idxInAll = allClientLoans.findIndex(al => al._id.toString() === l._id.toString());
        const seq = idxInAll >= 0 ? idxInAll + 1 : 1;
        const ordinal = (seq === 1 ? '1st Loan' : seq === 2 ? '2nd Loan' : seq === 3 ? '3rd Loan' : `${seq}th Loan`);
        const formattedD = l.dueDate
          ? new Date(l.dueDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
          : 'scheduled date';
        return {
          loanId: l._id.toString(),
          remainingAmount: Number(l.remainingAmount),
          totalPayable: Number(l.totalPayable || (l.amountTaken * 1.10)),
          dueDate: l.dueDate,
          formattedDueDate: formattedD,
          ordinalLabel: ordinal,
          isOverdue: l.dueDate && todayStr > l.dueDate
        };
      });
    }

    let reminderType = 'manual', daysOverdue = 0, overdueWeeks = 0;
    const principal = Number(loan.amountTaken) || 0;
    const rate = Number(loan.interestRate) || 10;
    const baseInterest = Math.round(principal * (rate / 100) * 100) / 100;

    if (dueDateStr === todayStr) {
      reminderType = 'due_today';
    } else if (dueDateStr < todayStr) {
      reminderType = 'overdue';
      const d1 = new Date(dueDateStr + 'T00:00:00');
      const d2 = new Date(todayStr + 'T00:00:00');
      daysOverdue = Math.max(0, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
      overdueWeeks = Math.ceil(daysOverdue / 7);
    }
    const overdueInterest = overdueWeeks * baseInterest;

    const formattedDueDate = dueDateStr
      ? new Date(dueDateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'the scheduled date';

    const totalActiveAmount = allClientActiveLoans.length > 1
      ? allClientActiveLoans.reduce((sum, l) => sum + Number(l.remainingAmount || 0), 0)
      : loan.remainingAmount;

    const sendResult = await sendWhatsAppMessage({
      to: client.mobileNumber,
      reminderType,
      clientName: client.name,
      amount: totalActiveAmount,
      totalPayable: loan.totalPayable || (principal * 1.10),
      dueDate: formattedDueDate,
      daysOverdue, overdueWeeks, overdueInterest, principal,
      loansList,
      customMessage
    });

    const normalizedRecipient = normalizePhoneNumber(client.mobileNumber) || client.mobileNumber;
    const recipientDigits = normalizedRecipient.replace(/\D/g, '');
    const directWhatsAppUrl = `https://api.whatsapp.com/send?phone=${recipientDigits}&text=${encodeURIComponent(sendResult.messageText)}`;

    return res.json({
      success: true,
      message: `Opening WhatsApp chat with ${client.name} (${normalizedRecipient})...`,
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

// POST /api/reminders/trigger-cron - Administrative trigger for reminder sweep
router.post('/trigger-cron', authMiddleware, async (req, res) => {
  try {
    const sweepResult = await runReminderSweep();
    return res.json({ message: 'Reminder sweep executed successfully.', ...sweepResult });
  } catch (err) {
    return res.status(500).json({ error: 'Cron sweep failed: ' + err.message });
  }
});

module.exports = router;
