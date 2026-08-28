const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const {
  calculateDueDate, getDurationDays, evaluateStatus,
  maskAadhaar, syncLoanBalances, syncAllLoanBalances, updateAllRecordStatuses, getTodayStr
} = require('../db');
const authMiddleware = require('../middleware/auth');
const Client = require('../models/Client');
const Loan = require('../models/Loan');
const Transaction = require('../models/Transaction');
const Reminder = require('../models/Reminder');

// ─── Helper: format loan for response ────────────────────────────────────────
function fmtLoan(loan, todayStr) {
  const principal = Number(loan.amountTaken) || 0;
  const rate = Number(loan.interestRate) || 10.00;
  const baseInterest = Math.round(principal * (rate / 100) * 100) / 100;
  const dueDate = loan.dueDate || '';

  let daysOverdue = 0;
  let overdueWeeks = 0;
  if (dueDate && todayStr > dueDate && Number(loan.remainingAmount) > 0) {
    const d1 = new Date(dueDate + 'T00:00:00');
    const d2 = new Date(todayStr + 'T00:00:00');
    daysOverdue = Math.max(0, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
    overdueWeeks = Math.ceil(daysOverdue / 7);
  }
  const overdueInterest = overdueWeeks * baseInterest;

  return {
    id: loan._id.toString(),
    clientId: loan.clientId?.toString(),
    amountTaken: principal,
    interestRate: rate,
    baseInterest,
    daysOverdue,
    overdueWeeks,
    overdueInterest,
    interestAmount: Number(loan.interestAmount) || baseInterest,
    totalPayable: Number(loan.totalPayable) || (principal + baseInterest),
    duration: loan.duration,
    durationDays: loan.durationDays,
    startDate: loan.startDate,
    dueDate,
    totalPaid: Number(loan.totalPaid) || 0,
    remainingAmount: Number(loan.remainingAmount) || 0,
    status: loan.status,
    note: loan.note,
    createdAt: loan.createdAt,
    updatedAt: loan.updatedAt
  };
}

// ─── GET /api/clients ─────────────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    await updateAllRecordStatuses();

    const { duration, status, search, startDate, endDate, limit = 200, offset = 0 } = req.query;
    const todayStr = getTodayStr();

    const isDirectoryMode = !duration || ['directory', 'all'].includes(duration.toLowerCase());

    if (isDirectoryMode) {
      // Build client base filter (search, date range)
      const clientFilter = {};

      if (startDate) clientFilter.createdAt = { ...clientFilter.createdAt, $gte: new Date(startDate) };
      if (endDate) clientFilter.createdAt = { ...clientFilter.createdAt, $lte: new Date(endDate + 'T23:59:59') };

      if (search && search.trim()) {
        const raw = search.trim();
        const cleanDigits = raw.replace(/\D/g, '');
        const isExplicitId = /^#|^id\s*:?\s*|^client\s*:?\s*/i.test(raw);
        const cleanIdCandidate = raw.replace(/^#|^id\s*:?\s*|^client\s*:?\s*/i, '').trim();
        const isPureDigits = /^\d+$/.test(cleanIdCandidate);
        const parsedId = isPureDigits ? parseInt(cleanIdCandidate, 10) : null;

        if ((isExplicitId || isPureDigits) && parsedId !== null && cleanIdCandidate.length <= 5) {
          clientFilter.$or = [{ clientNo: parsedId }];
        } else if (cleanDigits.length >= 7) {
          clientFilter.mobileNumber = { $regex: cleanDigits, $options: 'i' };
        } else {
          clientFilter.$or = [
            { name: { $regex: raw, $options: 'i' } },
            { mobileNumber: { $regex: cleanDigits || raw, $options: 'i' } },
            { aadhaarNumber: { $regex: cleanDigits || raw, $options: 'i' } }
          ];
        }
      }

      const clients = await Client.find(clientFilter)
        .sort({ clientNo: 1 })
        .skip(Number(offset))
        .limit(Number(limit))
        .lean();

      // Batch load all loans for these clients in 1 single query
      const clientIds = clients.map(c => c._id);
      const allLoans = await Loan.find({ clientId: { $in: clientIds } }).sort({ createdAt: -1 }).lean();
      const loansByClientId = new Map();
      for (const l of allLoans) {
        const cid = l.clientId.toString();
        if (!loansByClientId.has(cid)) loansByClientId.set(cid, []);
        loansByClientId.get(cid).push(l);
      }

      // Enrich each client with their loan stats
      const formatted = [];
      for (const client of clients) {
        const loans = loansByClientId.get(client._id.toString()) || [];

        const activeLoans = loans.filter(l => (l.status === 'active' || l.status === 'overdue') && Number(l.remainingAmount) > 0);
        const primaryLoan = activeLoans[0] || loans[0] || {};

        // Filter by status if specified in query ('active' or 'completed')
        if (status === 'active' && activeLoans.length === 0) continue;
        if (status === 'completed' && (loans.length === 0 || activeLoans.length > 0)) continue;

        const principal = Number(primaryLoan.amountTaken) || 0;
        const rate = Number(primaryLoan.interestRate) || 10;
        const baseInterest = Math.round(principal * (rate / 100) * 100) / 100;
        const dueDate = primaryLoan.dueDate || '';

        let daysOverdue = 0;
        let overdueWeeks = 0;
        if (dueDate && todayStr > dueDate && Number(primaryLoan.remainingAmount) > 0) {
          const d1 = new Date(dueDate + 'T00:00:00');
          const d2 = new Date(todayStr + 'T00:00:00');
          daysOverdue = Math.max(0, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
          overdueWeeks = Math.ceil(daysOverdue / 7);
        }

        const totalGiven = loans.reduce((s, l) => s + Number(l.amountTaken || 0), 0);
        const totalPaid = loans.reduce((s, l) => s + Number(l.totalPaid || 0), 0);
        const totalOutstanding = loans.reduce((s, l) => s + Number(l.remainingAmount || 0), 0);

        formatted.push({
          id: client._id.toString(),
          clientNo: client.clientNo || client._id.toString(),
          displayId: client.clientNo || client._id.toString(),
          name: client.name,
          mobileNumber: client.mobileNumber,
          aadhaarNumber: client.aadhaarNumber,
          maskedAadhaar: maskAadhaar(client.aadhaarNumber),
          address: client.address,
          notes: client.notes,
          createdAt: client.createdAt,
          totalLoansCount: loans.length,
          totalAmountTaken: totalGiven,
          totalPaid: totalPaid,
          totalAmountPaid: totalPaid,
          totalOutstanding: totalOutstanding,
          totalOutstandingAmount: totalOutstanding,
          latestRecordId: primaryLoan._id ? primaryLoan._id.toString() : null,
          amountTaken: principal,
          interestRate: rate,
          interestAmount: Number(primaryLoan.interestAmount) || 0,
          totalPayable: Number(primaryLoan.totalPayable) || 0,
          duration: primaryLoan.duration,
          durationDays: primaryLoan.durationDays,
          startDate: primaryLoan.startDate,
          dueDate,
          loanTotalPaid: Number(primaryLoan.totalPaid) || 0,
          remainingAmount: Number(primaryLoan.remainingAmount) || 0,
          loanStatus: primaryLoan.status || (loans.length === 0 ? 'no_loan' : 'completed'),
          status: primaryLoan.status || (loans.length === 0 ? 'no_loan' : 'completed'),
          baseInterest,
          daysOverdue,
          overdueWeeks,
          overdueInterest: overdueWeeks * baseInterest
        });
      }

      return res.json({ clients: formatted, count: formatted.length });
    }

    // Specific loan duration / status filters: overdue, due-tomorrow, weekly, fortnight, monthly, completed/history
    const loanFilter = {};
    const dur = duration.toLowerCase();

    if (['overdue'].includes(dur)) {
      loanFilter.$or = [{ status: 'overdue' }, { dueDate: { $lt: todayStr } }];
      loanFilter.remainingAmount = { $gt: 0 };
      loanFilter.status = { $ne: 'completed' };
    } else if (['due-tomorrow', 'due_tomorrow'].includes(dur)) {
      const tomorrow = new Date(todayStr + 'T00:00:00');
      tomorrow.setDate(tomorrow.getDate() + 1);
      const y = tomorrow.getFullYear();
      const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const d = String(tomorrow.getDate()).padStart(2, '0');
      const tomorrowStr = `${y}-${m}-${d}`;
      loanFilter.dueDate = tomorrowStr;
      loanFilter.remainingAmount = { $gt: 0 };
      loanFilter.status = { $ne: 'completed' };
    } else if (['completed', 'paid', 'history'].includes(dur)) {
      loanFilter.$or = [{ remainingAmount: 0 }, { status: 'completed' }];
    } else if (['weekly', 'fortnight', 'monthly'].includes(dur)) {
      loanFilter.duration = dur;
      if (status && status !== 'all') {
        loanFilter.status = status;
      } else {
        loanFilter.status = { $ne: 'completed' };
        loanFilter.remainingAmount = { $gt: 0 };
      }
    }

    // If client search filter applied
    if (search && search.trim()) {
      const raw = search.trim();
      const cleanDigits = raw.replace(/\D/g, '');
      const isExplicitId = /^#|^id\s*:?\s*|^client\s*:?\s*/i.test(raw);
      const cleanIdCandidate = raw.replace(/^#|^id\s*:?\s*|^client\s*:?\s*/i, '').trim();
      const isPureDigits = /^\d+$/.test(cleanIdCandidate);
      const parsedId = isPureDigits ? parseInt(cleanIdCandidate, 10) : null;

      const clientSearchQuery = {};
      if ((isExplicitId || isPureDigits) && parsedId !== null && cleanIdCandidate.length <= 5) {
        clientSearchQuery.$or = [{ clientNo: parsedId }];
      } else if (cleanDigits.length >= 7) {
        clientSearchQuery.mobileNumber = { $regex: cleanDigits, $options: 'i' };
      } else {
        clientSearchQuery.$or = [
          { name: { $regex: raw, $options: 'i' } },
          { mobileNumber: { $regex: cleanDigits || raw, $options: 'i' } },
          { aadhaarNumber: { $regex: cleanDigits || raw, $options: 'i' } }
        ];
      }
      const matchedClients = await Client.find(clientSearchQuery, '_id').lean();
      loanFilter.clientId = { $in: matchedClients.map(c => c._id) };
    }

    const loans = await Loan.find(loanFilter)
      .populate('clientId')
      .sort(dur === 'overdue' ? { dueDate: 1 } : { createdAt: -1 })
      .skip(Number(offset))
      .limit(Number(limit))
      .lean();

    const formatted = loans.map(loan => {
      const client = loan.clientId || {};
      const principal = Number(loan.amountTaken) || 0;
      const rate = Number(loan.interestRate) || 10;
      const baseInterest = Math.round(principal * (rate / 100) * 100) / 100;
      const dueDate = loan.dueDate || '';

      let daysOverdue = 0;
      let overdueWeeks = 0;
      if (dueDate && todayStr > dueDate && Number(loan.remainingAmount) > 0) {
        const d1 = new Date(dueDate + 'T00:00:00');
        const d2 = new Date(todayStr + 'T00:00:00');
        daysOverdue = Math.max(0, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
        overdueWeeks = Math.ceil(daysOverdue / 7);
      }

      return {
        id: client._id?.toString() || loan._id.toString(),
        clientNo: client.clientNo || client._id?.toString(),
        displayId: client.clientNo || client._id?.toString(),
        name: client.name || 'Unknown',
        mobileNumber: client.mobileNumber || '',
        aadhaarNumber: client.aadhaarNumber || '',
        maskedAadhaar: maskAadhaar(client.aadhaarNumber),
        address: client.address || '',
        notes: client.notes || '',
        createdAt: client.createdAt,
        latestRecordId: loan._id.toString(),
        amountTaken: principal,
        interestRate: rate,
        interestAmount: Number(loan.interestAmount) || baseInterest,
        totalPayable: Number(loan.totalPayable) || (principal + baseInterest),
        duration: loan.duration,
        durationDays: loan.durationDays,
        startDate: loan.startDate,
        dueDate,
        loanTotalPaid: Number(loan.totalPaid) || 0,
        totalPaid: Number(loan.totalPaid) || 0,
        remainingAmount: Number(loan.remainingAmount) || 0,
        loanStatus: loan.status,
        status: loan.status,
        baseInterest,
        daysOverdue,
        overdueWeeks,
        overdueInterest: overdueWeeks * baseInterest
      };
    });

    return res.json({ clients: formatted, count: formatted.length });
  } catch (err) {
    console.error('Clients fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch clients: ' + err.message });
  }
});

// ─── GET /api/clients/search/:query ──────────────────────────────────────────
router.get('/search/:query', authMiddleware, async (req, res) => {
  try {
    await updateAllRecordStatuses();
    const rawQuery = req.params.query.trim();
    const cleanDigits = rawQuery.replace(/\D/g, '');
    const isExplicitId = /^#|^id\s*:?\s*|^client\s*:?\s*/i.test(rawQuery);
    const cleanIdCandidate = rawQuery.replace(/^#|^id\s*:?\s*|^client\s*:?\s*/i, '').trim();
    const isPureDigits = /^\d+$/.test(cleanIdCandidate);
    const parsedId = isPureDigits ? parseInt(cleanIdCandidate, 10) : null;

    let clientFilter = {};
    if ((isExplicitId || isPureDigits) && parsedId !== null && cleanIdCandidate.length <= 5) {
      clientFilter = { clientNo: parsedId };
    } else if (cleanDigits.length >= 7) {
      clientFilter = { $or: [{ mobileNumber: { $regex: cleanDigits, $options: 'i' } }, { aadhaarNumber: { $regex: cleanDigits, $options: 'i' } }] };
    } else {
      clientFilter = { $or: [
        { name: { $regex: rawQuery, $options: 'i' } },
        { mobileNumber: { $regex: cleanDigits || rawQuery, $options: 'i' } },
        { aadhaarNumber: { $regex: cleanDigits || rawQuery, $options: 'i' } }
      ]};
    }

    const clients = await Client.find(clientFilter).limit(25).lean();
    if (clients.length === 0) return res.json({ results: [] });

    // Batch load loans for all search result clients
    const clientIds = clients.map(c => c._id);
    const allLoans = await Loan.find({ clientId: { $in: clientIds } }).sort({ createdAt: -1 }).lean();
    const loansByClientId = new Map();
    for (const l of allLoans) {
      const cid = l.clientId.toString();
      if (!loansByClientId.has(cid)) loansByClientId.set(cid, []);
      loansByClientId.get(cid).push(l);
    }

    const results = [];
    for (const c of clients) {
      const loans = loansByClientId.get(c._id.toString()) || [];
      const totalLoansCount = loans.length;
      const totalAmountTaken = loans.reduce((s, l) => s + (Number(l.amountTaken) || 0), 0);
      const totalPaid = loans.reduce((s, l) => s + (Number(l.totalPaid) || 0), 0);
      const totalOutstanding = loans.reduce((s, l) => s + (Number(l.remainingAmount) || 0), 0);

      results.push({
        id: c._id.toString(),
        clientNo: c.clientNo,
        displayId: c.clientNo,
        name: c.name,
        mobileNumber: c.mobileNumber,
        aadhaarNumber: c.aadhaarNumber,
        maskedAadhaar: maskAadhaar(c.aadhaarNumber),
        address: c.address,
        notes: c.notes,
        totalLoansCount,
        totalAmountTaken,
        totalPaid,
        totalOutstanding,
        records: loans.map(l => ({
          id: l._id.toString(),
          clientId: l.clientId.toString(),
          amountTaken: l.amountTaken,
          duration: l.duration,
          durationDays: l.durationDays,
          start_date: l.startDate,
          due_date: l.dueDate,
          totalPaid: l.totalPaid,
          remainingAmount: l.remainingAmount,
          status: l.status,
          note: l.note,
          createdAt: l.createdAt
        }))
      });
    }

    return res.json({ results });
  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: 'Search failed: ' + err.message });
  }
});

