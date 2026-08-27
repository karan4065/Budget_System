import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useNotify } from '../context/NotificationContext';
import { useSync } from '../context/SyncContext';
import { calculateDueDate, formatDate, formatCurrency, calculateInterestAndPayable } from '../utils/formatters';
import { X, Plus, Calendar, Clock, DollarSign, Check, History, Sparkles } from 'lucide-react';

export function NewLoanModal({ isOpen, onClose, client, onSuccess }) {
  const { success, error } = useNotify();
  const { triggerRefresh } = useSync();
  const todayStr = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    amountTaken: '',
    duration: 'weekly',
    startDate: todayStr,
    paymentMode: 'Cash',
    note: ''
  });

  const [loading, setLoading] = useState(false);
  const [calculatedDueDate, setCalculatedDueDate] = useState('');

  useEffect(() => {
    if (formData.startDate && formData.duration) {
      const due = calculateDueDate(formData.startDate, formData.duration);
      setCalculatedDueDate(due);
    }
  }, [formData.startDate, formData.duration]);

  if (!isOpen || !client) return null;

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const { principal, interestRate, interestAmount, totalPayable } = calculateInterestAndPayable(formData.amountTaken, 10);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    const amount = parseFloat(formData.amountTaken);
    if (isNaN(amount) || amount <= 0) {
      error('Please enter a valid loan amount greater than 0.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.addLoanToClient(client.id, {
        amountTaken: amount,
        duration: formData.duration,
        startDate: formData.startDate,
        paymentMode: formData.paymentMode,
        note: formData.note.trim() || 'New loan cycle'
      });

      success(`New loan of ${formatCurrency(amount)} (+10% interest = ${formatCurrency(res.totalPayable || totalPayable)}) added for ${client.name}! First due: ${formatDate(res.dueDate)}`);
      triggerRefresh();
      if (onSuccess) onSuccess(res.recordId);
      onClose();
    } catch (err) {
      error(err.message || 'Failed to add new loan.');
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
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 dark:bg-purple-600/20 border border-purple-500/30 text-purple-600 dark:text-purple-400 flex items-center justify-center flex-shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">Issue New Loan</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Client: <span className="font-semibold text-slate-800 dark:text-slate-200">{client.name}</span> (+91 {client.mobileNumber || client.mobile_number})
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

        {/* Form Body - Scrollable Container */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
            {/* Amount Taken */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>Principal Loan Amount (₹) <span className="text-rose-500">*</span></span>
                {formData.amountTaken > 0 && (
                  <span className="text-xs text-brand-600 dark:text-brand-300 font-semibold">{formatCurrency(parseFloat(formData.amountTaken))}</span>
                )}
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 font-bold">₹</span>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  placeholder="Enter principal amount (e.g. 5000, 1000)"
                  value={formData.amountTaken}
                  onChange={(e) => handleChange('amountTaken', e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500 text-base sm:text-lg font-bold transition-all"
                />
              </div>

              {/* Quick Select Preset Buttons */}
              <div className="grid grid-cols-4 gap-1.5 sm:gap-2 mt-2">
                {[1000, 2000, 5000, 10000].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleChange('amountTaken', val.toString())}
                    className="py-1.5 px-1 text-xs font-semibold bg-slate-50 hover:bg-slate-100 dark:bg-surface-950 dark:hover:bg-surface-800 border border-slate-200 dark:border-surface-700 rounded-lg text-slate-700 dark:text-slate-300 transition-colors text-center truncate"
                  >
                    ₹{val.toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
            </div>

            {/* Interest & Total Payable Calculation Breakdown Box */}
            <div className="p-3.5 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-500/30 space-y-2 text-xs">
              <div className="flex items-center justify-between text-purple-900 dark:text-purple-300 font-bold">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>Rule: 10% Interest Added</span>
                </span>
                <span className="font-mono">+{formatCurrency(interestAmount)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-purple-200 dark:border-purple-500/20 pt-1.5 font-bold">
                <span className="text-slate-600 dark:text-slate-300">Total Payable Amount:</span>
                <span className="text-sm font-extrabold text-purple-700 dark:text-purple-300 font-mono">
                  {formatCurrency(totalPayable)}
                </span>
              </div>
            </div>

            {/* Repayment Schedule / Duration */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Repayment Frequency <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'weekly', label: 'Weekly', days: '7 Days' },
                  { id: 'fortnight', label: 'Fortnight', days: '14 Days' },
                  { id: 'monthly', label: 'Monthly', days: '30 Days' }
                ].map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleChange('duration', item.id)}
                    className={`p-2 sm:p-2.5 rounded-xl border text-center transition-all ${
                      formData.duration === item.id
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-bold shadow-sm'
                        : 'border-slate-200 dark:border-surface-700 bg-slate-50 dark:bg-surface-950 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-xs font-bold">{item.label}</div>
                    <div className="text-[10px] opacity-75">{item.days}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Start Date & Calculated Due Date in 2 cols */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Issue / Start Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={(e) => handleChange('startDate', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 text-xs sm:text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  First Due Date
                </label>
                <div className="px-3.5 py-2.5 rounded-xl bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-500/30 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-brand-700 dark:text-brand-300 font-semibold">
                    <Clock className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                    <span>{formatDate(calculatedDueDate)}</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase bg-brand-500/15 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 px-1.5 py-0.5 rounded">
                    {formData.duration === 'weekly' ? '+7 Days' : formData.duration === 'fortnight' ? '+14 Days' : '+1 Month'}
                  </span>
                </div>
              </div>
            </div>

            {/* Disbursement Mode & Remarks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Disbursement Mode
                </label>
                <select
                  value={formData.paymentMode}
                  onChange={(e) => handleChange('paymentMode', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 text-xs sm:text-sm"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI / GPay / PhonePe</option>
                  <option value="Bank Transfer">Bank Transfer (NEFT/IMPS)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Note / Reason (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Festival loan / Business expansion"
                  value={formData.note}
                  onChange={(e) => handleChange('note', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500 text-xs sm:text-sm"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons - Fixed Footer */}
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
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-600/30 active:scale-95 disabled:opacity-50 transition-all"
            >
              {loading ? 'Creating...' : 'Issue New Loan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
