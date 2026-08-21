const { calculateDueDate, getDurationDays } = require('./src/db');
const { normalizePhoneNumber, getReminderMessageText } = require('./src/services/whatsapp');

function calculateInterestAndPayable(principalAmount, rate = 10) {
  const principal = parseFloat(principalAmount) || 0;
  const interestRate = Number(rate) || 10;
  const interestAmount = Math.round(principal * (interestRate / 100) * 100) / 100;
  const totalPayable = principal + interestAmount;
  return {
    principal,
    interestRate,
    interestAmount,
    totalPayable
  };
}

console.log('=== Running Interest & WhatsApp Reminders Unit Tests ===\n');

// Test 1: Weekly Due Date (+7 Days)
const weeklyDue = calculateDueDate('2026-08-20', 'weekly');
console.log('Test 1 - Weekly Due Date (2026-08-20 + 7 days):', weeklyDue);
if (weeklyDue !== '2026-08-27') throw new Error(`Weekly due date expected 2026-08-27, got ${weeklyDue}`);

// Test 2: Fortnight Due Date (+14 Days)
const fortnightDue = calculateDueDate('2026-08-20', 'fortnight');
console.log('Test 2 - Fortnight Due Date (2026-08-20 + 14 days):', fortnightDue);
if (fortnightDue !== '2026-09-03') throw new Error(`Fortnight due date expected 2026-09-03, got ${fortnightDue}`);

// Test 3: Monthly Due Date (+1 Month)
const monthlyDue = calculateDueDate('2026-08-20', 'monthly');
console.log('Test 3 - Monthly Due Date (2026-08-20 + 1 month):', monthlyDue);
if (monthlyDue !== '2026-09-20') throw new Error(`Monthly due date expected 2026-09-20, got ${monthlyDue}`);

// Test 4: 10% Interest Calculations
const calc1 = calculateInterestAndPayable(1000, 10);
console.log('\nTest 4 - 10% Interest on ₹1,000:', calc1);
if (calc1.interestAmount !== 100 || calc1.totalPayable !== 1100) throw new Error('Interest calc failed for 1000');

const calc2 = calculateInterestAndPayable(5000, 10);
console.log('Test 5 - 10% Interest on ₹5,000:', calc2);
if (calc2.interestAmount !== 500 || calc2.totalPayable !== 5500) throw new Error('Interest calc failed for 5000');

const calc3 = calculateInterestAndPayable(10000, 10);
console.log('Test 6 - 10% Interest on ₹10,000:', calc3);
if (calc3.interestAmount !== 1000 || calc3.totalPayable !== 11000) throw new Error('Interest calc failed for 10000');

// Test 7: Phone number normalization
const phone1 = normalizePhoneNumber('9876543210');
console.log('\nTest 7 - Phone normalization 9876543210 ->', phone1);
if (phone1 !== '+919876543210') throw new Error('Phone normalization failed for 10 digit number');

const phone2 = normalizePhoneNumber('+919876543210');
console.log('Test 8 - Phone normalization +919876543210 ->', phone2);
if (phone2 !== '+919876543210') throw new Error('Phone normalization failed for +91 number');

// Test 9: WhatsApp message templates
const msgTomorrow = getReminderMessageText('due_tomorrow', { clientName: 'Rahul', amount: 1100, dueDate: '27 Aug 2026' });
console.log('\nTest 9 - Message (Due Tomorrow):', msgTomorrow);
if (!msgTomorrow.includes('due tomorrow, 27 Aug 2026')) throw new Error('Due tomorrow template mismatch');

const msgToday = getReminderMessageText('due_today', { clientName: 'Rahul', amount: 600, dueDate: '27 Aug 2026' });
console.log('Test 10 - Message (Due Today with partial remaining ₹600):', msgToday);
if (!msgToday.includes('due today, 27 Aug 2026') || !msgToday.includes('600')) throw new Error('Due today template mismatch');

const msgOverdue = getReminderMessageText('overdue', { clientName: 'Rahul', amount: 600, dueDate: '27 Aug 2026' });
console.log('Test 11 - Message (Overdue):', msgOverdue);
if (!msgOverdue.includes('currently overdue')) throw new Error('Overdue template mismatch');

console.log('\n🎉 ALL INTEREST & WHATSAPP UNIT TESTS PASSED SUCCESSFULLY!');
