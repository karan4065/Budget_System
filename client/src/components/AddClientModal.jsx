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

      success(`Client ${formData.name} (Client ID: #${res.clientId}) created successfully! Total Payable: ${formatCurrency(res.totalPayable || totalPayable)} | Due: ${formatDate(res.dueDate)}`);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 dark:bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-xl bg-white dark:bg-surface-900 border border-slate-200 dark:border-surface-700/80 rounded-2xl shadow-2xl overflow-hidden z-10 animate-scale-up text-slate-900 dark:text-slate-100 flex flex-col max-h-[94vh] sm:max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 dark:border-surface-800 bg-slate-50 dark:bg-surface-950/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-500/10 dark:bg-brand-600/20 border border-brand-500/30 text-brand-600 dark:text-brand-400 flex items-center justify-center flex-shrink-0">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">Add New Client</h3>
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

        {/* Form Body - Scrollable Container */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
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
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500 text-sm font-semibold transition-all"
              />
            </div>

            {/* Mobile & Aadhaar in 2 cols */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  2. Mobile Number (10 Digits) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-xs font-mono text-slate-400 font-bold">+91</span>
                  <input
                    type="tel"
                    maxLength={10}
                    required
                    placeholder="9876543210"
                    value={formData.mobileNumber}
                    onChange={(e) => handleChange('mobileNumber', e.target.value.replace(/\D/g, ''))}
                    className="w-full pl-12 pr-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500 text-sm font-mono transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  3. Aadhaar Number (Optional)
                </label>
                <input
                  type="text"
                  maxLength={12}
                  placeholder="12-digit UIDAI number"
                  value={formData.aadhaarNumber}
                  onChange={(e) => handleChange('aadhaarNumber', e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500 text-sm font-mono transition-all"
                />
              </div>
            </div>

            {/* Initial Loan Amount */}
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
                  placeholder="Enter initial loan amount (e.g. 5000, 1000)"
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
                5. Repayment Schedule <span className="text-rose-500">*</span>
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
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 font-bold shadow-sm'
                        : 'border-slate-200 dark:border-surface-700 bg-slate-50 dark:bg-surface-950 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-xs font-bold">{item.label}</div>
                    <div className="text-[10px] opacity-75">{item.days}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Start Date & Calculated Due Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  6. Start / Issue Date <span className="text-rose-500">*</span>
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
                  First Due Date (Calculated)
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

            {/* Payment Mode & Address in 2 cols */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  7. Disbursement Payment Mode
                </label>
                <select
                  value={formData.paymentMode}
                  onChange={(e) => handleChange('paymentMode', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 text-xs sm:text-sm"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI / GPay / PhonePe</option>
                  <option value="Bank Transfer">Bank Transfer (IMPS/NEFT)</option>
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
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500 text-xs sm:text-sm"
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
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500 text-xs sm:text-sm"
              />
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
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-lg shadow-brand-600/30 active:scale-95 disabled:opacity-50 transition-all"
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
