const cron = require('node-cron');
const { getPool, syncAllLoanBalances } = require('../db');
const { sendWhatsAppMessage, logReminder, normalizePhoneNumber } = require('./whatsapp');

/**
 * Executes a full reminder sweep across all active and unpaid loans.
 * Can be triggered automatically by cron or manually via admin / webhook.
 */
async function runReminderSweep() {
  console.log('[Scheduler] ⏰ Starting automated WhatsApp reminder sweep...');
  let checkedCount = 0;
  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  try {
    const db = await getPool();
    // Ensure all loan balances and statuses are up to date
    await syncAllLoanBalances();

    // Query active loans with remaining balance
    const [loans] = await db.query(`
      SELECT 
        lr.id as loan_id,
        lr.client_id,
        lr.amount_taken,
        lr.interest_amount,
        lr.total_payable,
        lr.total_paid,
        lr.remaining_amount,
        lr.duration,
        lr.start_date,
        lr.due_date,
        lr.status as loan_status,
        c.name as client_name,
        c.mobile_number
      FROM loan_records lr
      JOIN clients c ON lr.client_id = c.id
      WHERE lr.remaining_amount > 0 AND lr.status != 'completed'
    `);

    checkedCount = loans.length;

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    for (const loan of loans) {
      const loanDueDate = new Date(loan.due_date);
      const dueDateStr = isNaN(loanDueDate.getTime()) ? String(loan.due_date) : loanDueDate.toISOString().split('T')[0];

      let reminderType = null;

      if (dueDateStr === tomorrowStr) {
        reminderType = 'due_tomorrow';
      } else if (dueDateStr === todayStr) {
        reminderType = 'due_today';
      } else if (dueDateStr < todayStr) {
        reminderType = 'overdue';
      }

      // If due date is not tomorrow, today, or overdue, skip
      if (!reminderType) {
        skippedCount++;
        continue;
      }

      // Check if a reminder for this loan, reminder type, and due date has already been successfully sent
      const [existingSent] = await db.query(`
        SELECT id FROM reminder_logs
        WHERE loan_id = ? AND reminder_type = ? AND due_date = ? AND status = 'sent'
        LIMIT 1
      `, [loan.loan_id, reminderType, dueDateStr]);

      if (existingSent && existingSent.length > 0) {
        skippedCount++;
        continue;
      }

      const formattedDueDate = loanDueDate.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });

      // Send WhatsApp message
      const sendResult = await sendWhatsAppMessage({
        to: loan.mobile_number,
        reminderType,
        clientName: loan.client_name,
        amount: loan.remaining_amount,
        dueDate: formattedDueDate
      });

      const normalizedRecipient = normalizePhoneNumber(loan.mobile_number) || loan.mobile_number;

      // Log reminder attempt
      await logReminder({
        loanId: loan.loan_id,
        clientId: loan.client_id,
        phoneNumber: normalizedRecipient,
        reminderType,
        dueDate: dueDateStr,
        amount: loan.remaining_amount,
        message: sendResult.messageText,
        status: sendResult.success ? 'sent' : 'failed',
        whatsappMessageId: sendResult.messageId || null,
        errorMessage: sendResult.error || null
      });

      if (sendResult.success) {
        sentCount++;
        console.log(`[Scheduler] ✉️ Sent ${reminderType} reminder to ${loan.client_name} (${normalizedRecipient}) for Loan #${loan.loan_id}`);
      } else {
        failedCount++;
        console.warn(`[Scheduler] ⚠️ Reminder failed for ${loan.client_name} (${normalizedRecipient}): ${sendResult.error}`);
      }
    }

    console.log(`[Scheduler] ✅ Reminder sweep completed. Checked: ${checkedCount}, Sent: ${sentCount}, Skipped: ${skippedCount}, Failed: ${failedCount}`);
    return {
      success: true,
      checkedCount,
      sentCount,
      skippedCount,
      failedCount,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('[Scheduler Error] Reminder sweep encountered an error:', err);
    return {
      success: false,
      error: err.message,
      checkedCount,
      sentCount,
      failedCount
    };
  }
}

/**
 * Initializes cron scheduler to run hourly and daily at 09:00 AM
 */
function startScheduler() {
  // Cron schedule: Run at minute 0 of every hour (0 * * * *)
  cron.schedule('0 * * * *', async () => {
    console.log('[Scheduler] Running hourly reminder check...');
    await runReminderSweep();
  });

  console.log('⏰ [Scheduler] Automatic WhatsApp Reminder Cron initialized (runs hourly & production ready)');

  // Also run an initial check 10 seconds after server startup
  setTimeout(() => {
    runReminderSweep().catch(e => console.error('[Scheduler Startup Error]', e.message));
  }, 10000);
}

module.exports = {
  startScheduler,
  runReminderSweep
};
