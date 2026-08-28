// Utility formatters and calculations

export function formatCurrency(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatDate(dateString) {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch (e) {
    return dateString;
  }
}

export function calculateDueDate(startDateStr, duration) {
  if (!startDateStr) return '';
  const date = new Date(startDateStr);
  if (isNaN(date.getTime())) return '';

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

export function getDurationDays(duration) {
  const norm = (duration || 'weekly').toLowerCase();
  if (norm === 'weekly') return 7;
  if (norm === 'fortnight' || norm === 'fortnightly') return 14;
  return 30;
}

export function getOrdinal(n) {
  const num = parseInt(n, 10);
  if (isNaN(num)) return `${n}`;
  const s = ['th', 'st', 'nd', 'rd'];
  const v = num % 100;
  return num + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function getLoanOrdinalLabel(loanNumber) {
  if (!loanNumber) return 'Loan';
  return `${getOrdinal(loanNumber)} Loan`;
}

export function getDurationLabel(duration) {
  switch ((duration || '').toLowerCase()) {
    case 'weekly':
      return 'Weekly (7 Days)';
    case 'fortnight':
    case 'fortnightly':
      return 'Fortnight (14 Days)';
    case 'monthly':
      return 'Monthly (30 Days)';
    default:
      return duration || 'Weekly (7 Days)';
  }
}

export function calculateInterestAndPayable(principalAmount, rate = 10) {
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

export function maskAadhaar(aadhaar) {
  if (!aadhaar) return 'Not Provided';
  const clean = aadhaar.toString().replace(/\D/g, '');
  if (clean.length < 4) return 'XXXX-XXXX-XXXX';
  const last4 = clean.slice(-4);
  return `XXXX-XXXX-${last4}`;
}

export function getDueStatusInfo(dueDateStr, remainingAmount) {
  if (remainingAmount <= 0) {
    return {
      label: 'Completed / Paid',
      status: 'completed',
      badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30',
      textClass: 'text-emerald-600 dark:text-emerald-400'
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDateStr);
  due.setHours(0, 0, 0, 0);

  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const daysLate = Math.abs(diffDays);
    return {
      label: `Overdue by ${daysLate} day${daysLate > 1 ? 's' : ''}`,
      status: 'overdue',
      badgeClass: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 animate-pulse',
      textClass: 'text-rose-600 dark:text-rose-400'
    };
  } else if (diffDays === 0) {
    return {
      label: 'Due Today',
      status: 'active',
      badgeClass: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30',
      textClass: 'text-amber-600 dark:text-amber-300'
    };
  } else if (diffDays === 1) {
    return {
      label: 'Due Tomorrow',
      status: 'active',
      badgeClass: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30',
      textClass: 'text-indigo-600 dark:text-indigo-300'
    };
  } else {
    return {
      label: `Due in ${diffDays} days`,
      status: 'active',
      badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30',
      textClass: 'text-blue-600 dark:text-blue-400'
    };
  }
}

export function calculateOverdueDetails(principalAmount, rate = 10, dueDateStr, totalPaid = 0, penalties = 0, adjustments = 0) {
  const principal = parseFloat(principalAmount) || 0;
  const interestRate = Number(rate) || 10;
  const baseInterest = Math.round(principal * (interestRate / 100) * 100) / 100;
  
  if (!dueDateStr) {
    return {
      principal,
      interestRate,
      baseInterest,
      daysOverdue: 0,
      overdueWeeks: 0,
      overdueInterest: 0,
      totalInterest: baseInterest,
      totalPayable: principal + baseInterest + penalties - adjustments,
      remainingAmount: Math.max(0, principal + baseInterest + penalties - adjustments - totalPaid),
      isOverdue: false
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDateStr);
  due.setHours(0, 0, 0, 0);

  const diffTime = today.getTime() - due.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const isOverdue = diffDays > 0;
  const daysOverdue = Math.max(0, diffDays);
  const overdueWeeks = isOverdue ? Math.ceil(daysOverdue / 7) : 0;
  const overdueInterest = overdueWeeks * baseInterest;
  const totalInterest = baseInterest + overdueInterest;
  const totalPayable = principal + totalInterest + penalties - adjustments;
  const remainingAmount = Math.max(0, totalPayable - totalPaid);

  return {
    principal,
    interestRate,
    baseInterest,
    daysOverdue,
    overdueWeeks,
    overdueInterest,
    totalInterest,
    totalPayable,
    remainingAmount,
    isOverdue: isOverdue && remainingAmount > 0
  };
}


