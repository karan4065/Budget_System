/**
 * db.js — MongoDB version
 * 
 * Exports shared helper functions used across routes and services.
 * All MySQL/TiDB Cloud dependencies have been removed.
 * Database connection is handled in config/db.js via Mongoose.
 */
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Admin = require('./models/Admin');
const Loan = require('./models/Loan');
const Transaction = require('./models/Transaction');

// ─── Date Helpers ────────────────────────────────────────────────────────────

/**
 * Returns today's date as a 'YYYY-MM-DD' string in local time.
 * Uses a UTC-offset approach to avoid Node.js UTC vs local timezone issues.
 */
function getTodayStr() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate due date as a 'YYYY-MM-DD' string given a start date and duration.
 */
function calculateDueDate(startDateStr, duration) {
  const date = new Date(startDateStr + 'T00:00:00');
  if (isNaN(date.getTime())) {
    return getTodayStr();
  }
  const norm = (duration || 'weekly').toLowerCase();
  if (norm === 'weekly') {
    date.setDate(date.getDate() + 7);
  } else if (norm === 'fortnight' || norm === 'fortnightly') {
    date.setDate(date.getDate() + 14);
  } else if (norm === 'monthly') {
    const originalDay = date.getDate();
    date.setMonth(date.getMonth() + 1);
    if (date.getDate() !== originalDay) date.setDate(0); // handle month-end rollover
  } else {
    date.setDate(date.getDate() + 7);
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDurationDays(duration) {
  const norm = (duration || 'weekly').toLowerCase();
  if (norm === 'weekly') return 7;
  if (norm === 'fortnight' || norm === 'fortnightly') return 14;
  return 30;
}

/**
 * Pure status evaluation (no DB call).
 */
function evaluateStatus(remainingAmount, dueDateStr) {
  if (Number(remainingAmount) <= 0) return 'completed';
  const today = getTodayStr();
  if (today > dueDateStr) return 'overdue';
  return 'active';
}

/**
 * Mask Aadhaar number for display.
 */
function maskAadhaar(aadhaar) {
  if (!aadhaar) return '';
  const clean = aadhaar.replace(/\D/g, '');
  if (clean.length < 4) return 'XXXX-XXXX-XXXX';
  return `XXXX-XXXX-${clean.slice(-4)}`;
}

// ─── Loan Balance Sync ────────────────────────────────────────────────────────

/**
 * Recalculate and update a loan's interest, total payable, total paid,
 * remaining amount, and status based on actual transactions and current date.
 * Preserves the weekly overdue interest accrual logic.
 */
async function syncLoanBalances(loanId) {
  try {
    const loan = await Loan.findById(loanId);
    if (!loan) return null;

    const initialPrincipal = Number(loan.amountTaken) || 0;
    const interestRate = Number(loan.interestRate) || 10.00;

    // Fetch all transactions for this loan
    const payments = await Transaction.find({ loanId, transactionType: 'payment' });
    const penalties = await Transaction.find({ loanId, transactionType: 'penalty' });
    const adjustments = await Transaction.find({ loanId, transactionType: 'adjustment' });

    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalPenalties = penalties.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalAdjustments = adjustments.reduce((sum, p) => sum + Number(p.amount), 0);

    // Base interest (10% of principal)
    const baseInterest = Math.round(initialPrincipal * (interestRate / 100) * 100) / 100;

    // Date comparison (YYYY-MM-DD strings — same timezone, no UTC shift)
    const todayStr = getTodayStr();
    const dueDateStr = loan.dueDate;   // already 'YYYY-MM-DD'

    const isOverdue = todayStr > dueDateStr;
    let daysOverdue = 0;
    let overdueWeeks = 0;

    if (isOverdue) {
      const todayDate = new Date(todayStr + 'T00:00:00');
      const dueDate = new Date(dueDateStr + 'T00:00:00');
      daysOverdue = Math.max(0, Math.floor((todayDate - dueDate) / (1000 * 60 * 60 * 24)));
      overdueWeeks = Math.ceil(daysOverdue / 7);
    }

    // Overdue interest: 10% of principal per week overdue
    const overdueInterest = overdueWeeks * baseInterest;
    const totalInterest = baseInterest + overdueInterest;
    let totalPayable = initialPrincipal + totalInterest + totalPenalties - totalAdjustments;
    let remainingAmount = Math.max(0, totalPayable - totalPaid);

    let status = 'active';
    if (remainingAmount <= 0) {
      status = 'completed';
      remainingAmount = 0;
    } else if (isOverdue) {
      status = 'overdue';
    }

    await Loan.findByIdAndUpdate(loanId, {
      interestAmount: totalInterest,
      totalPayable,
      totalPaid,
      remainingAmount,
      status
    });

    return {
      principal: initialPrincipal,
      interestRate,
      baseInterest,
      overdueWeeks,
      overdueInterest,
      interestAmount: totalInterest,
      totalPayable,
      totalPaid,
      remainingAmount,
      status,
      daysOverdue
    };
  } catch (err) {
    console.error('Error syncing loan balance for loan', loanId, err.message);
    return null;
  }
}

/**
 * Sync all active/overdue loans.
 */
async function syncAllLoanBalances() {
  try {
    const loans = await Loan.find({ status: { $ne: 'completed' } }, '_id');
    for (const loan of loans) {
      await syncLoanBalances(loan._id);
    }
  } catch (err) {
    console.error('Error syncing all loan balances:', err.message);
  }
}

/**
 * Alias used by routes that call updateAllRecordStatuses().
 */
async function updateAllRecordStatuses() {
  await syncAllLoanBalances();
}

// ─── Admin Seeding ────────────────────────────────────────────────────────────

async function seedAdmin() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'sumit@gmail.com').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'sumit@1234';
  const adminName = process.env.ADMIN_NAME || 'Sumit (Admin)';

  const existing = await Admin.findOne({ email: adminEmail });
  if (!existing) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(adminPassword, salt);
    await Admin.create({ email: adminEmail, passwordHash: hash, name: adminName });
    console.log(`[MongoDB] 🔒 Admin account created: ${adminEmail}`);
  }
}

module.exports = {
  getTodayStr,
  calculateDueDate,
  getDurationDays,
  evaluateStatus,
  maskAadhaar,
  syncLoanBalances,
  syncAllLoanBalances,
  updateAllRecordStatuses,
  seedAdmin
};
