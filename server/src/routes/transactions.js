const express = require('express');
const router = express.Router();
const { getPool, evaluateStatus, updateAllRecordStatuses, syncLoanBalances, calculateDueDate } = require('../db');
const authMiddleware = require('../middleware/auth');

// GET /api/transactions - Global transaction history with filters
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    await updateAllRecordStatuses();

    const {
      type,
      startDate,
      endDate,
      search,
      limit = 200,
      offset = 0
    } = req.query;

    let query = `
      SELECT 
        t.id,
        t.record_id as recordId,
        t.client_id as clientId,
        t.amount,
        t.transaction_type as transactionType,
        DATE_FORMAT(t.transaction_date, '%Y-%m-%d') as transactionDate,
        t.remaining_after as remainingAfter,
        t.payment_mode as paymentMode,
        t.note,
        t.created_at as createdAt,
        c.name as clientName,
        c.mobile_number as mobileNumber,
        l.duration,
        l.amount_taken as loanAmount,
        DATE_FORMAT(l.due_date, '%Y-%m-%d') as loanDueDate,
        l.status as loanStatus
      FROM transactions t
      JOIN clients c ON t.client_id = c.id
      JOIN loan_records l ON t.record_id = l.id
      WHERE 1=1
    `;

    const params = [];

    if (type && ['payment', 'disbursement', 'penalty', 'adjustment'].includes(type)) {
      query += ` AND t.transaction_type = ?`;
      params.push(type);
    }

    if (startDate) {
      query += ` AND t.transaction_date >= ?`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND t.transaction_date <= ?`;
      params.push(endDate);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += ` AND (c.name LIKE ? OR c.mobile_number LIKE ? OR t.note LIKE ?)`;
      params.push(term, term, term);
    }

    query += ` ORDER BY t.transaction_date DESC, t.id DESC LIMIT ? OFFSET ?`;
    params.push(Number(limit), Number(offset));

    const [transactions] = await db.query(query, params);

    let countQuery = `
      SELECT 
        COUNT(*) as totalCount,
        COALESCE(SUM(CASE WHEN t.transaction_type = 'payment' THEN t.amount ELSE 0 END), 0) as totalCollected,
        COALESCE(SUM(CASE WHEN t.transaction_type = 'disbursement' THEN t.amount ELSE 0 END), 0) as totalDisbursed
      FROM transactions t
      JOIN clients c ON t.client_id = c.id
      JOIN loan_records l ON t.record_id = l.id
      WHERE 1=1
    `;
    const countParams = params.slice(0, -2);
    if (countParams.length > 0) {
      if (type) countQuery += ` AND t.transaction_type = ?`;
      if (startDate) countQuery += ` AND t.transaction_date >= ?`;
      if (endDate) countQuery += ` AND t.transaction_date <= ?`;
      if (search && search.trim()) countQuery += ` AND (c.name LIKE ? OR c.mobile_number LIKE ? OR t.note LIKE ?)`;
    }
    const [[summary]] = await db.query(countQuery, countParams);

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
    transactionDate = new Date().toISOString().split('T')[0],
    paymentMode = 'Cash',
    note,
    isInterestRenewal = false,
    extendDueDate = false
  } = req.body;

  if (!recordId) {
    return res.status(400).json({ error: 'Record ID is required.' });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Valid amount greater than 0 is required.' });
  }

  try {
    const db = await getPool();
    const [loanRows] = await db.query('SELECT * FROM loan_records WHERE id = ?', [recordId]);
    const loan = loanRows[0];
    if (!loan) {
      return res.status(404).json({ error: 'Loan record not found.' });
    }

    if (transactionType === 'payment') {
      if (Number(loan.remaining_amount) <= 0) {
        return res.status(400).json({ error: 'This loan record is already fully settled (Remaining: ₹0).' });
      }
      if (parsedAmount > Number(loan.remaining_amount) && !isInterestRenewal) {
        return res.status(400).json({ 
          error: `Payment amount (₹${parsedAmount}) cannot exceed the remaining balance of ₹${Number(loan.remaining_amount)}.` 
        });
      }
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const shouldExtend = isInterestRenewal || extendDueDate || (note && note.toLowerCase().includes('interest payment'));
      let newDueDate = loan.due_date;

      if (shouldExtend) {
        newDueDate = calculateDueDate(loan.due_date, loan.duration);
        await connection.query('UPDATE loan_records SET due_date = ? WHERE id = ?', [newDueDate, loan.id]);
      }

      let projectedRemaining = Number(loan.remaining_amount);
      if (shouldExtend) {
        // When interest renewal is paid, the renewed cycle carries Principal + 10% Interest
        const activePrincipal = Number(loan.amount_taken);
        const rate = Number(loan.interest_rate) || 10;
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

      const [insertRes] = await connection.query(`
        INSERT INTO transactions (record_id, client_id, amount, transaction_type, transaction_date, remaining_after, payment_mode, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        loan.id,
        loan.client_id,
        parsedAmount,
        transactionType,
        transactionDate,
        projectedRemaining,
        paymentMode,
        finalNote
      ]);

      await connection.commit();
      connection.release();

      // Recalculate and synchronize exact loan balance from database
      const syncResult = await syncLoanBalances(loan.id);

      return res.status(201).json({
        message: shouldExtend ? `Interest payment recorded! Loan cycle renewed until ${newDueDate}.` : 'Transaction recorded successfully',
        txnId: insertRes.insertId,
        newDueDate,
        newTotalPaid: syncResult?.totalPaid ?? (Number(loan.total_paid) + parsedAmount),
        newRemaining: syncResult?.remainingAmount ?? projectedRemaining,
        newStatus: syncResult?.status || evaluateStatus(projectedRemaining, newDueDate)
      });
    } catch (err) {
      await connection.rollback();
      connection.release();
      throw err;
    }
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
    const db = await getPool();
    const [rows] = await db.query('SELECT * FROM transactions WHERE id = ?', [txnId]);
    const txn = rows[0];
    if (!txn) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    const parsedAmount = amount !== undefined ? parseFloat(amount) : Number(txn.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0.' });
    }

    await db.query(`
      UPDATE transactions
      SET amount = ?, payment_mode = ?, note = ?, transaction_date = ?
      WHERE id = ?
    `, [
      parsedAmount,
      paymentMode || txn.payment_mode,
      note !== undefined ? note : txn.note,
      transactionDate || txn.transaction_date,
      txnId
    ]);

    const syncResult = await syncLoanBalances(txn.record_id);

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
    const db = await getPool();
    const [txnRows] = await db.query('SELECT * FROM transactions WHERE id = ?', [txnId]);
    const txn = txnRows[0];

    if (!txn) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    if (txn.transaction_type === 'disbursement') {
      return res.status(400).json({ error: 'Initial loan disbursement cannot be deleted directly without deleting the loan.' });
    }

    await db.query('DELETE FROM transactions WHERE id = ?', [txnId]);

    const syncResult = await syncLoanBalances(txn.record_id);

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