// ─── GET /api/clients/:id ─────────────────────────────────────────────────────
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    await updateAllRecordStatuses();
    const todayStr = getTodayStr();
    const clientId = req.params.id;

    let client;
    if (mongoose.Types.ObjectId.isValid(clientId)) {
      client = await Client.findById(clientId).lean();
    }
    if (!client) {
      const parsed = parseInt(clientId, 10);
      if (!isNaN(parsed)) client = await Client.findOne({ clientNo: parsed }).lean();
    }
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    // Fetch loans, transactions, and reminders in parallel (3 fast indexed queries)
    const [loans, allTransactions, allReminders] = await Promise.all([
      Loan.find({ clientId: client._id }).sort({ createdAt: -1 }).lean(),
      Transaction.find({ clientId: client._id }).sort({ transactionDate: 1, _id: 1 }).lean(),
      Reminder.find({ clientId: client._id }).sort({ sentAt: -1 }).limit(50).lean()
    ]);

    // Group transactions and reminders by loanId in memory
    const txnsByLoanId = new Map();
    for (const t of allTransactions) {
      const lid = t.loanId.toString();
      if (!txnsByLoanId.has(lid)) txnsByLoanId.set(lid, []);
      txnsByLoanId.get(lid).push(t);
    }

    const remindersByLoanId = new Map();
    for (const r of allReminders) {
      const lid = r.loanId ? r.loanId.toString() : '';
      if (lid) {
        if (!remindersByLoanId.has(lid)) remindersByLoanId.set(lid, []);
        remindersByLoanId.get(lid).push(r);
      }
    }

    let lifetimeGiven = 0, lifetimeInterest = 0, lifetimeTotalPayable = 0, lifetimePaid = 0, lifetimeRemaining = 0;
    const loansWithTransactions = [];

    for (const loan of loans) {
      const transactions = txnsByLoanId.get(loan._id.toString()) || [];
      const reminders = remindersByLoanId.get(loan._id.toString()) || [];

      const loanObj = {
        ...fmtLoan(loan, todayStr),
        transactions: transactions.map(t => ({
          id: t._id.toString(),
          recordId: t.loanId.toString(),
          clientId: t.clientId.toString(),
          amount: Number(t.amount),
          transactionType: t.transactionType,
          transactionDate: t.transactionDate,
          remainingAfter: Number(t.remainingAfter),
          paymentMode: t.paymentMode,
          note: t.note,
          createdAt: t.createdAt
        })),
        reminders: reminders.map(r => ({
          id: r._id.toString(),
          loanId: r.loanId.toString(),
          clientId: r.clientId.toString(),
          phoneNumber: r.phoneNumber,
          reminderType: r.reminderType,
          channel: r.channel,
          dueDate: r.dueDate,
          amount: Number(r.amount),
          message: r.message,
          status: r.status,
          sentAt: r.sentAt,
          whatsappMessageId: r.whatsappMessageId,
          errorMessage: r.errorMessage
        }))
      };

      lifetimeGiven += loanObj.amountTaken;
      lifetimeInterest += loanObj.interestAmount;
      lifetimeTotalPayable += loanObj.totalPayable;
      lifetimePaid += loanObj.totalPaid;
      lifetimeRemaining += loanObj.remainingAmount;
      loansWithTransactions.push(loanObj);
    }

    const activeLoans = loansWithTransactions.filter(l => (l.status === 'active' || l.status === 'overdue') && l.remainingAmount > 0);
    const previousLoans = loansWithTransactions.filter(l => !activeLoans.find(al => al.id === l.id));

    return res.json({
      client: {
        id: client._id.toString(),
        clientNo: client.clientNo,
        displayId: client.clientNo,
        name: client.name,
        mobileNumber: client.mobileNumber,
        aadhaarNumber: client.aadhaarNumber,
        maskedAadhaar: maskAadhaar(client.aadhaarNumber),
        address: client.address,
        notes: client.notes,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt
      },
      activeLoan: activeLoans[0] || (loansWithTransactions.length > 0 ? loansWithTransactions[0] : null),
      activeLoans,
      previousLoans,
      loanRecords: loansWithTransactions,
      reminders: allReminders.map(r => ({
        id: r._id.toString(),
        loanId: r.loanId ? r.loanId.toString() : null,
        clientId: r.clientId ? r.clientId.toString() : null,
        phoneNumber: r.phoneNumber,
        reminderType: r.reminderType,
        channel: r.channel || 'whatsapp',
        dueDate: r.dueDate,
        amount: Number(r.amount),
        message: r.message,
        status: r.status,
        sentAt: r.sentAt,
        whatsappMessageId: r.whatsappMessageId,
        errorMessage: r.errorMessage
      })),
      stats: { totalLoans: loansWithTransactions.length, lifetimeGiven, lifetimeInterest, lifetimeTotalPayable, lifetimePaid, lifetimeRemaining }
    });
  } catch (err) {
    console.error('Client detail error:', err);
    return res.status(500).json({ error: 'Failed to fetch client details: ' + err.message });
  }
});

