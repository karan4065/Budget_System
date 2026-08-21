const express = require('express');
const router = express.Router();
const { getPool, calculateDueDate, getDurationDays, evaluateStatus, maskAadhaar, updateAllRecordStatuses, syncLoanBalances, syncAllLoanBalances } = require('../db');
const authMiddleware = require('../middleware/auth');

// GET /api/clients - List clients with filters (duration, status, search)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    await updateAllRecordStatuses();

    const { duration, status, search, startDate, endDate, limit = 200, offset = 0 } = req.query;

    let query = `
      SELECT 
        c.id,
        c.name,
        c.mobile_number as mobileNumber,
        c.aadhaar_number as aadhaarNumber,
        c.address,
        c.notes,
        DATE_FORMAT(c.created_at, '%Y-%m-%d') as createdAt,
        l.id as latestRecordId,
        l.amount_taken as amountTaken,
        l.duration,
        l.duration_days as durationDays,
        DATE_FORMAT(l.start_date, '%Y-%m-%d') as startDate,
        DATE_FORMAT(l.due_date, '%Y-%m-%d') as dueDate,
        l.total_paid as totalPaid,
        l.remaining_amount as remainingAmount,
        l.status as loanStatus,
        (SELECT COUNT(*) FROM loan_records WHERE client_id = c.id) as totalLoansCount,
        (SELECT COALESCE(SUM(amount_taken), 0) FROM loan_records WHERE client_id = c.id) as totalAmountTaken,
        (SELECT COALESCE(SUM(total_paid), 0) FROM loan_records WHERE client_id = c.id) as totalAmountPaid,
        (SELECT COALESCE(SUM(remaining_amount), 0) FROM loan_records WHERE client_id = c.id) as totalOutstandingAmount
      FROM clients c
      LEFT JOIN (
        SELECT lr.*
        FROM loan_records lr
        INNER JOIN (
          SELECT client_id, MAX(id) AS max_id
          FROM loan_records
          GROUP BY client_id
        ) latest ON lr.id = latest.max_id
      ) l ON l.client_id = c.id
      WHERE 1=1
    `;

    const params = [];

    if ((duration && ['due-tomorrow', 'due_tomorrow'].includes(duration.toLowerCase())) || (status && ['due-tomorrow', 'due_tomorrow'].includes(status.toLowerCase()))) {
      const tomorrowObj = new Date();
      tomorrowObj.setDate(tomorrowObj.getDate() + 1);
      const tomorrowStr = tomorrowObj.toISOString().split('T')[0];
      query += ` AND DATE_FORMAT(l.due_date, '%Y-%m-%d') = ? AND l.remaining_amount > 0 AND l.status != 'completed'`;
      params.push(tomorrowStr);
    } else if (duration && ['completed', 'paid'].includes(duration.toLowerCase()) || status === 'completed') {
      query += ` AND (l.remaining_amount = 0 OR l.status = 'completed') AND l.id IS NOT NULL`;
    } else if (duration && ['weekly', 'fortnight', 'monthly'].includes(duration.toLowerCase())) {
      query += ` AND l.duration = ? AND l.remaining_amount > 0 AND l.status != 'completed'`;
      params.push(duration.toLowerCase());
    } else if (duration && ['history', 'all-history'].includes(duration.toLowerCase())) {
      // History shows all clients with loan records
      if (status && status.toLowerCase() === 'active') {
        query += ` AND l.remaining_amount > 0 AND l.status != 'completed'`;
      } else if (status && status.toLowerCase() === 'overdue') {
        query += ` AND l.status = 'overdue' AND l.remaining_amount > 0`;
      } else if (status && status.toLowerCase() === 'completed') {
        query += ` AND (l.remaining_amount = 0 OR l.status = 'completed')`;
      }
    } else if (duration && ['directory', 'all-clients', 'all'].includes(duration.toLowerCase())) {
      // Pure directory: show all clients without restricting to loan status
      if (status && status.toLowerCase() === 'active') {
        query += ` AND l.remaining_amount > 0 AND l.status != 'completed'`;
      } else if (status && status.toLowerCase() === 'overdue') {
        query += ` AND l.status = 'overdue' AND l.remaining_amount > 0`;
      } else if (status && status.toLowerCase() === 'completed') {
        query += ` AND (l.remaining_amount = 0 OR l.status = 'completed')`;
      }
    }

    if (startDate && startDate.trim()) {
      query += ` AND (DATE(c.created_at) >= ? OR DATE(l.start_date) >= ?)`;
      params.push(startDate.trim(), startDate.trim());
    }

    if (endDate && endDate.trim()) {
      query += ` AND (DATE(c.created_at) <= ? OR DATE(l.start_date) <= ?)`;
      params.push(endDate.trim(), endDate.trim());
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += ` AND (c.name LIKE ? OR c.mobile_number LIKE ? OR c.aadhaar_number LIKE ?)`;
      params.push(term, term, term);
    }

    query += ` ORDER BY 
      CASE WHEN l.status = 'overdue' THEN 1 WHEN l.status = 'active' THEN 2 ELSE 3 END ASC,
      l.due_date ASC,
      c.created_at DESC
      LIMIT ? OFFSET ?`;
    params.push(Number(limit), Number(offset));

    const [clients] = await db.query(query, params);

    const formatted = clients.map(client => ({
      ...client,
      maskedAadhaar: maskAadhaar(client.aadhaarNumber),
      status: client.loanStatus || 'no_loan'
    }));

    return res.json({ clients: formatted, count: formatted.length });
  } catch (err) {
    console.error('Clients fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch clients: ' + err.message });
  }
});

