const cron = require('node-cron');
const { syncAllLoanBalances, getTodayStr } = require('../db');
const { sendWhatsAppMessage, logReminder, normalizePhoneNumber } = require('./whatsapp');
const Loan = require('../models/Loan');
const Reminder = require('../models/Reminder');

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
    // Ensure all loan balances and statuses are up to date
    await syncAllLoanBalances();

    // Query active/overdue loans with remaining balance, populate client info
    const loans = await Loan.find({ remainingAmount: { $gt: 0 }, status: { $ne: 'completed' } })
      .populate('clientId', 'name mobileNumber')
      .lean();

    checkedCount = loans.length;

    const todayStr = getTodayStr();
    const todayDate = new Date(todayStr + 'T00:00:00');
    const tomorrowDate = new Date(todayDate);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth()+1).padStart(2,'0')}-${String(tomorrowDate.getDate()).padStart(2,'0')}`;

    for (const loan of loans) {
      const client = loan.clientId || {};
      const dueDateStr = loan.dueDate || '';

      let reminderType = null;
      if (dueDateStr === tomorrowStr) {
        reminderType = 'due_tomorrow';
      } else if (dueDateStr === todayStr) {
        reminderType = 'due_today';
      } else if (dueDateStr < todayStr) {
        reminderType = 'overdue';
      }

      // If not due tomorrow, today, or overdue — skip
      if (!reminderType) {
        skippedCount++;
        continue;
      }

      // Check if a reminder for this loan, reminder type, and due date was already sent
      const existingSent = await Reminder.findOne({
        loanId: loan._id,
        reminderType,
        dueDate: dueDateStr,
        status: 'sent'
      });

      if (existingSent) {
        skippedCount++;
        continue;
      }

      // Calculate overdue info for message
      let daysOverdue = 0;
      let overdueWeeks = 0;
      const principal = Number(loan.amountTaken) || 0;
      const rate = Number(loan.interestRate) || 10;
      const baseInterest = Math.round(principal * (rate / 100) * 100) / 100;

      if (reminderType === 'overdue' && dueDateStr) {
        const d1 = new Date(dueDateStr + 'T00:00:00');
        daysOverdue = Math.max(0, Math.floor((todayDate - d1) / (1000 * 60 * 60 * 24)));
        overdueWeeks = Math.ceil(daysOverdue / 7);
      }
      const overdueInterest = overdueWeeks * baseInterest;

      const formattedDueDate = dueDateStr
        ? new Date(dueDateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'the scheduled date';

      // Send WhatsApp message
      const sendResult = await sendWhatsAppMessage({
        to: client.mobileNumber,
        reminderType,
        clientName: client.name,
        amount: loan.remainingAmount,
        dueDate: formattedDueDate,
        daysOverdue,
        overdueWeeks,
        overdueInterest,
        principal
      });

      const normalizedRecipient = normalizePhoneNumber(client.mobileNumber) || client.mobileNumber;

      // Log reminder attempt
      await logReminder({
        loanId: loan._id,
        clientId: loan.clientId?._id || loan.clientId,
        phoneNumber: normalizedRecipient,
        reminderType,
        dueDate: dueDateStr,
        amount: loan.remainingAmount,
        message: sendResult.messageText,
        status: sendResult.success ? 'sent' : 'failed',
        whatsappMessageId: sendResult.messageId || null,
        errorMessage: sendResult.error || null
      });

      if (sendResult.success) {
        sentCount++;
        console.log(`[Scheduler] ✉️  Sent ${reminderType} reminder to ${client.name} (${normalizedRecipient}) for Loan #${loan._id}`);
      } else {
        failedCount++;
        console.warn(`[Scheduler] ⚠️  Reminder failed for ${client.name} (${normalizedRecipient}): ${sendResult.error}`);
      }
    }

    console.log(`[Scheduler] ✅ Reminder sweep completed. Checked: ${checkedCount}, Sent: ${sentCount}, Skipped: ${skippedCount}, Failed: ${failedCount}`);
    return { success: true, checkedCount, sentCount, skippedCount, failedCount, timestamp: new Date().toISOString() };
  } catch (err) {
    console.error('[Scheduler Error] Reminder sweep encountered an error:', err);
    return { success: false, error: err.message, checkedCount, sentCount, failedCount };
  }
}

/**
 * Initializes cron scheduler to run hourly
 */
function startScheduler() {
  // Run at minute 0 of every hour
  cron.schedule('0 * * * *', async () => {
    console.log('[Scheduler] Running hourly reminder check...');
    await runReminderSweep();
  });

  console.log('⏰ [Scheduler] Automatic WhatsApp Reminder Cron initialized (runs hourly & production ready)');

  // Run an initial check 10 seconds after server startup
  setTimeout(() => {
    runReminderSweep().catch(e => console.error('[Scheduler Startup Error]', e.message));
  }, 10000);
}

module.exports = { startScheduler, runReminderSweep };
