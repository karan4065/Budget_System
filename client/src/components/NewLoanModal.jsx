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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div 
        className="fixed inset-0 bg-black/70 dark:bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg bg-white dark:bg-surface-900 border border-slate-200 dark:border-surface-700/80 rounded-2xl shadow-2xl overflow-hidden z-10 animate-scale-up my-8 text-slate-900 dark:text-slate-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-surface-800 bg-slate-50 dark:bg-surface-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 dark:bg-purple-600/20 border border-purple-500/30 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Issue New Loan</h3>
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500 text-base font-semibold transition-all"
              />
            </div>
          </div>

          {/* Duration Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Repayment Frequency <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { key: 'weekly', label: 'Weekly', days: '+7 Days' },
                { key: 'fortnight', label: 'Fortnightly', days: '+14 Days' },
                { key: 'monthly', label: 'Monthly', days: '+1 Month' },
              ].map((opt) => {
                const isSelected = formData.duration === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => handleChange('duration', opt.key)}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      isSelected
                        ? 'bg-brand-50 border-brand-500 text-brand-700 dark:bg-brand-600/25 dark:border-brand-500 dark:text-white shadow-md shadow-brand-500/10 dark:shadow-brand-500/20 ring-1 ring-brand-500'
                        : 'bg-slate-50 dark:bg-surface-950 border-slate-200 dark:border-surface-700/80 text-slate-600 dark:text-slate-300 hover:border-brand-300 dark:hover:border-surface-600'
                    }`}
                  >
                    <span className="font-bold text-xs sm:text-sm block">{opt.label}</span>
                    <span className={`text-[11px] font-semibold ${isSelected ? 'text-brand-600 dark:text-brand-300' : 'text-slate-400'}`}>
                      {opt.days}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Instant 10% Interest & Payable Calculation Preview Card */}
          {formData.amountTaken > 0 && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-purple-50 via-indigo-50/50 to-brand-50 dark:from-surface-950 dark:via-surface-950 dark:to-surface-900 border border-purple-200 dark:border-purple-500/30 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                  <span>10% Interest Breakdown</span>
                </span>
                <span className="text-[10px] font-mono uppercase bg-purple-500/20 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full font-bold">
                  Interest Rate: {interestRate}%
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-white/80 dark:bg-surface-900/80 p-2 rounded-lg border border-slate-200/80 dark:border-surface-800">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Principal</p>
                  <p className="font-bold text-slate-900 dark:text-white font-mono mt-0.5">{formatCurrency(principal)}</p>
                </div>
                <div className="bg-white/80 dark:bg-surface-900/80 p-2 rounded-lg border border-slate-200/80 dark:border-surface-800">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Interest (10%)</p>
                  <p className="font-bold text-amber-600 dark:text-amber-400 font-mono mt-0.5">+{formatCurrency(interestAmount)}</p>
                </div>
                <div className="bg-purple-500/10 dark:bg-purple-500/20 p-2 rounded-lg border border-purple-300 dark:border-purple-500/40">
                  <p className="text-[10px] text-purple-700 dark:text-purple-300 font-semibold">Total Payable</p>
                  <p className="font-extrabold text-purple-700 dark:text-purple-300 font-mono mt-0.5 text-sm">{formatCurrency(totalPayable)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Start Date & Calculated Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Loan Start Date
              </label>
              <input
                type="date"
                required
                value={formData.startDate}
                onChange={(e) => handleChange('startDate', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 text-sm"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Disbursement Mode
              </label>
              <select
                value={formData.paymentMode}
                onChange={(e) => handleChange('paymentMode', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 text-sm"
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
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-surface-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-surface-800 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-600/30 active:scale-95 disabled:opacity-50 transition-all"
            >
              {loading ? 'Creating...' : 'Issue New Loan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