// ─── GET /api/clients/:id/export-csv ─────────────────────────────────────────
router.get('/:id/export-csv', authMiddleware, async (req, res) => {
  try {
    const clientId = req.params.id;
    let client;
    if (mongoose.Types.ObjectId.isValid(clientId)) client = await Client.findById(clientId).lean();
    if (!client) { const p = parseInt(clientId, 10); if (!isNaN(p)) client = await Client.findOne({ clientNo: p }).lean(); }
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    const loans = await Loan.find({ clientId: client._id }).sort({ createdAt: -1 }).lean();
    const esc = (v) => { if (v == null) return '""'; return `"${String(v).replace(/"/g, '""')}"`; };

    const headers = ['Client ID','Client Name','Mobile Number','Aadhaar Number','Address','Loan ID','Loan Duration','Loan Start Date','Loan Due Date','Loan Principal (INR)','Loan Interest Rate (%)','Loan Interest (INR)','Loan Total Payable (INR)','Loan Current Status','Transaction ID','Transaction Date','Transaction Type','Transaction Amount (INR)','Payment Mode','Remaining Balance After (INR)','Transaction Note'];
    const rows = [];

    if (loans.length === 0) {
      rows.push([esc(client.clientNo), esc(client.name), esc(client.mobileNumber), esc(client.aadhaarNumber || 'N/A'), esc(client.address || ''), '""','""','""','""','""','""','""','""','""','""','""','""','""','""','""', esc('No loan records found')]);
    } else {
      for (const loan of loans) {
        const transactions = await Transaction.find({ loanId: loan._id }).sort({ transactionDate: 1 }).lean();
        const principal = Number(loan.amountTaken || 0);
        const rate = Number(loan.interestRate || 10);
        const interest = Number(loan.interestAmount || (principal * rate / 100));
        const payable = Number(loan.totalPayable || (principal + interest));

        if (transactions.length === 0) {
          rows.push([esc(client.clientNo), esc(client.name), esc(client.mobileNumber), esc(client.aadhaarNumber || 'N/A'), esc(client.address || ''), esc(`#${loan._id}`), esc(loan.duration), esc(loan.startDate), esc(loan.dueDate), esc(principal), esc(`${rate}%`), esc(interest), esc(payable), esc((loan.status || '').toUpperCase()), '""', '""', '""', '""', '""', '""', '""']);
        } else {
          for (const t of transactions) {
            rows.push([esc(client.clientNo), esc(client.name), esc(client.mobileNumber), esc(client.aadhaarNumber || 'N/A'), esc(client.address || ''), esc(`#${loan._id}`), esc(loan.duration), esc(loan.startDate), esc(loan.dueDate), esc(principal), esc(`${rate}%`), esc(interest), esc(payable), esc((loan.status || '').toUpperCase()), esc(`#${t._id}`), esc(t.transactionDate), esc((t.transactionType || '').toUpperCase()), esc(t.amount), esc(t.paymentMode || 'Cash'), esc(t.remainingAfter), esc(t.note || '')]);
          }
        }
      }
    }

    const csv = '\uFEFF' + [headers.map(h => `"${h}"`).join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const safeClientName = client.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Client_${client.clientNo}_${safeClientName}_Transactions_${getTodayStr()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to export transactions CSV: ' + err.message });
  }
});

// ─── POST /api/clients ────────────────────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  const {
    name, mobileNumber, aadhaarNumber, address, notes,
    amountTaken, duration, startDate = getTodayStr(), paymentMode = 'Cash'
  } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'Client name is required.' });

  const cleanMobile = (mobileNumber || '').replace(/\D/g, '');
  if (!cleanMobile || cleanMobile.length < 10) return res.status(400).json({ error: 'Valid 10-digit mobile number is required.' });

  const parsedAmount = parseFloat(amountTaken);
  if (isNaN(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ error: 'Amount taken must be greater than 0.' });

  if (!duration || !['weekly', 'fortnight', 'monthly'].includes(duration.toLowerCase())) {
    return res.status(400).json({ error: 'Valid duration is required (weekly, fortnight, monthly).' });
  }

  const cleanAadhaar = aadhaarNumber ? aadhaarNumber.replace(/\D/g, '') : null;
  if (cleanAadhaar && cleanAadhaar.length !== 12) return res.status(400).json({ error: 'Aadhaar number must be exactly 12 digits.' });

  try {
    const existing = await Client.findOne({ mobileNumber: cleanMobile });
    if (existing) {
      return res.status(400).json({
        error: `A client with mobile number ${cleanMobile} already exists. Use "Add New Loan" to create a new financial record for this client.`,
        existingClientId: existing._id.toString()
      });
    }

    const selectedDuration = duration.toLowerCase();
    const dueDate = calculateDueDate(startDate, selectedDuration);
    const durationDays = getDurationDays(selectedDuration);
    const interestRate = 10.00;
    const interestAmount = Math.round(parsedAmount * (interestRate / 100) * 100) / 100;
    const totalPayable = parsedAmount + interestAmount;
    const initialStatus = evaluateStatus(totalPayable, dueDate);

    const client = await Client.create({
      name: name.trim(), mobileNumber: cleanMobile,
      aadhaarNumber: cleanAadhaar, address: address || '', notes: notes || ''
    });

    const loan = await Loan.create({
      clientId: client._id,
      amountTaken: parsedAmount, interestRate, interestAmount, totalPayable,
      duration: selectedDuration, durationDays, startDate, dueDate,
      totalPaid: 0, remainingAmount: totalPayable, status: initialStatus,
      note: 'Initial loan record'
    });

    await Transaction.create({
      loanId: loan._id, clientId: client._id,
      amount: parsedAmount, transactionType: 'disbursement',
      transactionDate: startDate, remainingAfter: totalPayable,
      paymentMode, note: 'Initial loan disbursement'
    });

    return res.status(201).json({
      message: 'Client created successfully with initial loan record and 10% interest applied',
      clientId: client._id.toString(),
      clientNo: client.clientNo,
      displayId: client.clientNo,
      recordId: loan._id.toString(),
      principalAmount: parsedAmount, interestRate, interestAmount, totalPayable, dueDate,
      duration: selectedDuration
    });
  } catch (err) {
    console.error('Error creating client:', err);
    if (err.code === 11000) return res.status(400).json({ error: 'A client with this mobile number already exists.' });
    return res.status(500).json({ error: 'Failed to create client: ' + err.message });
  }
});

