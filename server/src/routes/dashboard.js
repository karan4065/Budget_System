const express = require('express');
const router = express.Router();
const { syncAllLoanBalances, getTodayStr } = require('../db');
const authMiddleware = require('../middleware/auth');
const Client = require('../models/Client');
const Loan = require('../models/Loan');
const Transaction = require('../models/Transaction');
const Reminder = require('../models/Reminder');

// GET /api/dashboard/stats
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    // Sync all loan balances and statuses before computing stats
    await syncAllLoanBalances();

    const todayStr = getTodayStr();
    const todayDate = new Date(todayStr + 'T00:00:00');
    const tomorrowDate = new Date(todayDate);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth()+1).padStart(2,'0')}-${String(tomorrowDate.getDate()).padStart(2,'0')}`;
    const next7Date = new Date(todayDate);
    next7Date.setDate(next7Date.getDate() + 7);
    const next7DaysStr = `${next7Date.getFullYear()}-${String(next7Date.getMonth()+1).padStart(2,'0')}-${String(next7Date.getDate()).padStart(2,'0')}`;

    // ── Basic totals ──────────────────────────────────────────────────────────
    const [totalClients, recordsAgg, txnAgg, reminderAgg] = await Promise.all([
      Client.countDocuments(),
      Loan.aggregate([
        {
          $group: {
            _id: null,
            totalRecords: { $sum: 1 },
            activeRecords: { $sum: { $cond: [{ $and: [{ $gt: ['$remainingAmount', 0] }, { $ne: ['$status', 'overdue'] }, { $ne: ['$status', 'completed'] }] }, 1, 0] } },
            completedRecords: { $sum: { $cond: [{ $or: [{ $eq: ['$remainingAmount', 0] }, { $eq: ['$status', 'completed'] }] }, 1, 0] } },
            overdueRecords: { $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] } },
            dueTodayRecords: { $sum: { $cond: [{ $and: [{ $eq: ['$dueDate', todayStr] }, { $gt: ['$remainingAmount', 0] }] }, 1, 0] } },
            dueTomorrowRecords: { $sum: { $cond: [{ $and: [{ $eq: ['$dueDate', tomorrowStr] }, { $gt: ['$remainingAmount', 0] }] }, 1, 0] } },
            totalAmountGiven: { $sum: '$amountTaken' },
            totalInterestAmount: { $sum: '$interestAmount' },
            totalPayableAmount: { $sum: '$totalPayable' },
            totalAmountCollected: { $sum: '$totalPaid' },
            totalOutstandingAmount: { $sum: '$remainingAmount' },
            // Duration breakdowns
            weeklyClients: { $addToSet: { $cond: [{ $and: [{ $eq: ['$duration', 'weekly'] }, { $gt: ['$remainingAmount', 0] }, { $ne: ['$status', 'completed'] }] }, '$clientId', null] } },
            weeklyCount: { $sum: { $cond: [{ $and: [{ $eq: ['$duration', 'weekly'] }, { $gt: ['$remainingAmount', 0] }, { $ne: ['$status', 'completed'] }] }, 1, 0] } },
            weeklyAmount: { $sum: { $cond: [{ $and: [{ $eq: ['$duration', 'weekly'] }, { $gt: ['$remainingAmount', 0] }, { $ne: ['$status', 'completed'] }] }, '$amountTaken', 0] } },
            fortnightClients: { $addToSet: { $cond: [{ $and: [{ $eq: ['$duration', 'fortnight'] }, { $gt: ['$remainingAmount', 0] }, { $ne: ['$status', 'completed'] }] }, '$clientId', null] } },
            fortnightCount: { $sum: { $cond: [{ $and: [{ $eq: ['$duration', 'fortnight'] }, { $gt: ['$remainingAmount', 0] }, { $ne: ['$status', 'completed'] }] }, 1, 0] } },
            fortnightAmount: { $sum: { $cond: [{ $and: [{ $eq: ['$duration', 'fortnight'] }, { $gt: ['$remainingAmount', 0] }, { $ne: ['$status', 'completed'] }] }, '$amountTaken', 0] } },
            monthlyClients: { $addToSet: { $cond: [{ $and: [{ $eq: ['$duration', 'monthly'] }, { $gt: ['$remainingAmount', 0] }, { $ne: ['$status', 'completed'] }] }, '$clientId', null] } },
            monthlyCount: { $sum: { $cond: [{ $and: [{ $eq: ['$duration', 'monthly'] }, { $gt: ['$remainingAmount', 0] }, { $ne: ['$status', 'completed'] }] }, 1, 0] } },
            monthlyAmount: { $sum: { $cond: [{ $and: [{ $eq: ['$duration', 'monthly'] }, { $gt: ['$remainingAmount', 0] }, { $ne: ['$status', 'completed'] }] }, '$amountTaken', 0] } },
            // Pending totals
            pendingClients: { $addToSet: { $cond: [{ $gt: ['$pendingAmount', 0] }, '$clientId', null] } },
            totalPendingAmount: { $sum: '$pendingAmount' },
            pendingLoansCount: { $sum: { $cond: [{ $gt: ['$pendingAmount', 0] }, 1, 0] } }
          }
        }
      ]),
      Transaction.aggregate([
        { $match: { transactionType: 'payment' } },
        { $group: { _id: null, totalCollectedFromTxns: { $sum: '$amount' } } }
      ]),
      Reminder.aggregate([
        { $group: {
          _id: null,
          totalReminders: { $sum: 1 },
          sentCount: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
          failedCount: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }
        }}
      ])
    ]);

    const stats = recordsAgg[0] || {};
    const totalAmountGiven = Number(stats.totalAmountGiven) || 0;
    const totalInterest = Number(stats.totalInterestAmount) || Math.round(totalAmountGiven * 0.10 * 100) / 100;
    const totalPayable = Number(stats.totalPayableAmount) || (totalAmountGiven + totalInterest);
    const totalAmountCollected = Number(txnAgg[0]?.totalCollectedFromTxns) || 0;
    const totalOutstandingAmount = Number(stats.totalOutstandingAmount) || 0;
    const reminderCounts = reminderAgg[0] || {};

    // ── Overdue records ───────────────────────────────────────────────────────
    const rawOverdueLoans = await Loan.find({ status: 'overdue', remainingAmount: { $gt: 0 } })
      .populate('clientId', 'name mobileNumber clientNo')
      .sort({ dueDate: 1 })
      .limit(20)
      .lean();

    const overdueRecords = rawOverdueLoans.map(loan => {
      const client = loan.clientId || {};
      const principal = Number(loan.amountTaken) || 0;
      const rate = Number(loan.interestRate) || 10.00;
      const baseInterest = Math.round(principal * (rate / 100) * 100) / 100;
      const dueDate = loan.dueDate || '';
      let daysOverdue = 0, overdueWeeks = 0;
      if (dueDate && todayStr > dueDate) {
        const d1 = new Date(dueDate + 'T00:00:00');
        daysOverdue = Math.max(0, Math.floor((todayDate - d1) / (1000 * 60 * 60 * 24)));
        overdueWeeks = Math.ceil(daysOverdue / 7);
      }
      return {
        recordId: loan._id.toString(),
        amountTaken: principal,
        interestRate: rate,
        interestAmount: Number(loan.interestAmount) || 0,
        totalPayable: Number(loan.totalPayable) || 0,
        remainingAmount: Number(loan.remainingAmount) || 0,
        duration: loan.duration,
        startDate: loan.startDate,
        dueDate,
        status: loan.status,
        clientId: client._id?.toString(),
        clientNo: client.clientNo,
        clientName: client.name,
        mobileNumber: client.mobileNumber,
        baseInterest, daysOverdue, overdueWeeks, overdueInterest: overdueWeeks * baseInterest
      };
    });

    // ── Upcoming dues ─────────────────────────────────────────────────────────
    const upcomingLoans = await Loan.find({
      status: 'active',
      remainingAmount: { $gt: 0 },
      dueDate: { $gte: todayStr, $lte: next7DaysStr }
    }).populate('clientId', 'name mobileNumber').sort({ dueDate: 1 }).limit(10).lean();

    const upcomingDues = upcomingLoans.map(loan => {
      const client = loan.clientId || {};
      return {
        recordId: loan._id.toString(),
        amountTaken: Number(loan.amountTaken),
        interestAmount: Number(loan.interestAmount),
        totalPayable: Number(loan.totalPayable),
        remainingAmount: Number(loan.remainingAmount),
        duration: loan.duration,
        startDate: loan.startDate,
        dueDate: loan.dueDate,
        status: loan.status,
        clientId: client._id?.toString(),
        clientName: client.name,
        mobileNumber: client.mobileNumber
      };
    });

    // ── Recent transactions ───────────────────────────────────────────────────
    const recentTxns = await Transaction.find()
      .populate('clientId', 'name mobileNumber')
      .sort({ transactionDate: -1, _id: -1 })
      .limit(8)
      .lean();

    const recentTransactions = recentTxns.map(t => {
      const client = t.clientId || {};
      return {
        id: t._id.toString(),
        recordId: t.loanId?.toString(),
        clientId: t.clientId?._id?.toString(),
        amount: Number(t.amount),
        transactionType: t.transactionType,
        transactionDate: t.transactionDate,
        remainingAfter: Number(t.remainingAfter),
        note: t.note,
        paymentMode: t.paymentMode,
        clientName: client.name,
        mobileNumber: client.mobileNumber
      };
    });

    // ── Recent reminders ──────────────────────────────────────────────────────
    const recentReminderDocs = await Reminder.find()
      .populate('clientId', 'name')
      .sort({ sentAt: -1 })
      .limit(6)
      .lean();

    const recentReminders = recentReminderDocs.map(r => ({
      id: r._id.toString(),
      loanId: r.loanId?.toString(),
      clientId: r.clientId?._id?.toString(),
      phoneNumber: r.phoneNumber,
      reminderType: r.reminderType,
      dueDate: r.dueDate,
      amount: Number(r.amount),
      message: r.message,
      status: r.status,
      sentAt: r.sentAt,
      errorMessage: r.errorMessage,
      clientName: r.clientId?.name || 'Client'
    }));

    // ── Duration breakdown ────────────────────────────────────────────────────
    const durationBreakdown = [
      { name: 'Weekly (7 Days)', count: (stats.weeklyClients || []).filter(Boolean).length, loanCount: stats.weeklyCount || 0, amount: Number(stats.weeklyAmount) || 0, key: 'weekly' },
      { name: 'Fortnight (14 Days)', count: (stats.fortnightClients || []).filter(Boolean).length, loanCount: stats.fortnightCount || 0, amount: Number(stats.fortnightAmount) || 0, key: 'fortnight' },
      { name: 'Monthly (30 Days)', count: (stats.monthlyClients || []).filter(Boolean).length, loanCount: stats.monthlyCount || 0, amount: Number(stats.monthlyAmount) || 0, key: 'monthly' }
    ];

    return res.json({
      totalClients: totalClients || 0,
      totalRecords: stats.totalRecords || 0,
      activeRecords: stats.activeRecords || 0,
      completedRecords: stats.completedRecords || 0,
      overdueRecordsCount: stats.overdueRecords || 0,
      dueTodayCount: stats.dueTodayRecords || 0,
      dueTomorrowCount: stats.dueTomorrowRecords || 0,
      pendingClientsCount: (stats.pendingClients || []).filter(Boolean).length,
      totalPendingAmount: Number(stats.totalPendingAmount) || 0,
      pendingLoansCount: stats.pendingLoansCount || 0,
      totalAmountGiven,
      totalPrincipal: totalAmountGiven,
      totalInterest,
      totalPayable,
      totalAmountCollected,
      totalRevenue: totalAmountCollected - totalAmountGiven,
      totalOutstandingAmount,
      whatsappSentCount: Number(reminderCounts.sentCount || 0),
      whatsappFailedCount: Number(reminderCounts.failedCount || 0),
      totalRemindersCount: Number(reminderCounts.totalReminders || 0),
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