// GET /api/clients/search/:query - Search by mobile or keyword
router.get('/search/:query', authMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    await updateAllRecordStatuses();

    const rawQuery = req.params.query.trim();
    const cleanDigits = rawQuery.replace(/\D/g, '');

    let clients;
    if (cleanDigits.length >= 3) {
      [clients] = await db.query(`
        SELECT c.*, 
          (SELECT COUNT(*) FROM loan_records WHERE client_id = c.id) as totalLoansCount,
          (SELECT COALESCE(SUM(amount_taken), 0) FROM loan_records WHERE client_id = c.id) as totalAmountTaken,
          (SELECT COALESCE(SUM(total_paid), 0) FROM loan_records WHERE client_id = c.id) as totalPaid,
          (SELECT COALESCE(SUM(remaining_amount), 0) FROM loan_records WHERE client_id = c.id) as totalOutstanding
        FROM clients c
        WHERE c.mobile_number LIKE ? OR c.name LIKE ?
        ORDER BY c.created_at DESC
        LIMIT 10
      `, [`%${cleanDigits}%`, `%${rawQuery}%`]);
    } else {
      [clients] = await db.query(`
        SELECT c.*, 
          (SELECT COUNT(*) FROM loan_records WHERE client_id = c.id) as totalLoansCount,
          (SELECT COALESCE(SUM(amount_taken), 0) FROM loan_records WHERE client_id = c.id) as totalAmountTaken,
          (SELECT COALESCE(SUM(total_paid), 0) FROM loan_records WHERE client_id = c.id) as totalPaid,
          (SELECT COALESCE(SUM(remaining_amount), 0) FROM loan_records WHERE client_id = c.id) as totalOutstanding
        FROM clients c
        WHERE c.name LIKE ?
        ORDER BY c.created_at DESC
        LIMIT 10
      `, [`%${rawQuery}%`]);
    }

    const results = [];
    for (const c of clients) {
      const [records] = await db.query(`
        SELECT 
          id, client_id, amount_taken, duration, duration_days,
          DATE_FORMAT(start_date, '%Y-%m-%d') as start_date,
          DATE_FORMAT(due_date, '%Y-%m-%d') as due_date,
          total_paid, remaining_amount, status, note, created_at, updated_at
        FROM loan_records 
        WHERE client_id = ? 
        ORDER BY created_at DESC
      `, [c.id]);

      results.push({
        id: c.id,
        name: c.name,
        mobileNumber: c.mobile_number,
        aadhaarNumber: c.aadhaar_number,
        maskedAadhaar: maskAadhaar(c.aadhaar_number),
        address: c.address,
        notes: c.notes,
        totalLoansCount: c.totalLoansCount,
        totalAmountTaken: c.totalAmountTaken,
        totalPaid: c.totalPaid,
        totalOutstanding: c.totalOutstanding,
        records
      });
    }

    return res.json({ results });
  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: 'Search failed: ' + err.message });
  }
});

