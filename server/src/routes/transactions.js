const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { evaluateStatus, syncLoanBalances, calculateDueDate, getTodayStr } = require('../db');
const authMiddleware = require('../middleware/auth');
const Loan = require('../models/Loan');
const Transaction = require('../models/Transaction');
const Client = require('../models/Client');

// GET /api/transactions - Global transaction history with filters
router.get('/', authMiddleware, async (req, res) => {
  try {
    const {
      type,
      startDate,
      endDate,
      search,
      limit = 200,
      offset = 0
    } = req.query;

    // Build match filter
    const match = {};
    if (type && ['payment', 'disbursement', 'penalty', 'adjustment'].includes(type)) {
      match.transactionType = type;
    }
    if (startDate) match.transactionDate = { ...match.transactionDate, $gte: startDate };
    if (endDate) match.transactionDate = { ...match.transactionDate, $lte: endDate };

    // Aggregation pipeline with client and loan joins
    const pipeline = [
      { $match: match },
      { $lookup: { from: 'clients', localField: 'clientId', foreignField: '_id', as: 'client' } },
      { $lookup: { from: 'loans', localField: 'loanId', foreignField: '_id', as: 'loan' } },
      { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$loan', preserveNullAndEmptyArrays: true } }
    ];

    if (search && search.trim()) {
      const term = search.trim();
      pipeline.push({
        $match: {
          $or: [
            { 'client.name': { $regex: term, $options: 'i' } },
            { 'client.mobileNumber': { $regex: term, $options: 'i' } },
            { note: { $regex: term, $options: 'i' } }
          ]
        }
      });
    }

    // Total count and summary (before pagination)
    const summaryPipeline = [...pipeline, {
      $group: {
        _id: null,
        totalCount: { $sum: 1 },
        totalCollected: {
          $sum: { $cond: [{ $eq: ['$transactionType', 'payment'] }, '$amount', 0] }
        },
        totalDisbursed: {
          $sum: { $cond: [{ $eq: ['$transactionType', 'disbursement'] }, '$amount', 0] }
        }
      }
    }];

    const [summaryResult, transactions] = await Promise.all([
      Transaction.aggregate(summaryPipeline),
      Transaction.aggregate([
        ...pipeline,
        { $sort: { transactionDate: -1, _id: -1 } },
        { $skip: Number(offset) },
        { $limit: Number(limit) },
        {
          $project: {
            id: '$_id',
            recordId: '$loanId',
            clientId: 1,
            amount: 1,
            transactionType: 1,
            transactionDate: 1,
            remainingAfter: 1,
            paymentMode: 1,
            note: 1,
            createdAt: 1,
            clientName: '$client.name',
            mobileNumber: '$client.mobileNumber',
            duration: '$loan.duration',
            loanAmount: '$loan.amountTaken',
            loanDueDate: '$loan.dueDate',
            loanStatus: '$loan.status'
          }
        }
      ])
    ]);

    const summary = summaryResult[0] || { totalCount: 0, totalCollected: 0, totalDisbursed: 0 };

    return res.json({
      transactions,
      summary: {
        totalCount: summary.totalCount,
        totalCollected: Number(summary.totalCollected) || 0,
        totalDisbursed: Number(summary.totalDisbursed) || 0
      }
    });
  } catch (err) {
    console.error('Transactions fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch transactions: ' + err.message });
  }
});