// ─── POST /api/clients/:id/loans ─────────────────────────────────────────────
router.post('/:id/loans', authMiddleware, async (req, res) => {
  const clientId = req.params.id;
  const { amountTaken, duration, startDate = getTodayStr(), paymentMode = 'Cash', note } = req.body;

  try {
    if (!mongoose.Types.ObjectId.isValid(clientId)) return res.status(400).json({ error: 'Invalid client ID.' });
    const client = await Client.findById(clientId);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    const parsedAmount = parseFloat(amountTaken);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ error: 'Amount taken must be greater than 0.' });
    if (!duration || !['weekly', 'fortnight', 'monthly'].includes(duration.toLowerCase())) {
      return res.status(400).json({ error: 'Valid duration is required (weekly, fortnight, monthly).' });
    }

    const selectedDuration = duration.toLowerCase();
    const dueDate = calculateDueDate(startDate, selectedDuration);
    const durationDays = getDurationDays(selectedDuration);
    const interestRate = 10.00;
    const interestAmount = Math.round(parsedAmount * (interestRate / 100) * 100) / 100;
    const totalPayable = parsedAmount + interestAmount;
    const initialStatus = evaluateStatus(totalPayable, dueDate);

    const loan = await Loan.create({
      clientId: client._id,
      amountTaken: parsedAmount, interestRate, interestAmount, totalPayable,
      duration: selectedDuration, durationDays, startDate, dueDate,
      totalPaid: 0, remainingAmount: totalPayable, status: initialStatus,
      note: note || 'New loan cycle'
    });

    await Transaction.create({
      loanId: loan._id, clientId: client._id,
      amount: parsedAmount, transactionType: 'disbursement',
      transactionDate: startDate, remainingAfter: totalPayable,
      paymentMode, note: note || 'Loan disbursement'
    });

    return res.status(201).json({
      message: 'New loan record added successfully with 10% interest applied',
      recordId: loan._id.toString(),
      principalAmount: parsedAmount, interestRate, interestAmount, totalPayable, dueDate,
      duration: selectedDuration
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to add loan record: ' + err.message });
  }
});