// GET /api/clients/:id - Full details with all loan records & transaction history
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    await updateAllRecordStatuses();

    const clientId = req.params.id;
    const [clientRows] = await db.query('SELECT * FROM clients WHERE id = ?', [clientId]);
    const client = clientRows[0];

    if (!client) {
      return res.status(404).json({ error: 'Client not found.' });
    }

    const [loans] = await db.query(`
      SELECT 
        id, client_id, amount_taken, interest_rate, interest_amount, total_payable, duration, duration_days,
        DATE_FORMAT(start_date, '%Y-%m-%d') as start_date,
        DATE_FORMAT(due_date, '%Y-%m-%d') as due_date,
        total_paid, remaining_amount, status, note, created_at, updated_at
      FROM loan_records 
      WHERE client_id = ? 
      ORDER BY created_at DESC
    `, [clientId]);

    const loansWithTransactions = [];
    let lifetimeGiven = 0;
    let lifetimeInterest = 0;
    let lifetimeTotalPayable = 0;
    let lifetimePaid = 0;
    let lifetimeRemaining = 0;
    let activeLoan = null;

    for (const loan of loans) {
      const [transactions] = await db.query(`
        SELECT 
          id, record_id, client_id, amount, transaction_type,
          DATE_FORMAT(transaction_date, '%Y-%m-%d') as transaction_date,
          remaining_after, payment_mode, note, created_at
        FROM transactions 
        WHERE record_id = ? 
        ORDER BY transaction_date ASC, id ASC
      `, [loan.id]);

      const [reminderLogs] = await db.query(`
        SELECT 
          id, loan_id, client_id, phone_number, reminder_type,
          DATE_FORMAT(due_date, '%Y-%m-%d') as due_date,
          amount, message, status, sent_at, whatsapp_message_id, error_message
        FROM reminder_logs
        WHERE loan_id = ?
        ORDER BY sent_at DESC
      `, [loan.id]);

      const principal = Number(loan.amount_taken) || 0;
      const rate = Number(loan.interest_rate) || 10.00;
      const interest = Number(loan.interest_amount) > 0 ? Number(loan.interest_amount) : Math.round(principal * (rate / 100) * 100) / 100;
      const payable = Number(loan.total_payable) > 0 ? Number(loan.total_payable) : (principal + interest);

      const loanObj = {
        id: loan.id,
        clientId: loan.client_id,
        amountTaken: principal,
        interestRate: rate,
        interestAmount: interest,
        totalPayable: payable,
        duration: loan.duration,
        durationDays: loan.duration_days,
        startDate: loan.start_date,
        dueDate: loan.due_date,
        totalPaid: Number(loan.total_paid) || 0,
        remainingAmount: Number(loan.remaining_amount) || 0,
        status: loan.status,
        note: loan.note,
        createdAt: loan.created_at,
        updatedAt: loan.updated_at,
        transactions: transactions.map(t => ({
          id: t.id,
          recordId: t.record_id,
          clientId: t.client_id,
          amount: Number(t.amount),
          transactionType: t.transaction_type,
          transactionDate: t.transaction_date,
          remainingAfter: Number(t.remaining_after),
          paymentMode: t.payment_mode,
          note: t.note,
          createdAt: t.created_at
        })),
        reminders: reminderLogs.map(r => ({
          id: r.id,
          loanId: r.loan_id,
          clientId: r.client_id,
          phoneNumber: r.phone_number,
          reminderType: r.reminder_type,
          dueDate: r.due_date,
          amount: Number(r.amount),
          message: r.message,
          status: r.status,
          sentAt: r.sent_at,
          whatsappMessageId: r.whatsapp_message_id,
          errorMessage: r.error_message
        }))
      };

      lifetimeGiven += loanObj.amountTaken;
      lifetimeInterest += loanObj.interestAmount;
      lifetimeTotalPayable += loanObj.totalPayable;
      lifetimePaid += loanObj.totalPaid;
      lifetimeRemaining += loanObj.remainingAmount;

      if ((loanObj.status === 'active' || loanObj.status === 'overdue') && !activeLoan) {
        activeLoan = loanObj;
      }

      loansWithTransactions.push(loanObj);
    }

    // Also fetch all client reminder logs across all loans
    const [allClientReminders] = await db.query(`
      SELECT 
        id, loan_id, client_id, phone_number, reminder_type,
        DATE_FORMAT(due_date, '%Y-%m-%d') as due_date,
        amount, message, status, sent_at, whatsapp_message_id, error_message
      FROM reminder_logs
      WHERE client_id = ?
      ORDER BY sent_at DESC
      LIMIT 20
    `, [clientId]);

    return res.json({
      client: {
        id: client.id,
        name: client.name,
        mobileNumber: client.mobile_number,
        aadhaarNumber: client.aadhaar_number,
        maskedAadhaar: maskAadhaar(client.aadhaar_number),
        address: client.address,
        notes: client.notes,
        createdAt: client.created_at,
        updatedAt: client.updated_at
      },
      activeLoan: activeLoan || (loansWithTransactions.length > 0 ? loansWithTransactions[0] : null),
      loanRecords: loansWithTransactions,
      reminders: allClientReminders.map(r => ({
        id: r.id,
        loanId: r.loan_id,
        clientId: r.client_id,
        phoneNumber: r.phone_number,
        reminderType: r.reminder_type,
        dueDate: r.due_date,
        amount: Number(r.amount),
        message: r.message,
        status: r.status,
        sentAt: r.sent_at,
        whatsappMessageId: r.whatsapp_message_id,
        errorMessage: r.error_message
      })),
      stats: {
        totalLoans: loansWithTransactions.length,
        lifetimeGiven,
        lifetimeInterest,
        lifetimeTotalPayable,
        lifetimePaid,
        lifetimeRemaining
      }
    });
  } catch (err) {
    console.error('Client detail error:', err);
    return res.status(500).json({ error: 'Failed to fetch client details: ' + err.message });
  }
});

