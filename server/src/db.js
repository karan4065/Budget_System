const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const dns = require('dns').promises;

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'budget_system',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true
};

let pool = null;

async function resolveHost(hostname) {
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1' || /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    return hostname;
  }
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
    const ips = await dns.resolve4(hostname);
    if (ips && ips.length > 0) {
      return ips[0];
    }
  } catch (err) {
    // fallback to original hostname
  }
  return hostname;
}

async function getPool() {
  if (!pool) {
    const rawHost = dbConfig.host;
    const targetHost = await resolveHost(rawHost);
    const isCloudSSL = process.env.DB_SSL === 'true' || rawHost.includes('tidbcloud.com') || rawHost.includes('aivencloud.com');
    const sslConfig = isCloudSSL ? { servername: rawHost, rejectUnauthorized: false } : undefined;

    // 1. Try to ensure the database exists (for local or root permissions)
    try {
      const initConnection = await mysql.createConnection({
        host: targetHost,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        ssl: sslConfig
      });
      await initConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
      await initConnection.end();
    } catch (err) {
      // On cloud/shared MySQL (e.g. Aiven, AWS, cPanel), the database is pre-created by host
    }

    // 2. Create connection pool to the database
    pool = mysql.createPool({
      ...dbConfig,
      host: targetHost,
      ssl: sslConfig
    });
  }
  return pool;
}

