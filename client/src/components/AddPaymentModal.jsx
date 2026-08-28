import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useNotify } from '../context/NotificationContext';
import { useSync } from '../context/SyncContext';
import { formatCurrency, formatDate } from '../utils/formatters';
import { X, CreditCard, DollarSign, Calendar, FileText, Check, AlertCircle, Percent, Sparkles, RefreshCw } from 'lucide-react';

export function AddPaymentModal({ isOpen, onClose, loanRecord, client, onSuccess, onOpenReceipt }) {
  const { success, error } = useNotify();
  const { triggerRefresh } = useSync();
  const todayStr = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    amount: '',
    transactionType: 'payment',
    transactionDate: todayStr,
    paymentMode: 'Cash',
    note: '',
    isInterestRenewal: false,
    extendDueDate: false
  });
  const [markAsPendingAndComplete, setMarkAsPendingAndComplete] = useState(false);
  const [openReceiptAfter, setOpenReceiptAfter] = useState(true);
  const [loading, setLoading] = useState(false);

  // Auto-prefill when opened via a quick-pay button (_quickPayType)
  useEffect(() => {
    setMarkAsPendingAndComplete(false);
    if (!isOpen || !loanRecord) return;
    const qType = loanRecord._quickPayType;
    const qAmount = loanRecord._quickPayAmount;
    if (qType === 'interest' && qAmount) {
      setFormData(prev => ({
        ...prev,
        amount: String(qAmount),
        transactionType: 'payment',
        isInterestRenewal: true,
        extendDueDate: true,
        note: loanRecord._quickPayLabel || `Interest Only Payment — ₹${Number(qAmount).toLocaleString('en-IN')}`
      }));
    } else if (qType === 'full' && qAmount) {
      setFormData(prev => ({
        ...prev,
        amount: String(qAmount),
        transactionType: 'payment',
        isInterestRenewal: false,
        extendDueDate: false,
        note: loanRecord._quickPayLabel || `Full Settlement — ₹${Number(qAmount).toLocaleString('en-IN')}`
      }));
    } else {
      // Reset form for normal open
      setFormData({
        amount: '',
        transactionType: 'payment',
        transactionDate: todayStr,
        paymentMode: 'Cash',
        note: '',
        isInterestRenewal: false,
        extendDueDate: false
      });
    }
  }, [isOpen, loanRecord?.id, loanRecord?._quickPayType]);

  if (!isOpen || !loanRecord) return null;

  const principal = Number(loanRecord.amountTaken ?? loanRecord.amount_taken ?? 0);
  const rate = Number(loanRecord.interestRate ?? loanRecord.interest_rate ?? 10);
  const baseInterest = Math.round(principal * (rate / 100) * 100) / 100;
  const interestAmount = Number(loanRecord.interestAmount ?? loanRecord.interest_amount ?? baseInterest);
  const totalPayable = Number(loanRecord.totalPayable ?? loanRecord.total_payable ?? (principal + interestAmount));
  const totalPaid = Number(loanRecord.totalPaid ?? loanRecord.total_paid ?? 0);
  const duration = loanRecord.duration || 'weekly';
  const currentDueDate = loanRecord.dueDate || loanRecord.due_date;

  const todayStrDate = new Date().toISOString().split('T')[0];
  const isOverdueDate = currentDueDate && todayStrDate > currentDueDate;
  const daysOverdue = loanRecord.daysOverdue || (isOverdueDate ? Math.max(0, Math.floor((new Date(todayStrDate) - new Date(currentDueDate)) / (1000 * 60 * 60 * 24))) : 0);
  const overdueWeeks = loanRecord.overdueWeeks || (daysOverdue > 0 ? Math.ceil(daysOverdue / 7) : 0);
  const overdueInterest = loanRecord.overdueInterest || (overdueWeeks * baseInterest);

  const getExtendedDueDatePreview = () => {
    if (!currentDueDate) return '';
    const date = new Date(currentDueDate);
    if (isNaN(date.getTime())) return '';
    if (duration === 'weekly') date.setDate(date.getDate() + 7);
    else if (duration === 'fortnight' || duration === 'fortnightly') date.setDate(date.getDate() + 14);
    else if (duration === 'monthly') date.setMonth(date.getMonth() + 1);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const previewNewDueDate = getExtendedDueDatePreview();

  // Full payable remaining
  const remainingPayable = Math.max(0, Number(loanRecord.remainingAmount ?? loanRecord.remaining_amount ?? (totalPayable - totalPaid)));
  const parsedEnteredAmount = parseFloat(formData.amount) || 0;
  
  let projectedRemaining = remainingPayable;
  if (formData.isInterestRenewal) {
    projectedRemaining = principal + baseInterest; // New cycle carries Principal + 10% Interest
  } else if (formData.transactionType === 'payment' || formData.transactionType === 'adjustment') {
    projectedRemaining = Math.max(0, remainingPayable - parsedEnteredAmount);
  } else if (formData.transactionType === 'penalty') {
    projectedRemaining = remainingPayable + parsedEnteredAmount;
  }

  const isExceeding = formData.transactionType === 'payment' && !formData.isInterestRenewal && remainingPayable > 0 && parsedEnteredAmount > remainingPayable;
  const isFullSettlement = formData.transactionType === 'payment' && parsedEnteredAmount === remainingPayable && remainingPayable > 0;
  const isInterestOnlyPayment = formData.isInterestRenewal || (formData.transactionType === 'payment' && parsedEnteredAmount === interestAmount);

  const handleSelectInterestOnly = () => {
    setFormData(prev => ({
      ...prev,
      amount: interestAmount.toString(),
      transactionType: 'payment',
      isInterestRenewal: true,
      extendDueDate: true,
      note: `Interest Payment (${formatCurrency(interestAmount)}) - Loan cycle renewed by +1 ${duration} to ${previewNewDueDate}`
    }));
  };

  const handleSelectFullPayable = () => {
    setFormData(prev => ({
      ...prev,
      amount: remainingPayable.toString(),
      transactionType: 'payment',
      isInterestRenewal: false,
      extendDueDate: false,
      note: `Full settlement (Principal ${formatCurrency(principal)} + Interest ${formatCurrency(interestAmount)}) complete`
    }));
  };

  const handleAmountChange = (e) => {
    const val = e.target.value;
    if (val === '') {
      setFormData(p => ({ ...p, amount: '' }));
      return;
    }
    const num = parseFloat(val);
    if (formData.transactionType === 'payment' && !formData.isInterestRenewal && remainingPayable > 0) {
      if (!isNaN(num) && num > remainingPayable) {
        // If user enters more than total payable, automatically make it as full payment amount
        setFormData(p => ({ ...p, amount: String(remainingPayable) }));
        return;
      }
    }
    setFormData(p => ({ ...p, amount: val }));
  };

  const handleAmountBlur = () => {
    if (formData.transactionType === 'payment' && !formData.isInterestRenewal && remainingPayable > 0) {
      const num = parseFloat(formData.amount);
      if (!isNaN(num) && num > remainingPayable) {
        setFormData(p => ({ ...p, amount: String(remainingPayable) }));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    if (parsedEnteredAmount <= 0) {
      error('Please enter a valid amount greater than 0.');
      return;
    }

    if (formData.transactionType === 'payment' && !formData.isInterestRenewal) {
      if (remainingPayable <= 0) {
        error('This loan is already fully paid (Remaining: ₹0).');
        return;
      }
      if (parsedEnteredAmount > remainingPayable) {
        error(`Payment amount (${formatCurrency(parsedEnteredAmount)}) cannot exceed total payable balance (${formatCurrency(remainingPayable)}).`);
        return;
      }
    }

    setLoading(true);
    try {
      let res = null;

      if (loanRecord.isCombined && loanRecord.activeLoans && loanRecord.activeLoans.length > 1) {
        if (formData.isInterestRenewal) {
          // Interest renewal across all active loans
          for (const l of loanRecord.activeLoans) {
            const lPrincipal = Number(l.amountTaken || 0);
            const lRate = Number(l.interestRate || 10);
            const lInterest = Math.round(lPrincipal * (lRate / 100) * 100) / 100;
            if (lInterest > 0) {
              res = await api.createTransaction({
                recordId: l.id,
                amount: lInterest,
                transactionType: formData.transactionType,
                transactionDate: formData.transactionDate,
                paymentMode: formData.paymentMode,
                note: formData.note.trim() || `10% Interest Payment (Combined active loans renewal)`,
                isInterestRenewal: true,
                extendDueDate: true
              });
            }
          }
          success(`Interest payment of ${formatCurrency(parsedEnteredAmount)} recorded for all active loans!`);
        } else {
          // Distribute payment across active loans sequentially
          let remainingToDistribute = parsedEnteredAmount;
          for (const l of loanRecord.activeLoans) {
            if (remainingToDistribute <= 0) break;
            const lRemaining = Number(l.remainingAmount || 0);
            if (lRemaining <= 0) continue;
            const payAmt = Math.min(remainingToDistribute, lRemaining);
            if (payAmt > 0) {
              res = await api.createTransaction({
                recordId: l.id,
                amount: payAmt,
                transactionType: formData.transactionType,
                transactionDate: formData.transactionDate,
                paymentMode: formData.paymentMode,
                note: formData.note.trim() || `Combined loan payment (${formatCurrency(parsedEnteredAmount)})`,
                isInterestRenewal: false,
                extendDueDate: false
              });
              remainingToDistribute -= payAmt;
            }
          }
          success(`Payment of ${formatCurrency(parsedEnteredAmount)} recorded across all active loans!`);
        }
      } else {
        // Single loan transaction
        const pendingDiff = Math.max(0, remainingPayable - parsedEnteredAmount);
        res = await api.createTransaction({
          recordId: loanRecord.id,
          amount: parsedEnteredAmount,
          transactionType: formData.transactionType,
          transactionDate: formData.transactionDate,
          paymentMode: formData.paymentMode,
          note: formData.note.trim() || (markAsPendingAndComplete ? `Payment ₹${parsedEnteredAmount} + Remaining ₹${pendingDiff} marked as pending` : ''),
          isInterestRenewal: formData.isInterestRenewal,
          extendDueDate: formData.extendDueDate,
          markAsPendingAndComplete: markAsPendingAndComplete
        });

        // When marking remaining as pending and completing loan, create the adjustment transaction to balance out remaining amount
        if (markAsPendingAndComplete && pendingDiff > 0 && formData.transactionType === 'payment' && !formData.isInterestRenewal) {
          try {
            await api.createTransaction({
              recordId: loanRecord.id,
              amount: pendingDiff,
              transactionType: 'adjustment',
              transactionDate: formData.transactionDate,
              paymentMode: formData.paymentMode,
              note: `Settlement Discount / Remaining ₹${pendingDiff} marked as pending (Loan completed)`
            });
          } catch (adjErr) {
            console.warn('Note: Adjustment transaction sync:', adjErr.message);
          }
        }

        if (markAsPendingAndComplete) {
          success(`Payment of ${formatCurrency(parsedEnteredAmount)} recorded! Loan completed with ${formatCurrency(pendingDiff)} marked as pending.`);
        } else if (formData.isInterestRenewal) {
          success(`Interest payment of ${formatCurrency(parsedEnteredAmount)} recorded! Loan due date extended to ${res.newDueDate || previewNewDueDate}.`);
        } else {
          success(`Payment of ${formatCurrency(parsedEnteredAmount)} recorded successfully!`);
        }
      }

      triggerRefresh();

      if (openReceiptAfter && onOpenReceipt) {
        onOpenReceipt({
          transactionId: res?.txnId || `TXN-ALL-${Date.now()}`,
          clientName: client?.name || 'Client',
          mobileNumber: client?.mobileNumber || client?.mobile_number,
          amount: parsedEnteredAmount,
          transactionDate: formData.transactionDate,
          transactionType: formData.transactionType,
          paymentMode: formData.paymentMode,
          remainingAfter: markAsPendingAndComplete ? 0 : projectedRemaining,
          loanAmount: principal,
          totalPayable: totalPayable,
          dueDate: res?.newDueDate || loanRecord.dueDate || loanRecord.due_date,
          note: formData.note || (markAsPendingAndComplete ? `Loan Completed (₹${remainingPayable - parsedEnteredAmount} Pending Amount)` : '')
        });
      }

      if (onSuccess) onSuccess(res);
      onClose();
    } catch (err) {
      error(err.message || 'Failed to record transaction.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 overflow-hidden">
      <div 
        className="fixed inset-0 bg-black/70 dark:bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg bg-white dark:bg-surface-900 border border-slate-200 dark:border-surface-700/80 rounded-2xl shadow-2xl overflow-hidden z-10 animate-scale-up text-slate-900 dark:text-slate-100 flex flex-col max-h-[94vh] sm:max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 dark:border-surface-800 bg-slate-50 dark:bg-surface-950/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 dark:bg-emerald-600/20 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">Record Loan Payment</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Client: <span className="font-semibold text-slate-800 dark:text-slate-200">{client?.name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-surface-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Financial Summary Banner */}
        <div className="bg-slate-100 dark:bg-surface-950 px-4 sm:px-6 py-2.5 sm:py-3 border-b border-slate-200 dark:border-surface-800 grid grid-cols-3 text-center text-xs flex-shrink-0">
          <div>
            <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase">Principal</span>
            <span className="font-bold text-slate-800 dark:text-slate-200 font-mono text-xs">
              {formatCurrency(principal)}
            </span>
          </div>
          <div className="border-x border-slate-200 dark:border-surface-800">
            <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase">
              {daysOverdue > 0 ? `Interest (Wk ${overdueWeeks})` : '10% Interest'}
            </span>
            <span className="font-bold text-amber-600 dark:text-amber-400 font-mono text-xs">
              +{formatCurrency(interestAmount)}
            </span>
          </div>
          <div>
            <span className="text-rose-600 dark:text-rose-400 font-semibold block text-[10px] uppercase">
              {daysOverdue > 0 ? 'Overdue Due' : 'Total Payable'}
            </span>
            <span className="font-extrabold text-rose-600 dark:text-rose-400 font-mono text-xs sm:text-sm">
              {formatCurrency(remainingPayable)}
            </span>
          </div>
        </div>

        {/* Form Body - Scrollable Container */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
            {/* Overdue alert notice */}
            {daysOverdue > 0 && (
              <div className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-800 dark:text-rose-300 flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                  <span>{daysOverdue} days overdue (Week {overdueWeeks} accrual)</span>
                </div>
                <span className="font-bold text-rose-700 dark:text-rose-300">
                  +{formatCurrency(overdueInterest)} extra interest
                </span>
              </div>
            )}

            {/* Quick Pay Context Banner — shown when opened from a quick-pay button */}
            {loanRecord._quickPayType && (
              <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-xs font-semibold ${
                loanRecord._quickPayType === 'interest'
                  ? 'bg-amber-50 dark:bg-amber-900/25 border-amber-200 dark:border-amber-500/40 text-amber-800 dark:text-amber-300'
                  : 'bg-emerald-50 dark:bg-emerald-900/25 border-emerald-200 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300'
              }`}>
                <span className="text-lg">{loanRecord._quickPayType === 'interest' ? '💰' : '✅'}</span>
                <div>
                  <span className="font-bold">
                    {loanRecord._quickPayType === 'interest' ? 'Interest Only Payment' : 'Full Settlement'}
                  </span>
                  <span className="ml-2 font-normal opacity-80">
                    — Amount pre-filled: {formatCurrency(loanRecord._quickPayAmount)}
                  </span>
                </div>
              </div>
            )}

            {/* Quick Select Buttons including Pay Full and Pay Interest Only */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Quick Selection
                </label>
                {remainingPayable > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectFullPayable}
                    className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline"
                  >
                    Pay Full ({formatCurrency(remainingPayable)})
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2.5">
                {/* Option 1: Pay 10% Interest Only (Renewal) */}
                <button
                  type="button"
                  onClick={handleSelectInterestOnly}
                  className="p-2.5 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-left transition-all group"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                      <Percent className="w-3.5 h-3.5" />
                      <span>Pay Interest Only</span>
                    </span>
                    <span className="font-mono font-extrabold text-amber-700 dark:text-amber-300 text-sm">
                      {formatCurrency(interestAmount)}
                    </span>
                  </div>
                  <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80 mt-1">
                    10% interest for cycle renewal
                  </p>
                </button>

                {/* Option 2: Pay Full Total Payable */}
                <button
                  type="button"
                  onClick={handleSelectFullPayable}
                  className="p-2.5 rounded-xl border border-purple-300 dark:border-purple-500/40 bg-purple-50/60 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-left transition-all group"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-purple-800 dark:text-purple-300 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Pay Full Settlement</span>
                    </span>
                    <span className="font-mono font-extrabold text-purple-700 dark:text-purple-300 text-sm">
                      {formatCurrency(remainingPayable)}
                    </span>
                  </div>
                  <p className="text-[10px] text-purple-700/80 dark:text-purple-400/80 mt-1">
                    Principal + 10% Interest complete
                  </p>
                </button>
              </div>

              {/* Incremental Quick Select chips */}
              <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                {[500, 1000, 2000, 5000].map(val => {
                  const targetAmt = remainingPayable > 0 ? Math.min(remainingPayable, val) : val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setFormData(p => ({ ...p, amount: targetAmt.toString() }))}
                      className="py-1.5 px-1 text-xs font-semibold bg-slate-50 hover:bg-slate-100 dark:bg-surface-950 dark:hover:bg-surface-800 border border-slate-200 dark:border-surface-700 rounded-lg text-slate-700 dark:text-slate-300 transition-colors text-center truncate"
                    >
                      +{formatCurrency(val)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Amount Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>Payment Amount (₹) <span className="text-rose-500">*</span></span>
                {parsedEnteredAmount > 0 && !isExceeding && (
                  <span className="text-xs text-brand-600 dark:text-brand-300 font-semibold">{formatCurrency(parsedEnteredAmount)}</span>
                )}
                {remainingPayable > 0 && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    Max: {formatCurrency(remainingPayable)}
                  </span>
                )}
              </label>
              <div className="relative">
                <span className={`absolute inset-y-0 left-0 pl-3.5 flex items-center font-bold ${
                  isExceeding ? 'text-rose-500' : 'text-slate-400'
                }`}>₹</span>
                <input
                  type="number"
                  min="1"
                  max={remainingPayable > 0 ? remainingPayable : undefined}
                  step="any"
                  required
                  placeholder={`Enter amount (max ${remainingPayable})`}
                  value={formData.amount}
                  onChange={handleAmountChange}
                  onBlur={handleAmountBlur}
                  className={`w-full pl-9 pr-3.5 py-2.5 rounded-xl border text-base sm:text-lg font-bold transition-all focus:outline-none ${
                    isExceeding
                      ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-300 focus:border-rose-600'
                      : 'bg-slate-50 dark:bg-surface-950 border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-brand-500'
                  }`}
                />
              </div>

              {isExceeding && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 mt-1.5 animate-fade-in bg-rose-50 dark:bg-rose-950/30 p-2.5 rounded-lg border border-rose-200 dark:border-rose-500/30">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Invalid amount! You cannot enter more than the remaining loan balance of {formatCurrency(remainingPayable)}.</span>
                </div>
              )}
            </div>

            {/* Pending Balance / Close Loan Option when payment is less than total payable */}
            {parsedEnteredAmount > 0 && parsedEnteredAmount < remainingPayable && !formData.isInterestRenewal && formData.transactionType === 'payment' && (
              <div className={`p-3 sm:p-3.5 rounded-xl border transition-all ${
                markAsPendingAndComplete 
                  ? 'border-amber-400 bg-amber-50/80 dark:border-amber-500/50 dark:bg-amber-950/40 shadow-sm' 
                  : 'border-slate-200 dark:border-surface-800 bg-slate-50/70 dark:bg-surface-950/40 hover:border-slate-300 dark:hover:border-surface-700'
              }`}>
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={markAsPendingAndComplete}
                    onChange={(e) => setMarkAsPendingAndComplete(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-amber-600 bg-white dark:bg-surface-950 border-slate-300 dark:border-surface-700 focus:ring-amber-500 cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        Mark Remaining ({formatCurrency(remainingPayable - parsedEnteredAmount)}) as Pending & Complete Loan
                      </span>
                      {markAsPendingAndComplete && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                          Complete Loan
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                      Closes and completes this loan now. The unpaid balance of <strong>{formatCurrency(remainingPayable - parsedEnteredAmount)}</strong> will be recorded as pending amount on the client profile.
                    </p>
                  </div>
                </label>
              </div>
            )}

            {/* Live Remaining Balance Projection Card */}
            {parsedEnteredAmount > 0 && (
              <div className={`p-3.5 rounded-xl border flex items-center justify-between text-xs transition-all ${
                isFullSettlement
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-500/40 dark:text-emerald-300' 
                  : markAsPendingAndComplete
                  ? 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-500/40 dark:text-amber-200'
                  : isInterestOnlyPayment
                  ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-500/40 dark:text-amber-300'
                  : 'bg-brand-50 border-brand-200 text-brand-800 dark:bg-brand-950/30 dark:border-brand-500/30 dark:text-brand-300'
              }`}>
                <div>
                  <p className="font-semibold text-slate-600 dark:text-slate-300">
                    {isInterestOnlyPayment 
                      ? 'New Cycle Total Payable (Principal + 10% Int):' 
                      : markAsPendingAndComplete 
                      ? 'Pending Balance Saved (Loan Completed):' 
                      : 'Remaining Balance After Payment:'}
                  </p>
                  <p className="text-base font-bold font-mono mt-0.5">
                    {markAsPendingAndComplete
                      ? formatCurrency(remainingPayable - parsedEnteredAmount)
                      : formatCurrency(projectedRemaining)}
                  </p>
                </div>
                {isFullSettlement ? (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40 font-bold uppercase tracking-wider text-[10px]">
                    Loan Completed! 🎉
                  </span>
                ) : markAsPendingAndComplete ? (
                  <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 font-bold uppercase tracking-wider text-[10px]">
                    Loan Completed ({formatCurrency(remainingPayable - parsedEnteredAmount)} Pending) ✨
                  </span>
                ) : isInterestOnlyPayment ? (
                  <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 font-bold uppercase tracking-wider text-[10px]">
                    +1 {duration} Cycle Extended
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Status: Active
                  </span>
                )}
              </div>
            )}

            {/* Cycle Extension Info Alert */}
            {formData.isInterestRenewal && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-300 text-xs flex items-start gap-2.5 animate-fade-in">
                <RefreshCw className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5 animate-spin-slow" />
                <div>
                  <span className="font-bold block">10% Interest Payment & Cycle Renewal</span>
                  <p className="text-[11px] text-amber-700/90 dark:text-amber-400/90 mt-0.5">
                    Client pays {formatCurrency(interestAmount)} interest. Due date will be extended to <strong>{previewNewDueDate}</strong> (+1 {duration}) with a new cycle total payable of <strong>{formatCurrency(principal + interestAmount)}</strong> (Principal {formatCurrency(principal)} + 10% Interest {formatCurrency(interestAmount)}).
                  </p>
                </div>
              </div>
            )}

            {/* Transaction Type & Payment Mode in 2 cols */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Transaction Type
                </label>
                <select
                  value={formData.transactionType}
                  onChange={(e) => setFormData(p => ({ ...p, transactionType: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 text-xs sm:text-sm"
                >
                  <option value="payment">Payment / Repayment</option>
                  <option value="penalty">Penalty / Fine (+ Outstanding)</option>
                  <option value="adjustment">Discount / Settlement Adjustment</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Payment Mode
                </label>
                <select
                  value={formData.paymentMode}
                  onChange={(e) => setFormData(p => ({ ...p, paymentMode: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 text-xs sm:text-sm"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI / GPay / PhonePe</option>
                  <option value="Bank Transfer">Bank Transfer (IMPS/NEFT)</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
            </div>

            {/* Transaction Date */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Transaction Date
              </label>
              <input
                type="date"
                required
                value={formData.transactionDate}
                onChange={(e) => setFormData(p => ({ ...p, transactionDate: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 text-xs sm:text-sm"
              />
            </div>

            {/* Note */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Remarks / Note (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Weekly interest payment or full settlement"
                value={formData.note}
                onChange={(e) => setFormData(p => ({ ...p, note: e.target.value }))}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500 text-xs sm:text-sm"
              />
            </div>

            {/* Receipt generation checkbox */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="openReceiptCheck"
                checked={openReceiptAfter}
                onChange={(e) => setOpenReceiptAfter(e.target.checked)}
                className="w-4 h-4 rounded text-brand-600 bg-slate-50 dark:bg-surface-950 border-slate-300 dark:border-surface-700 focus:ring-brand-500 cursor-pointer"
              />
              <label htmlFor="openReceiptCheck" className="text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                Generate & view printable receipt after saving
              </label>
            </div>
          </div>

          {/* Action buttons - Fixed Footer */}
          <div className="flex items-center justify-end gap-2.5 sm:gap-3 px-4 sm:px-6 py-3 sm:py-3.5 border-t border-slate-200 dark:border-surface-800 bg-slate-50/90 dark:bg-surface-950/90 backdrop-blur flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-surface-800 text-xs sm:text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || isExceeding || parsedEnteredAmount <= 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-600/30 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Recording...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Record Payment</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