// POST /api/clients - Add New Client with Initial Loan Record & Disbursement
router.post('/', authMiddleware, async (req, res) => {
  const {
    name,
    mobileNumber,
    aadhaarNumber,
    address,
    notes,
    amountTaken,
    duration,
    startDate = new Date().toISOString().split('T')[0],
    paymentMode = 'Cash'
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Client name is required.' });
  }

  const cleanMobile = (mobileNumber || '').replace(/\D/g, '');
  if (!cleanMobile || cleanMobile.length < 10) {
    return res.status(400).json({ error: 'Valid 10-digit mobile number is required.' });
  }

  const parsedAmount = parseFloat(amountTaken);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Amount taken must be greater than 0.' });
  }

  if (!duration || !['weekly', 'fortnight', 'monthly'].includes(duration.toLowerCase())) {
    return res.status(400).json({ error: 'Valid duration is required (weekly, fortnight, monthly).' });
  }

  const cleanAadhaar = aadhaarNumber ? aadhaarNumber.replace(/\D/g, '') : null;
  if (cleanAadhaar && cleanAadhaar.length !== 12) {
    return res.status(400).json({ error: 'Aadhaar number must be exactly 12 digits.' });
  }

  const selectedDuration = duration.toLowerCase();
  const dueDate = calculateDueDate(startDate, selectedDuration);
  const durationDays = getDurationDays(selectedDuration);

  // 10% One-time Loan Interest Calculation
  const interestRate = 10.00;
  const interestAmount = Math.round(parsedAmount * (interestRate / 100) * 100) / 100;
  const totalPayable = parsedAmount + interestAmount;
  const initialStatus = evaluateStatus(totalPayable, dueDate);

  try {
    const db = await getPool();
    const [existing] = await db.query('SELECT id FROM clients WHERE mobile_number = ?', [cleanMobile]);
    if (existing.length > 0) {
      return res.status(400).json({ 
        error: `A client with mobile number ${cleanMobile} already exists. Use "Add New Loan" to create a new financial record for this client.`,
        existingClientId: existing[0].id
      });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [clientRes] = await connection.query(`
        INSERT INTO clients (name, mobile_number, aadhaar_number, address, notes)
        VALUES (?, ?, ?, ?, ?)
      `, [name.trim(), cleanMobile, cleanAadhaar, address || '', notes || '']);
      const clientId = clientRes.insertId;

      const [loanRes] = await connection.query(`
        INSERT INTO loan_records (
          client_id, amount_taken, interest_rate, interest_amount, total_payable,
          duration, duration_days, start_date, due_date, total_paid, remaining_amount, status, note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `, [
        clientId,
        parsedAmount,
        interestRate,
        interestAmount,
        totalPayable,
        selectedDuration,
        durationDays,
        startDate,
        dueDate,
        totalPayable,
        initialStatus,
        'Initial loan record'
      ]);
      const recordId = loanRes.insertId;

      await connection.query(`
        INSERT INTO transactions (record_id, client_id, amount, transaction_type, transaction_date, remaining_after, payment_mode, note)
        VALUES (?, ?, ?, 'disbursement', ?, ?, ?, ?)
      `, [recordId, clientId, parsedAmount, startDate, totalPayable, paymentMode, 'Initial loan disbursement']);

      await connection.commit();

      return res.status(201).json({
        message: 'Client created successfully with initial loan record and 10% interest applied',
        clientId,
        recordId,
        principalAmount: parsedAmount,
        interestRate,
        interestAmount,
        totalPayable,
        dueDate,
        duration: selectedDuration
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('Error creating client:', err);
    return res.status(500).json({ error: 'Failed to create client: ' + err.message });
  }
});

// POST /api/clients/:id/loans - Add a new loan for an existing client
router.post('/:id/loans', authMiddleware, async (req, res) => {
  const clientId = req.params.id;
  const {
    amountTaken,
    duration,
    startDate = new Date().toISOString().split('T')[0],
    paymentMode = 'Cash',
    note
  } = req.body;

  try {
    const db = await getPool();
    const [clientRows] = await db.query('SELECT id, name FROM clients WHERE id = ?', [clientId]);
    if (clientRows.length === 0) {
      return res.status(404).json({ error: 'Client not found.' });
    }

    const parsedAmount = parseFloat(amountTaken);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount taken must be greater than 0.' });
    }

    if (!duration || !['weekly', 'fortnight', 'monthly'].includes(duration.toLowerCase())) {
      return res.status(400).json({ error: 'Valid duration is required (weekly, fortnight, monthly).' });
    }

    const selectedDuration = duration.toLowerCase();
    const dueDate = calculateDueDate(startDate, selectedDuration);
    const durationDays = getDurationDays(selectedDuration);

    // 10% One-time Loan Interest Calculation
    const interestRate = 10.00;
    const interestAmount = Math.round(parsedAmount * (interestRate / 100) * 100) / 100;
    const totalPayable = parsedAmount + interestAmount;
    const initialStatus = evaluateStatus(totalPayable, dueDate);

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [loanRes] = await connection.query(`
        INSERT INTO loan_records (
          client_id, amount_taken, interest_rate, interest_amount, total_payable,
          duration, duration_days, start_date, due_date, total_paid, remaining_amount, status, note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `, [
        clientId,
        parsedAmount,
        interestRate,
        interestAmount,
        totalPayable,
        selectedDuration,
        durationDays,
        startDate,
        dueDate,
        totalPayable,
        initialStatus,
        note || 'New loan cycle'
      ]);
      const recordId = loanRes.insertId;

      await connection.query(`
        INSERT INTO transactions (record_id, client_id, amount, transaction_type, transaction_date, remaining_after, payment_mode, note)
        VALUES (?, ?, ?, 'disbursement', ?, ?, ?, ?)
      `, [recordId, clientId, parsedAmount, startDate, totalPayable, paymentMode, note || 'Loan disbursement']);

      await connection.commit();

      return res.status(201).json({
        message: 'New loan record added successfully with 10% interest applied',
        recordId,
        principalAmount: parsedAmount,
        interestRate,
        interestAmount,
        totalPayable,
        dueDate,
        duration: selectedDuration
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to add loan record: ' + err.message });
  }
});

// PUT /api/clients/:id - Update client personal info
router.put('/:id', authMiddleware, async (req, res) => {
  const clientId = req.params.id;
  const { name, mobileNumber, aadhaarNumber, address, notes } = req.body;

  try {
    const db = await getPool();
    const [rows] = await db.query('SELECT * FROM clients WHERE id = ?', [clientId]);
    const existing = rows[0];
    if (!existing) {
      return res.status(404).json({ error: 'Client not found.' });
    }

    const cleanMobile = mobileNumber ? mobileNumber.replace(/\D/g, '') : existing.mobile_number;
    if (cleanMobile && cleanMobile.length < 10) {
      return res.status(400).json({ error: 'Valid 10-digit mobile number required.' });
    }

    if (cleanMobile !== existing.mobile_number) {
      const [collision] = await db.query('SELECT id FROM clients WHERE mobile_number = ? AND id != ?', [cleanMobile, clientId]);
      if (collision.length > 0) {
        return res.status(400).json({ error: 'Another client is already registered with this mobile number.' });
      }
    }

    let cleanAadhaar = existing.aadhaar_number;
    if (aadhaarNumber !== undefined) {
      cleanAadhaar = aadhaarNumber ? aadhaarNumber.replace(/\D/g, '') : null;
      if (cleanAadhaar && cleanAadhaar.length !== 12) {
        return res.status(400).json({ error: 'Aadhaar number must be 12 digits.' });
      }
    }

    await db.query(`
      UPDATE clients 
      SET name = ?, mobile_number = ?, aadhaar_number = ?, address = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      name ? name.trim() : existing.name,
      cleanMobile,
      cleanAadhaar,
      address !== undefined ? address : existing.address,
      notes !== undefined ? notes : existing.notes,
      clientId
    ]);

    return res.json({ message: 'Client details updated successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Update failed: ' + err.message });
  }
});

// PUT /api/clients/loans/:id - Update loan record details
router.put('/loans/:id', authMiddleware, async (req, res) => {
  const loanId = req.params.id;
  const { amountTaken, duration, startDate, note } = req.body;

  try {
    const db = await getPool();
    const [loanRows] = await db.query('SELECT * FROM loan_records WHERE id = ?', [loanId]);
    const loan = loanRows[0];
    if (!loan) {
      return res.status(404).json({ error: 'Loan record not found.' });
    }

    const parsedAmount = amountTaken !== undefined ? parseFloat(amountTaken) : Number(loan.amount_taken);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount taken must be greater than 0.' });
    }

    const newDuration = (duration || loan.duration).toLowerCase();
    if (!['weekly', 'fortnight', 'monthly'].includes(newDuration)) {
      return res.status(400).json({ error: 'Invalid duration specified.' });
    }

    const newStartDate = startDate || loan.start_date;
    const newDueDate = calculateDueDate(newStartDate, newDuration);
    const durationDays = getDurationDays(newDuration);

    const interestRate = 10.00;
    const interestAmount = Math.round(parsedAmount * (interestRate / 100) * 100) / 100;
    const totalPayable = parsedAmount + interestAmount;

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(`
        UPDATE loan_records
        SET amount_taken = ?, interest_rate = ?, interest_amount = ?, total_payable = ?,
            duration = ?, duration_days = ?, start_date = ?, due_date = ?, note = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        parsedAmount,
        interestRate,
        interestAmount,
        totalPayable,
        newDuration,
        durationDays,
        newStartDate,
        newDueDate,
        note !== undefined ? note : loan.note,
        loanId
      ]);

      // Update initial disbursement transaction amount & date if exists
      await connection.query(`
        UPDATE transactions
        SET amount = ?, transaction_date = ?
        WHERE record_id = ? AND transaction_type = 'disbursement'
      `, [parsedAmount, newStartDate, loanId]);

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    const syncResult = await syncLoanBalances(loanId);

    return res.json({
      message: 'Loan record updated successfully with 10% interest recalculated',
      syncResult
    });
  } catch (err) {
    console.error('Error updating loan:', err);
    return res.status(500).json({ error: 'Failed to update loan: ' + err.message });
  }
});

// DELETE /api/clients/loans/:id - Delete a loan record and its transactions
router.delete('/loans/:id', authMiddleware, async (req, res) => {
  const loanId = req.params.id;
  try {
    const db = await getPool();
    const [loanRows] = await db.query('SELECT * FROM loan_records WHERE id = ?', [loanId]);
    const loan = loanRows[0];
    if (!loan) {
      return res.status(404).json({ error: 'Loan record not found.' });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query('DELETE FROM transactions WHERE record_id = ?', [loanId]);
      await connection.query('DELETE FROM loan_records WHERE id = ?', [loanId]);
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    await syncAllLoanBalances();

    return res.json({
      message: `Loan record #${loanId} and associated transactions deleted successfully.`
    });
  } catch (err) {
    console.error('Error deleting loan:', err);
    return res.status(500).json({ error: 'Failed to delete loan: ' + err.message });
  }
});

// DELETE /api/clients/:id - Delete client and cascade records
router.delete('/:id', authMiddleware, async (req, res) => {
  const clientId = req.params.id;
  try {
    const db = await getPool();
    const [rows] = await db.query('SELECT * FROM clients WHERE id = ?', [clientId]);
    const client = rows[0];
    if (!client) {
      return res.status(404).json({ error: 'Client not found.' });
    }

    await db.query('DELETE FROM clients WHERE id = ?', [clientId]);
    return res.json({ message: `Client ${client.name} and all related records deleted successfully.` });
  } catch (err) {
    return res.status(500).json({ error: 'Delete failed: ' + err.message });
  }
});

module.exports = router;
