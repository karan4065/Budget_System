const express = require('express');
const router = express.Router();
const { getPool, updateAllRecordStatuses } = require('../db');
const authMiddleware = require('../middleware/auth');

// GET /api/dashboard/stats
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    // Sync all balances & statuses based on actual transactions and dates
    await updateAllRecordStatuses();

    const todayObj = new Date();
    const todayStr = todayObj.toISOString().split('T')[0];
    
    const tomorrowObj = new Date(todayObj);
    tomorrowObj.setDate(tomorrowObj.getDate() + 1);
    const tomorrowStr = tomorrowObj.toISOString().split('T')[0];

    const next7DaysObj = new Date(todayObj);
    next7DaysObj.setDate(next7DaysObj.getDate() + 7);
    const next7DaysStr = next7DaysObj.toISOString().split('T')[0];

    // Basic totals
    const [[{ totalClients }]] = await db.query('SELECT COUNT(*) as totalClients FROM clients');

    const [[recordsStats]] = await db.query(`
      SELECT
        COUNT(*) as totalRecords,
        SUM(CASE WHEN remaining_amount > 0 AND status != 'overdue' THEN 1 ELSE 0 END) as activeRecords,
        SUM(CASE WHEN remaining_amount = 0 OR status = 'completed' THEN 1 ELSE 0 END) as completedRecords,
        SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdueRecords,
        SUM(CASE WHEN DATE_FORMAT(due_date, '%Y-%m-%d') = ? AND remaining_amount > 0 THEN 1 ELSE 0 END) as dueTodayRecords,
        SUM(CASE WHEN DATE_FORMAT(due_date, '%Y-%m-%d') = ? AND remaining_amount > 0 THEN 1 ELSE 0 END) as dueTomorrowRecords,
        COALESCE(SUM(amount_taken), 0) as totalAmountGiven,
        COALESCE(SUM(interest_amount), 0) as totalInterestAmount,
        COALESCE(SUM(total_payable), 0) as totalPayableAmount,
        COALESCE(SUM(total_paid), 0) as totalAmountCollected,
        COALESCE(SUM(remaining_amount), 0) as totalOutstandingAmount,
        COUNT(DISTINCT CASE WHEN duration = 'weekly' AND remaining_amount > 0 AND status != 'completed' THEN client_id END) as weeklyClients,
        SUM(CASE WHEN duration = 'weekly' AND remaining_amount > 0 AND status != 'completed' THEN 1 ELSE 0 END) as weeklyCount,
        COALESCE(SUM(CASE WHEN duration = 'weekly' AND remaining_amount > 0 AND status != 'completed' THEN amount_taken ELSE 0 END), 0) as weeklyAmount,
        COUNT(DISTINCT CASE WHEN duration = 'fortnight' AND remaining_amount > 0 AND status != 'completed' THEN client_id END) as fortnightClients,
        SUM(CASE WHEN duration = 'fortnight' AND remaining_amount > 0 AND status != 'completed' THEN 1 ELSE 0 END) as fortnightCount,
        COALESCE(SUM(CASE WHEN duration = 'fortnight' AND remaining_amount > 0 AND status != 'completed' THEN amount_taken ELSE 0 END), 0) as fortnightAmount,
        COUNT(DISTINCT CASE WHEN duration = 'monthly' AND remaining_amount > 0 AND status != 'completed' THEN client_id END) as monthlyClients,
        SUM(CASE WHEN duration = 'monthly' AND remaining_amount > 0 AND status != 'completed' THEN 1 ELSE 0 END) as monthlyCount,
        COALESCE(SUM(CASE WHEN duration = 'monthly' AND remaining_amount > 0 AND status != 'completed' THEN amount_taken ELSE 0 END), 0) as monthlyAmount
      FROM loan_records
    `, [todayStr, tomorrowStr]);

    // Total collected directly from payment transactions for absolute single-source truth
    const [[txnStats]] = await db.query(`
      SELECT COALESCE(SUM(amount), 0) as totalCollectedFromTxns
      FROM transactions
      WHERE transaction_type = 'payment'
    `);

    // WhatsApp Reminder Counts
    const [[reminderCounts]] = await db.query(`
      SELECT
        COUNT(*) as totalReminders,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sentCount,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedCount
      FROM reminder_logs
    `);

    const totalAmountGiven = Number(recordsStats.totalAmountGiven) || 0;
    const totalInterest = Number(recordsStats.totalInterestAmount) || Math.round(totalAmountGiven * 0.10 * 100) / 100;
    const totalPayable = Number(recordsStats.totalPayableAmount) || (totalAmountGiven + totalInterest);
    const totalAmountCollected = Number(txnStats.totalCollectedFromTxns) || 0;
    const totalOutstandingAmount = Number(recordsStats.totalOutstandingAmount) || 0;

    // Overdue records details for urgent attention
    const [overdueRecords] = await db.query(`
      SELECT 
        l.id as recordId,
        l.amount_taken as amountTaken,
        l.interest_amount as interestAmount,
        l.total_payable as totalPayable,
        l.remaining_amount as remainingAmount,
        l.duration,
        DATE_FORMAT(l.start_date, '%Y-%m-%d') as startDate,
        DATE_FORMAT(l.due_date, '%Y-%m-%d') as dueDate,
        l.status,
        c.id as clientId,
        c.name as clientName,
        c.mobile_number as mobileNumber
      FROM loan_records l
      JOIN clients c ON l.client_id = c.id
      WHERE l.status = 'overdue' AND l.remaining_amount > 0
      ORDER BY l.due_date ASC
      LIMIT 10
    `);

    // Upcoming dues in the next 7 days
    const [upcomingDues] = await db.query(`
      SELECT 
        l.id as recordId,
        l.amount_taken as amountTaken,
        l.interest_amount as interestAmount,
        l.total_payable as totalPayable,
        l.remaining_amount as remainingAmount,
        l.duration,
        DATE_FORMAT(l.start_date, '%Y-%m-%d') as startDate,
        DATE_FORMAT(l.due_date, '%Y-%m-%d') as dueDate,
        l.status,
        c.id as clientId,
        c.name as clientName,
        c.mobile_number as mobileNumber
      FROM loan_records l
      JOIN clients c ON l.client_id = c.id
      WHERE l.status = 'active' AND l.remaining_amount > 0 AND l.due_date BETWEEN ? AND ?
      ORDER BY l.due_date ASC
      LIMIT 10
    `, [todayStr, next7DaysStr]);

    // Recent transactions
    const [recentTransactions] = await db.query(`
      SELECT 
        t.id,
        t.record_id as recordId,
        t.client_id as clientId,
        t.amount,
        t.transaction_type as transactionType,
        DATE_FORMAT(t.transaction_date, '%Y-%m-%d') as transactionDate,
        t.remaining_after as remainingAfter,
        t.note,
        t.payment_mode as paymentMode,
        c.name as clientName,
        c.mobile_number as mobileNumber
      FROM transactions t
      JOIN clients c ON t.client_id = c.id
      ORDER BY t.transaction_date DESC, t.id DESC
      LIMIT 8
    `);

    // Recent reminders
    const [recentReminders] = await db.query(`
      SELECT 
        r.id,
        r.loan_id as loanId,
        r.client_id as clientId,
        r.phone_number as phoneNumber,
        r.reminder_type as reminderType,
        DATE_FORMAT(r.due_date, '%Y-%m-%d') as dueDate,
        r.amount,
        r.message,
        r.status,
        r.sent_at as sentAt,
        r.error_message as errorMessage,
        c.name as clientName
      FROM reminder_logs r
      JOIN clients c ON r.client_id = c.id
      ORDER BY r.sent_at DESC
      LIMIT 6
    `);

    // Duration distribution metrics
    const durationBreakdown = [
      { 
        name: 'Weekly (7 Days)', 
        count: recordsStats.weeklyClients || 0, 
        loanCount: recordsStats.weeklyCount || 0, 
        amount: Number(recordsStats.weeklyAmount) || 0, 
        key: 'weekly' 
      },
      { 
        name: 'Fortnight (14 Days)', 
        count: recordsStats.fortnightClients || 0, 
        loanCount: recordsStats.fortnightCount || 0, 
        amount: Number(recordsStats.fortnightAmount) || 0, 
        key: 'fortnight' 
      },
      { 
        name: 'Monthly (30 Days)', 
        count: recordsStats.monthlyClients || 0, 
        loanCount: recordsStats.monthlyCount || 0, 
        amount: Number(recordsStats.monthlyAmount) || 0, 
        key: 'monthly' 
      }
    ];

    return res.json({
      totalClients: totalClients || 0,
      totalRecords: recordsStats.totalRecords || 0,
      activeRecords: recordsStats.activeRecords || 0,
      completedRecords: recordsStats.completedRecords || 0,
      overdueRecordsCount: recordsStats.overdueRecords || 0,
      dueTodayCount: recordsStats.dueTodayRecords || 0,
      dueTomorrowCount: recordsStats.dueTomorrowRecords || 0,
      totalAmountGiven,
      totalPrincipal: totalAmountGiven,
      totalInterest,
      totalPayable,
      totalAmountCollected,
      totalRevenue: totalAmountCollected - totalAmountGiven,
      totalOutstandingAmount,
      whatsappSentCount: Number(reminderCounts?.sentCount || 0),
      whatsappFailedCount: Number(reminderCounts?.failedCount || 0),
      totalRemindersCount: Number(reminderCounts?.totalReminders || 0),
      durationBreakdown,
      overdueRecords,
      upcomingDues,
      recentTransactions,
      recentReminders
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    return res.status(500).json({ error: 'Failed to fetch dashboard metrics: ' + err.message });
  }
});

module.exports = router;
