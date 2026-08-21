import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useNotify } from '../context/NotificationContext';
import { useSync } from '../context/SyncContext';
import { calculateDueDate, formatDate, formatCurrency, calculateInterestAndPayable } from '../utils/formatters';
import { X, UserPlus, Calendar, Clock, DollarSign, Phone, Shield, FileText, Check, Sparkles, MessageSquare } from 'lucide-react';

export function AddClientModal({ isOpen, onClose, onSuccess }) {
  const { success, error } = useNotify();
  const { triggerRefresh } = useSync();
  const todayStr = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    name: '',
    mobileNumber: '',
    aadhaarNumber: '',
    amountTaken: '',
    duration: 'weekly',
    startDate: todayStr,
    paymentMode: 'Cash',
    address: '',
    notes: ''
  });

  const [loading, setLoading] = useState(false);
  const [calculatedDueDate, setCalculatedDueDate] = useState('');

  useEffect(() => {
    if (formData.startDate && formData.duration) {
      const due = calculateDueDate(formData.startDate, formData.duration);
      setCalculatedDueDate(due);
    }
  }, [formData.startDate, formData.duration]);

  if (!isOpen) return null;

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const { principal, interestRate, interestAmount, totalPayable } = calculateInterestAndPayable(formData.amountTaken, 10);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    // Validation
    if (!formData.name.trim()) {
      error('Please enter the client name.');
      return;
    }

    const cleanMobile = formData.mobileNumber.replace(/\D/g, '');
    if (cleanMobile.length !== 10) {
      error('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    const amount = parseFloat(formData.amountTaken);
    if (isNaN(amount) || amount <= 0) {
      error('Please enter a valid loan amount greater than 0.');
      return;
    }

    const cleanAadhaar = formData.aadhaarNumber.replace(/\D/g, '');
    if (cleanAadhaar && cleanAadhaar.length !== 12) {
      error('Aadhaar number must be exactly 12 digits (or leave blank).');
      return;
    }

    setLoading(true);
    try {
      const res = await api.createClient({
        name: formData.name.trim(),
        mobileNumber: cleanMobile,
        aadhaarNumber: cleanAadhaar || null,
        amountTaken: amount,
        duration: formData.duration,
        startDate: formData.startDate,
        paymentMode: formData.paymentMode,
        address: formData.address.trim(),
        notes: formData.notes.trim()
      });

      success(`Client ${formData.name} added successfully! Total Payable: ${formatCurrency(res.totalPayable || totalPayable)} | Due: ${formatDate(res.dueDate)}`);
      triggerRefresh();
      if (onSuccess) onSuccess(res.clientId, formData.duration);
      onClose();
    } catch (err) {
      error(err.message || 'Failed to create client.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 dark:bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-xl bg-white dark:bg-surface-900 border border-slate-200 dark:border-surface-700/80 rounded-2xl shadow-2xl overflow-hidden z-10 animate-scale-up my-8 text-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-surface-800 bg-slate-50 dark:bg-surface-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-500/10 dark:bg-brand-600/20 border border-brand-500/30 text-brand-600 dark:text-brand-400 flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Add New Client</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Register client and issue initial loan with 10% interest</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-surface-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Client Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              1. Client Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Rahul Sharma"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm transition-all"
            />
          </div>

          {/* Mobile & Aadhaar in 2 Columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Mobile Number */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>2. Phone / WhatsApp <span className="text-rose-500">*</span></span>
                <span className="text-[10px] text-slate-400 font-normal">10 Digits</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-sm font-mono">+91</span>
                <input
                  type="tel"
                  required
                  maxLength="10"
                  placeholder="9876543210"
                  value={formData.mobileNumber}
                  onChange={(e) => handleChange('mobileNumber', e.target.value.replace(/\D/g, ''))}
                  className="w-full pl-12 pr-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm font-mono tracking-wide transition-all"
                />
              </div>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1 font-medium">
                <MessageSquare className="w-3 h-3" />
                <span>This phone number will also be used for WhatsApp loan reminders.</span>
              </p>
            </div>

            {/* Aadhaar Number */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>3. Aadhaar Number</span>
                <span className="text-[10px] text-brand-600 dark:text-brand-400 flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Masked in UI
                </span>
              </label>
              <input
                type="text"
                maxLength="12"
                placeholder="12 Digit Aadhaar (Optional)"
                value={formData.aadhaarNumber}
                onChange={(e) => handleChange('aadhaarNumber', e.target.value.replace(/\D/g, ''))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm font-mono tracking-wider transition-all"
              />
            </div>
          </div>

          {/* Amount Taken */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>4. Principal Loan Amount (₹) <span className="text-rose-500">*</span></span>
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
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-base font-semibold tracking-wide transition-all"
              />
            </div>
          </div>

          {/* Duration Selector (Weekly 7D, Fortnight 14D, Monthly 30D) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              5. Repayment Frequency <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { key: 'weekly', label: 'Weekly', days: '+7 Days', desc: 'Fast cycle' },
                { key: 'fortnight', label: 'Fortnightly', days: '+14 Days', desc: 'Mid cycle' },
                { key: 'monthly', label: 'Monthly', days: '+1 Month', desc: 'Full cycle' },
              ].map((opt) => {
                const isSelected = formData.duration === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => handleChange('duration', opt.key)}
                    className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center ${
                      isSelected
                        ? 'bg-brand-50 border-brand-500 text-brand-700 dark:bg-brand-600/25 dark:border-brand-500 dark:text-white shadow-md shadow-brand-500/10 dark:shadow-brand-500/20 ring-1 ring-brand-500'
                        : 'bg-slate-50 dark:bg-surface-950 border-slate-200 dark:border-surface-700/80 text-slate-600 dark:text-slate-300 hover:border-brand-300 dark:hover:border-surface-600 hover:bg-slate-100 dark:hover:bg-surface-800/60'
                    }`}
                  >
                    <span className="font-bold text-xs sm:text-sm">{opt.label}</span>
                    <span className={`text-[11px] font-semibold mt-0.5 ${isSelected ? 'text-brand-600 dark:text-brand-300' : 'text-slate-400'}`}>
                      {opt.days}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Instant 10% Interest & Payable Calculation Preview Card */}
          {formData.amountTaken > 0 && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-brand-50 via-indigo-50/50 to-purple-50 dark:from-surface-950 dark:via-surface-950 dark:to-surface-900 border border-brand-200 dark:border-brand-500/30 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-brand-700 dark:text-brand-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-brand-500" />
                  <span>10% Loan Interest Preview</span>
                </span>
                <span className="text-[10px] font-mono uppercase bg-brand-500/20 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded-full font-bold">
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
                <div className="bg-brand-500/10 dark:bg-brand-500/20 p-2 rounded-lg border border-brand-300 dark:border-brand-500/40">
                  <p className="text-[10px] text-brand-700 dark:text-brand-300 font-semibold">Total Payable</p>
                  <p className="font-extrabold text-brand-700 dark:text-brand-300 font-mono mt-0.5 text-sm">{formatCurrency(totalPayable)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Start Date & Auto Calculated Due Date Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                6. Loan Start Date
              </label>
              <input
                type="date"
                required
                value={formData.startDate}
                onChange={(e) => handleChange('startDate', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 text-sm transition-all"
              />
            </div>

            {/* Calculated Due Date Display */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                First Due Date
              </label>
              <div className="px-3.5 py-2.5 rounded-xl bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-500/30 flex items-center justify-between">
                <div className="flex items-center gap-2 text-brand-700 dark:text-brand-300 text-sm font-semibold">
                  <Clock className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                  <span>{formatDate(calculatedDueDate)}</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-brand-500/15 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded border border-brand-500/30 dark:border-brand-500/40">
                  {formData.duration === 'weekly' ? '+7 Days' : formData.duration === 'fortnight' ? '+14 Days' : '+1 Month'}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Mode & Address */}
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
                <option value="Cheque">Cheque</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Address / Location (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Sector 14, Main Market"
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500 text-sm"
              />
            </div>
          </div>

          {/* Optional Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Client Remarks / Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Reference: Shyam Lal, Shop #4"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500 text-sm"
            />
          </div>

          {/* Action Buttons */}
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
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-lg shadow-brand-600/30 active:scale-95 disabled:opacity-50 transition-all"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Saving Client...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Add Client</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