// POST /api/transactions - Add a transaction / payment
router.post('/', authMiddleware, async (req, res) => {
    const {
      recordId,
      amount,
      transactionType = 'payment',
      transactionDate = getTodayStr(),
      paymentMode = 'Cash',
      note,
      isInterestRenewal = false,
      extendDueDate = false,
      markAsPendingAndComplete = false
    } = req.body;

    if (!recordId) {
      return res.status(400).json({ error: 'Record ID is required.' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Valid amount greater than 0 is required.' });
    }

    try {
      if (!mongoose.Types.ObjectId.isValid(recordId)) {
        return res.status(400).json({ error: 'Invalid loan record ID.' });
      }

      const loan = await Loan.findById(recordId);
      if (!loan) {
        return res.status(404).json({ error: 'Loan record not found.' });
      }

      if (transactionType === 'payment') {
        if (Number(loan.remainingAmount) <= 0) {
          return res.status(400).json({ error: 'This loan record is already fully settled (Remaining: ₹0).' });
        }
        if (parsedAmount > Number(loan.remainingAmount) && !isInterestRenewal) {
          return res.status(400).json({
            error: `Payment amount (₹${parsedAmount}) cannot exceed the remaining balance of ₹${Number(loan.remainingAmount)}.`
          });
        }
      }

      const shouldExtend = isInterestRenewal || extendDueDate || (note && note.toLowerCase().includes('interest payment'));
      let newDueDate = loan.dueDate;

      if (shouldExtend) {
        newDueDate = calculateDueDate(loan.dueDate, loan.duration);
        await Loan.findByIdAndUpdate(loan._id, { dueDate: newDueDate });
      }

      let projectedRemaining = Number(loan.remainingAmount);
      if (shouldExtend) {
        const activePrincipal = Number(loan.amountTaken);
        const rate = Number(loan.interestRate) || 10;
        const newCycleInterest = Math.round(activePrincipal * (rate / 100) * 100) / 100;
        projectedRemaining = activePrincipal + newCycleInterest;
      } else if (transactionType === 'payment' || transactionType === 'adjustment') {
        projectedRemaining = Math.max(0, projectedRemaining - parsedAmount);
      } else if (transactionType === 'penalty') {
        projectedRemaining = projectedRemaining + parsedAmount;
      }

      const finalNote = note || (shouldExtend
        ? `10% Interest Payment (Loan cycle renewed by +1 ${loan.duration || 'period'} to ${newDueDate})`
        : (transactionType === 'payment' ? 'Repayment installment' : 'Adjustment'));

      const txn = await Transaction.create({
        loanId: loan._id,
        clientId: loan.clientId,
        amount: parsedAmount,
        transactionType,
        transactionDate,
        remainingAfter: markAsPendingAndComplete ? 0 : projectedRemaining,
        paymentMode,
        note: finalNote
      });

      let pendingAmountMarked = 0;
      if (markAsPendingAndComplete && transactionType === 'payment' && !shouldExtend && projectedRemaining > 0) {
        pendingAmountMarked = projectedRemaining;
        // Record adjustment transaction to clear remaining balance for loan completion
        await Transaction.create({
          loanId: loan._id,
          clientId: loan.clientId,
          amount: pendingAmountMarked,
          transactionType: 'adjustment',
          transactionDate,
          remainingAfter: 0,
          paymentMode,
          note: `Settlement Discount / Remaining ₹${pendingAmountMarked} marked as pending (Loan completed)`
        });

        await Loan.findByIdAndUpdate(loan._id, {
          pendingAmount: pendingAmountMarked,
          isSettledPending: true,
          remainingAmount: 0,
          status: 'completed'
        });
      }

      // Recalculate exact loan balance from all transactions
      const syncResult = await syncLoanBalances(loan._id);

      if (markAsPendingAndComplete && pendingAmountMarked > 0) {
        await Loan.findByIdAndUpdate(loan._id, {
          pendingAmount: pendingAmountMarked,
          isSettledPending: true,
          remainingAmount: 0,
          status: 'completed'
        });
      }

      return res.status(201).json({
        message: markAsPendingAndComplete && pendingAmountMarked > 0
          ? `Payment of ₹${parsedAmount} recorded and loan completed with ₹${pendingAmountMarked} marked as pending.`
          : shouldExtend
          ? `Interest payment recorded! Loan cycle renewed until ${newDueDate}.`
          : 'Transaction recorded successfully',
        txnId: txn._id.toString(),
        newDueDate,
        newTotalPaid: syncResult?.totalPaid ?? (Number(loan.totalPaid) + parsedAmount),
        newRemaining: markAsPendingAndComplete ? 0 : (syncResult?.remainingAmount ?? projectedRemaining),
        newStatus: markAsPendingAndComplete ? 'completed' : (syncResult?.status || evaluateStatus(projectedRemaining, newDueDate)),
        pendingAmount: pendingAmountMarked
      });
    } catch (err) {
      console.error('Error adding transaction:', err);
      return res.status(500).json({ error: 'Failed to record transaction: ' + err.message });
    }
  });

// PUT /api/transactions/:id - Edit an existing transaction
router.put('/:id', authMiddleware, async (req, res) => {
  const txnId = req.params.id;
  const { amount, paymentMode, note, transactionDate } = req.body;

  try {
    if (!mongoose.Types.ObjectId.isValid(txnId)) {
      return res.status(400).json({ error: 'Invalid transaction ID.' });
    }

    const txn = await Transaction.findById(txnId);
    if (!txn) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    const parsedAmount = amount !== undefined ? parseFloat(amount) : Number(txn.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0.' });
    }

    await Transaction.findByIdAndUpdate(txnId, {
      amount: parsedAmount,
      paymentMode: paymentMode || txn.paymentMode,
      note: note !== undefined ? note : txn.note,
      transactionDate: transactionDate || txn.transactionDate
    });

    const syncResult = await syncLoanBalances(txn.loanId);

    return res.json({
      message: 'Transaction updated successfully',
      syncResult
    });
  } catch (err) {
    console.error('Error updating transaction:', err);
    return res.status(500).json({ error: 'Failed to update transaction: ' + err.message });
  }
});

// DELETE /api/transactions/:id - Reverse/Delete a transaction
router.delete('/:id', authMiddleware, async (req, res) => {
  const txnId = req.params.id;
  try {
    if (!mongoose.Types.ObjectId.isValid(txnId)) {
      return res.status(400).json({ error: 'Invalid transaction ID.' });
    }

    const txn = await Transaction.findById(txnId);
    if (!txn) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    if (txn.transactionType === 'disbursement') {
      return res.status(400).json({ error: 'Initial loan disbursement cannot be deleted directly without deleting the loan.' });
    }

    const loanId = txn.loanId;
    await Transaction.findByIdAndDelete(txnId);

    const syncResult = await syncLoanBalances(loanId);

    return res.json({
      message: 'Transaction deleted and loan balance recalculated successfully.',
      newTotalPaid: syncResult?.totalPaid || 0,
      newRemaining: syncResult?.remainingAmount || 0,
      newStatus: syncResult?.status || 'active'
    });
  } catch (err) {
    console.error('Error deleting transaction:', err);
    return res.status(500).json({ error: 'Failed to delete transaction: ' + err.message });
  }
});

module.exports = router;