// ─── PUT /api/clients/:id ─────────────────────────────────────────────────────
router.put('/:id', authMiddleware, async (req, res) => {
  const clientId = req.params.id;
  const { name, mobileNumber, aadhaarNumber, address, notes } = req.body;

  try {
    if (!mongoose.Types.ObjectId.isValid(clientId)) return res.status(400).json({ error: 'Invalid client ID.' });
    const existing = await Client.findById(clientId);
    if (!existing) return res.status(404).json({ error: 'Client not found.' });

    const cleanMobile = mobileNumber ? mobileNumber.replace(/\D/g, '') : existing.mobileNumber;
    if (cleanMobile && cleanMobile.length < 10) return res.status(400).json({ error: 'Valid 10-digit mobile number required.' });

    if (cleanMobile !== existing.mobileNumber) {
      const collision = await Client.findOne({ mobileNumber: cleanMobile, _id: { $ne: existing._id } });
      if (collision) return res.status(400).json({ error: 'Another client is already registered with this mobile number.' });
    }

    let cleanAadhaar = existing.aadhaarNumber;
    if (aadhaarNumber !== undefined) {
      cleanAadhaar = aadhaarNumber ? aadhaarNumber.replace(/\D/g, '') : null;
      if (cleanAadhaar && cleanAadhaar.length !== 12) return res.status(400).json({ error: 'Aadhaar number must be 12 digits.' });
    }

    await Client.findByIdAndUpdate(clientId, {
      name: name ? name.trim() : existing.name,
      mobileNumber: cleanMobile,
      aadhaarNumber: cleanAadhaar,
      address: address !== undefined ? address : existing.address,
      notes: notes !== undefined ? notes : existing.notes
    });

    return res.json({ message: 'Client details updated successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Update failed: ' + err.message });
  }
});

