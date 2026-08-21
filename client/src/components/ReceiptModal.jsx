import React from 'react';
import { formatCurrency, formatDate } from '../utils/formatters';
import { X, Printer, CheckCircle2, ShieldCheck } from 'lucide-react';

export function ReceiptModal({ isOpen, onClose, data }) {
  if (!isOpen || !data) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div 
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md bg-surface-900 border border-surface-700/80 rounded-2xl shadow-2xl overflow-hidden z-10 animate-scale-up my-8">
        {/* Modal Controls (Hidden in Print) */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-800 bg-surface-950/60 print:hidden">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Payment Receipt</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow transition-all"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-surface-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Paper */}
        <div id="printable-receipt" className="p-6 bg-white text-slate-900 font-sans">
          {/* Header */}
          <div className="text-center pb-4 border-b border-slate-200">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 mb-2">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">BudgetFlow Management</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Official Payment Receipt & Acknowledgment</p>
            <p className="text-[11px] text-slate-400 font-mono mt-1">Receipt ID: #{data.transactionId || Date.now()}</p>
          </div>

          {/* Amount Paid Highlight */}
          <div className="my-5 p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Amount Received</p>
            <p className="text-3xl font-extrabold text-emerald-600 mt-1 font-mono">
              {formatCurrency(data.amount)}
            </p>
            <div className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
              {data.paymentMode || 'Cash'} • {data.transactionType === 'payment' ? 'Repayment' : 'Settlement'}
            </div>
          </div>

          {/* Details Table */}
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Client Name:</span>
              <span className="font-bold text-slate-900">{data.clientName}</span>
            </div>

            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Mobile Number:</span>
              <span className="font-mono font-semibold text-slate-800">+91 {data.mobileNumber}</span>
            </div>

            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Payment Date:</span>
              <span className="font-semibold text-slate-800">{formatDate(data.transactionDate)}</span>
            </div>

            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Total Loan Amount:</span>
              <span className="font-mono text-slate-800">{formatCurrency(data.loanAmount)}</span>
            </div>

            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Remaining Balance:</span>
              <span className="font-mono font-bold text-slate-900">
                {formatCurrency(data.remainingAfter)}
              </span>
            </div>

            {data.note && (
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Note:</span>
                <span className="italic text-slate-700">{data.note}</span>
              </div>
            )}
          </div>

          {/* Footer Note */}
          <div className="mt-6 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400">
            <p>Authorized Admin Signature / Computer Generated Receipt</p>
            <p className="mt-1">Thank you for timely repayment.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
