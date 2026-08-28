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

// ─── Loan Balance Sync (High Performance & Throttled) ────────────────────────
let lastGlobalSyncTime = 0;
const SYNC_THROTTLE_MS = 60 * 1000; // 60 seconds throttle

/**
 * Recalculate and update a single loan's interest, total payable, total paid,
 * remaining amount, and status based on actual transactions and current date.
 * Optimized to fetch transactions in a single DB query.
 */
async function syncLoanBalances(loanId) {
  try {
    const loan = await Loan.findById(loanId);
    if (!loan) return null;

    const initialPrincipal = Number(loan.amountTaken) || 0;
    const interestRate = Number(loan.interestRate) || 10.00;

    // Single query for all transactions of this loan
    const transactions = await Transaction.find({ loanId }).lean();
    let totalPaid = 0, totalPenalties = 0, totalAdjustments = 0;
    for (const t of transactions) {
      if (t.transactionType === 'payment') totalPaid += Number(t.amount) || 0;
      else if (t.transactionType === 'penalty') totalPenalties += Number(t.amount) || 0;
      else if (t.transactionType === 'adjustment') totalAdjustments += Number(t.amount) || 0;
    }

    // Base interest (10% of principal)
    const baseInterest = Math.round(initialPrincipal * (interestRate / 100) * 100) / 100;

    // Date comparison (YYYY-MM-DD strings — same timezone, no UTC shift)
    const todayStr = getTodayStr();
    const dueDateStr = loan.dueDate || '';

    const isOverdue = dueDateStr && todayStr > dueDateStr;
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
    const totalPayable = initialPrincipal + totalInterest + totalPenalties - totalAdjustments;
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
 * High-performance bulk sync for all active/overdue loans.
 * Executes in 2 queries total (instead of 5 * N queries) and writes changes in bulk.
 * Throttled to run at most once every 60 seconds per server instance.
 */
async function syncAllLoanBalances(force = false) {
  const now = Date.now();
  if (!force && (now - lastGlobalSyncTime < SYNC_THROTTLE_MS)) {
    return;
  }
  lastGlobalSyncTime = now;

  try {
    const todayStr = getTodayStr();
    const todayDate = new Date(todayStr + 'T00:00:00');

    // 1. Fetch all active/overdue loans in 1 query
    const loans = await Loan.find({ status: { $ne: 'completed' } }).lean();
    if (loans.length === 0) return;

    const loanIds = loans.map(l => l._id);

    // 2. Fetch all transactions for these loans in 1 query
    const allTxns = await Transaction.find({ loanId: { $in: loanIds } }).lean();
    const txnMap = new Map();
    for (const t of allTxns) {
      const lid = t.loanId.toString();
      if (!txnMap.has(lid)) txnMap.set(lid, { paid: 0, penalties: 0, adjustments: 0 });
      const entry = txnMap.get(lid);
      if (t.transactionType === 'payment') entry.paid += Number(t.amount) || 0;
      else if (t.transactionType === 'penalty') entry.penalties += Number(t.amount) || 0;
      else if (t.transactionType === 'adjustment') entry.adjustments += Number(t.amount) || 0;
    }

    const bulkOps = [];
    for (const loan of loans) {
      const lid = loan._id.toString();
      const initialPrincipal = Number(loan.amountTaken) || 0;
      const interestRate = Number(loan.interestRate) || 10.00;
      const baseInterest = Math.round(initialPrincipal * (interestRate / 100) * 100) / 100;

      const txns = txnMap.get(lid) || { paid: 0, penalties: 0, adjustments: 0 };
      const dueDateStr = loan.dueDate || '';
      const isOverdue = dueDateStr && todayStr > dueDateStr;

      let daysOverdue = 0, overdueWeeks = 0;
      if (isOverdue) {
        const dueDate = new Date(dueDateStr + 'T00:00:00');
        daysOverdue = Math.max(0, Math.floor((todayDate - dueDate) / (1000 * 60 * 60 * 24)));
        overdueWeeks = Math.ceil(daysOverdue / 7);
      }

      const overdueInterest = overdueWeeks * baseInterest;
      const totalInterest = baseInterest + overdueInterest;
      const totalPayable = initialPrincipal + totalInterest + txns.penalties - txns.adjustments;
      let remainingAmount = Math.max(0, totalPayable - txns.paid);

      let status = 'active';
      if (remainingAmount <= 0) {
        status = 'completed';
        remainingAmount = 0;
      } else if (isOverdue) {
        status = 'overdue';
      }

      // Only push update if values differ
      if (
        loan.status !== status ||
        loan.remainingAmount !== remainingAmount ||
        loan.totalPaid !== txns.paid ||
        loan.interestAmount !== totalInterest ||
        loan.totalPayable !== totalPayable
      ) {
        bulkOps.push({
          updateOne: {
            filter: { _id: loan._id },
            update: {
              $set: {
                interestAmount: totalInterest,
                totalPayable,
                totalPaid: txns.paid,
                remainingAmount,
                status
              }
            }
          }
        });
      }
    }

    if (bulkOps.length > 0) {
      await Loan.bulkWrite(bulkOps);
    }
  } catch (err) {
    console.error('Error in bulk syncing loan balances:', err.message);
  }
}

/**
 * Alias used by routes that call updateAllRecordStatuses().
 */
async function updateAllRecordStatuses(force = false) {
  await syncAllLoanBalances(force);
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