// ─── PUT /api/clients/loans/:id ──────────────────────────────────────────────
router.put('/loans/:id', authMiddleware, async (req, res) => {
  const loanId = req.params.id;
  const { amountTaken, duration, startDate, note } = req.body;

  try {
    if (!mongoose.Types.ObjectId.isValid(loanId)) return res.status(400).json({ error: 'Invalid loan ID.' });
    const loan = await Loan.findById(loanId);
    if (!loan) return res.status(404).json({ error: 'Loan record not found.' });

    const parsedAmount = amountTaken !== undefined ? parseFloat(amountTaken) : Number(loan.amountTaken);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ error: 'Amount taken must be greater than 0.' });

    const newDuration = (duration || loan.duration).toLowerCase();
    if (!['weekly', 'fortnight', 'monthly'].includes(newDuration)) return res.status(400).json({ error: 'Invalid duration specified.' });

    const newStartDate = startDate || loan.startDate;
    const newDueDate = calculateDueDate(newStartDate, newDuration);
    const durationDays = getDurationDays(newDuration);
    const interestRate = 10.00;
    const interestAmount = Math.round(parsedAmount * (interestRate / 100) * 100) / 100;
    const totalPayable = parsedAmount + interestAmount;

    await Loan.findByIdAndUpdate(loanId, {
      amountTaken: parsedAmount, interestRate, interestAmount, totalPayable,
      duration: newDuration, durationDays, startDate: newStartDate, dueDate: newDueDate,
      note: note !== undefined ? note : loan.note
    });

    // Update initial disbursement transaction
    await Transaction.findOneAndUpdate(
      { loanId: loan._id, transactionType: 'disbursement' },
      { amount: parsedAmount, transactionDate: newStartDate }
    );

    const syncResult = await syncLoanBalances(loanId);

    return res.json({ message: 'Loan record updated successfully with 10% interest recalculated', syncResult });
  } catch (err) {
    console.error('Error updating loan:', err);
    return res.status(500).json({ error: 'Failed to update loan: ' + err.message });
  }
});