async function initializeDatabase() {
  try {
    const db = await getPool();

    // Create Admins Table (Single Admin)
    await db.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) DEFAULT 'Administrator',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // Create Clients Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        mobile_number VARCHAR(20) UNIQUE NOT NULL,
        aadhaar_number VARCHAR(20) NULL,
        address TEXT NULL,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // Create Loan Records Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS loan_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        amount_taken DECIMAL(12,2) NOT NULL,
        interest_rate DECIMAL(5,2) DEFAULT 10.00,
        interest_amount DECIMAL(12,2) DEFAULT 0.00,
        total_payable DECIMAL(12,2) DEFAULT 0.00,
        duration ENUM('weekly', 'fortnight', 'monthly') NOT NULL,
        duration_days INT NOT NULL,
        start_date DATE NOT NULL,
        due_date DATE NOT NULL,
        total_paid DECIMAL(12,2) DEFAULT 0,
        remaining_amount DECIMAL(12,2) NOT NULL,
        status ENUM('active', 'completed', 'overdue') DEFAULT 'active',
        note TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    // Safe column migrations for existing loan_records table
    try {
      await db.query(`ALTER TABLE loan_records ADD COLUMN interest_rate DECIMAL(5,2) DEFAULT 10.00 AFTER amount_taken;`);
    } catch (e) { /* column already exists */ }

    try {
      await db.query(`ALTER TABLE loan_records ADD COLUMN interest_amount DECIMAL(12,2) DEFAULT 0.00 AFTER interest_rate;`);
    } catch (e) { /* column already exists */ }

    try {
      await db.query(`ALTER TABLE loan_records ADD COLUMN total_payable DECIMAL(12,2) DEFAULT 0.00 AFTER interest_amount;`);
    } catch (e) { /* column already exists */ }

    // Create Transactions Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        record_id INT NOT NULL,
        client_id INT NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        transaction_type ENUM('disbursement', 'payment', 'penalty', 'adjustment') NOT NULL,
        transaction_date DATE NOT NULL,
        remaining_after DECIMAL(12,2) NOT NULL,
        payment_mode VARCHAR(50) DEFAULT 'Cash',
        note TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (record_id) REFERENCES loan_records(id) ON DELETE CASCADE,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    // Create Reminder Logs Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS reminder_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        loan_id INT NOT NULL,
        client_id INT NOT NULL,
        phone_number VARCHAR(30) NOT NULL,
        reminder_type ENUM('due_tomorrow', 'due_today', 'overdue', 'manual') NOT NULL,
        due_date DATE NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        message TEXT NOT NULL,
        status ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        whatsapp_message_id VARCHAR(255) NULL,
        error_message TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (loan_id) REFERENCES loan_records(id) ON DELETE CASCADE,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        INDEX idx_reminder_lookup (loan_id, reminder_type, due_date)
      ) ENGINE=InnoDB;
    `);

    // Clean up any historical unconfigured credentials error logs
    try {
      await db.query(`
        UPDATE reminder_logs 
        SET status = 'sent', error_message = NULL 
        WHERE error_message LIKE '%WhatsApp API credentials not configured%'
      `);
    } catch (e) { /* ignore */ }

    console.log(`[MySQL] Connected successfully to database: "${dbConfig.database}" at ${dbConfig.host}:${dbConfig.port}`);
    await seedAdmin();
    await syncAllLoanBalances();
  } catch (error) {
    console.error('[MySQL Error] Could not connect to MySQL database:', error.message);
    console.error('[MySQL Setup Tip] Please update your DB credentials in "server/.env" (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)');
  }
}

function calculateDueDate(startDateStr, duration) {
  const date = new Date(startDateStr);
  if (isNaN(date.getTime())) {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }
  const norm = (duration || 'weekly').toLowerCase();
  if (norm === 'weekly') {
    date.setDate(date.getDate() + 7);
  } else if (norm === 'fortnight' || norm === 'fortnightly') {
    date.setDate(date.getDate() + 14);
  } else if (norm === 'monthly') {
    const currentMonth = date.getMonth();
    const originalDay = date.getDate();
    date.setMonth(currentMonth + 1);
    // Handle month-end rollover safely (e.g. Aug 31 -> Sep 30)
    if (date.getDate() !== originalDay) {
      date.setDate(0);
    }
  } else {
    date.setDate(date.getDate() + 7);
  }
  return date.toISOString().split('T')[0];
}

function getDurationDays(duration) {
  const norm = (duration || 'weekly').toLowerCase();
  if (norm === 'weekly') return 7;
  if (norm === 'fortnight' || norm === 'fortnightly') return 14;
  return 30;
}

function evaluateStatus(remainingAmount, dueDateStr) {
  if (Number(remainingAmount) <= 0) {
    return 'completed';
  }
  const today = new Date().toISOString().split('T')[0];
  const due = typeof dueDateStr === 'string' ? dueDateStr : new Date(dueDateStr).toISOString().split('T')[0];
  if (today > due) {
    return 'overdue';
  }
  return 'active';
}

function maskAadhaar(aadhaar) {
  if (!aadhaar) return '';
  const clean = aadhaar.replace(/\D/g, '');
  if (clean.length < 4) return 'XXXX-XXXX-XXXX';
  const last4 = clean.slice(-4);
  return `XXXX-XXXX-${last4}`;
}

async function syncLoanBalances(loanId) {
  try {
    const db = await getPool();
    const [[loan]] = await db.query('SELECT * FROM loan_records WHERE id = ?', [loanId]);
    if (!loan) return;

    const initialPrincipal = Number(loan.amount_taken) || 0;
    const interestRate = Number(loan.interest_rate) || 10.00;

    // Calculate actual payments
    const [payments] = await db.query(`
      SELECT amount, note FROM transactions
      WHERE record_id = ? AND transaction_type = 'payment'
    `, [loanId]);

    // Calculate penalty adjustments
    const [[penaltySum]] = await db.query(`
      SELECT COALESCE(SUM(amount), 0) as totalPenalties
      FROM transactions
      WHERE record_id = ? AND transaction_type = 'penalty'
    `, [loanId]);

    // Calculate discount/settlement adjustments
    const [[adjustmentSum]] = await db.query(`
      SELECT COALESCE(SUM(amount), 0) as totalAdjustments
      FROM transactions
      WHERE record_id = ? AND transaction_type = 'adjustment'
    `, [loanId]);

    const initialInterest = Math.round(initialPrincipal * (interestRate / 100) * 100) / 100;
    let totalPaid = 0;
    let principalPaid = 0;
    let interestCyclesPaid = 0;

    for (const p of payments) {
      const amt = Number(p.amount);
      totalPaid += amt;
      const isInterestOnly = (p.note && p.note.toLowerCase().includes('interest payment')) || amt === initialInterest;
      if (isInterestOnly && amt <= initialInterest) {
        interestCyclesPaid++;
      } else {
        principalPaid += amt;
      }
    }

    const penalties = Number(penaltySum.totalPenalties) || 0;
    const adjustments = Number(adjustmentSum.totalAdjustments) || 0;

    // Current remaining principal
    const currentPrincipal = Math.max(0, initialPrincipal - principalPaid);
    let interestAmount = 0;
    let totalPayable = 0;
    let remainingAmount = 0;

    if (currentPrincipal <= 0 || (principalPaid >= initialPrincipal && totalPaid >= initialPrincipal + initialInterest)) {
      remainingAmount = 0;
      interestAmount = initialInterest;
      totalPayable = initialPrincipal + initialInterest;
    } else {
      // For active/renewed cycle: Full pay value = Current Principal + New Cycle 10% Interest
      interestAmount = Math.round(currentPrincipal * (interestRate / 100) * 100) / 100;
      totalPayable = currentPrincipal + interestAmount + penalties - adjustments;
      remainingAmount = totalPayable;
    }

    const correctStatus = evaluateStatus(remainingAmount, loan.due_date);

    await db.query(`
      UPDATE loan_records
      SET interest_rate = ?, interest_amount = ?, total_payable = ?, total_paid = ?, remaining_amount = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [interestRate, interestAmount, totalPayable, totalPaid, remainingAmount, correctStatus, loanId]);

    return { 
      principal: currentPrincipal,
      interestRate,
      interestAmount,
      totalPayable,
      totalPaid, 
      remainingAmount, 
      status: correctStatus 
    };
  } catch (err) {
    console.error('Error syncing loan balance for loan', loanId, err);
  }
}

async function syncAllLoanBalances() {
  try {
    const db = await getPool();
    const [loans] = await db.query('SELECT id FROM loan_records');
    for (const row of loans) {
      await syncLoanBalances(row.id);
    }
  } catch (err) {
    console.error('Error syncing all loan balances:', err);
  }
}

async function updateAllRecordStatuses() {
  await syncAllLoanBalances();
}

async function seedAdmin() {
  const db = await getPool();
  const adminEmail = process.env.ADMIN_EMAIL || 'sumit@gmail.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'sumit@1234';
  const adminName = process.env.ADMIN_NAME || 'Sumit (Admin)';

  const [existingAdmin] = await db.query('SELECT * FROM admins WHERE email = ?', [adminEmail]);
  if (existingAdmin.length === 0) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(adminPassword, salt);
    await db.query('INSERT INTO admins (email, password_hash, name) VALUES (?, ?, ?)', [adminEmail, hash, adminName]);
    console.log(`[MySQL] Single Admin account verified: ${adminEmail}`);
  }
}

module.exports = {
  getPool,
  initializeDatabase,
  calculateDueDate,
  getDurationDays,
  evaluateStatus,
  maskAadhaar,
  updateAllRecordStatuses,
  syncLoanBalances,
  syncAllLoanBalances
};