// ─── DELETE /api/clients/loans/:id ───────────────────────────────────────────
router.delete('/loans/:id', authMiddleware, async (req, res) => {
  const loanId = req.params.id;
  try {
    if (!mongoose.Types.ObjectId.isValid(loanId)) return res.status(400).json({ error: 'Invalid loan ID.' });
    const loan = await Loan.findById(loanId);
    if (!loan) return res.status(404).json({ error: 'Loan record not found.' });

    await Transaction.deleteMany({ loanId: loan._id });
    await Reminder.deleteMany({ loanId: loan._id });
    await Loan.findByIdAndDelete(loanId);

    return res.json({ message: `Loan record and associated transactions deleted successfully.` });
  } catch (err) {
    console.error('Error deleting loan:', err);
    return res.status(500).json({ error: 'Failed to delete loan: ' + err.message });
  }
});

// ─── DELETE /api/clients/:id ──────────────────────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
  const clientId = req.params.id;
  try {
    if (!mongoose.Types.ObjectId.isValid(clientId)) return res.status(400).json({ error: 'Invalid client ID.' });
    const client = await Client.findById(clientId);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    // Cascade delete
    const loans = await Loan.find({ clientId: client._id }, '_id').lean();
    const loanIds = loans.map(l => l._id);
    await Transaction.deleteMany({ loanId: { $in: loanIds } });
    await Reminder.deleteMany({ clientId: client._id });
    await Loan.deleteMany({ clientId: client._id });
    await Client.findByIdAndDelete(clientId);

    return res.json({ message: `Client ${client.name} and all related records deleted successfully.` });
  } catch (err) {
    return res.status(500).json({ error: 'Delete failed: ' + err.message });
  }
});

module.exports = router;
