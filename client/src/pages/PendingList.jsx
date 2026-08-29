import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useNotify } from '../context/NotificationContext';
import { useSync } from '../context/SyncContext';
import { formatCurrency, formatDate, getDurationLabel } from '../utils/formatters';
import { 
  AlertCircle, 
  Search, 
  CreditCard, 
  CheckCircle2, 
  Clock, 
  Users, 
  ChevronRight, 
  ChevronDown, 
  X, 
  RefreshCw,
  Coins,
  History,
  ShieldCheck
} from 'lucide-react';

export function PendingList({ onOpenClientDetail, onOpenNewLoan }) {
  const { success, error } = useNotify();
  const { refreshSignal, triggerRefresh } = useSync();

  const [clients, setClients] = useState([]);
  const [totalPendingAmount, setTotalPendingAmount] = useState(0);
  const [totalPendingClients, setTotalPendingClients] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedClients, setExpandedClients] = useState(new Set());

  // Modal State for Paying Pending Amount
  const [payModalClient, setPayModalClient] = useState(null);
  const [payModalLoan, setPayModalLoan] = useState(null); // null = all loans
  const [payAmount, setPayAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [paymentNote, setPaymentNote] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const fetchPendingData = async () => {
    try {
      setLoading(true);
      const res = await api.getPendingClients(searchQuery);
      setClients(res.clients || []);
      setTotalPendingAmount(res.totalPendingAmount || 0);
      setTotalPendingClients(res.totalPendingClients || 0);
      
      // Auto-expand all clients initially for easy inspection
      const initialExpanded = new Set((res.clients || []).map(c => c.id));
      setExpandedClients(initialExpanded);
    } catch (err) {
      error(err.message || 'Failed to load pending dues list.');
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingData();
  }, [searchQuery, refreshSignal]);

  const toggleExpand = (clientId) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const handleOpenPayModal = (client, specificLoan = null) => {
    setPayModalClient(client);
    setPayModalLoan(specificLoan);
    const amountToPay = specificLoan ? specificLoan.pendingAmount : client.totalPendingAmount;
    setPayAmount(String(amountToPay || ''));
    setPaymentMode('Cash');
    setPaymentNote(specificLoan 
      ? `Cleared pending ₹${amountToPay} for Loan #${specificLoan.id.slice(-5)}` 
      : `Cleared pending dues of ₹${amountToPay}`);
  };

  const handleClosePayModal = () => {
    if (submittingPayment) return;
    setPayModalClient(null);
    setPayModalLoan(null);
    setPayAmount('');
    setPaymentNote('');
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    if (!payModalClient) return;

    const parsedAmount = parseFloat(payAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      error('Please enter a valid payment amount greater than 0.');
      return;
    }

    const maxAllowed = payModalLoan ? payModalLoan.pendingAmount : payModalClient.totalPendingAmount;
    if (parsedAmount > maxAllowed) {
      error(`Amount cannot exceed the total pending due of ₹${maxAllowed}.`);
      return;
    }

    try {
      setSubmittingPayment(true);
      const payload = {
        clientId: payModalClient.id,
        loanId: payModalLoan ? payModalLoan.id : undefined,
        amount: parsedAmount,
        paymentMode,
        note: paymentNote
      };

      const res = await api.clearPendingAmount(payload);
      success(res.message || `Successfully cleared ₹${parsedAmount} pending dues!`);
      handleClosePayModal();
      triggerRefresh();
      fetchPendingData();
    } catch (err) {
      error(err.message || 'Failed to clear pending amount.');
    } finally {
      setSubmittingPayment(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      {/* Header Banner */}
      <div className="glass-card rounded-2xl p-6 sm:p-7 border border-slate-200 dark:border-surface-700/60 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center justify-center shadow-md">
            <Coins className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Pending List
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">
                {totalPendingClients} Client{totalPendingClients !== 1 ? 's' : ''} Pending
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Active pending dues from settled or discounted loans awaiting final recovery and clearance.
            </p>
          </div>
        </div>

        {/* Global Summary Badge & Refresh */}
        <div className="flex items-center gap-3">
          <div className="px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/30 text-left">
            <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400 block tracking-wider">
              Total Pending Dues
            </span>
            <span className="text-lg sm:text-xl font-extrabold text-rose-700 dark:text-rose-300 font-mono">
              {formatCurrency(totalPendingAmount)}
            </span>
          </div>

          <button
            onClick={fetchPendingData}
            title="Refresh Pending List"
            className="p-3 rounded-xl bg-slate-100 dark:bg-surface-800 hover:bg-slate-200 dark:hover:bg-surface-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-surface-700 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Quick Search Bar */}
      <div className="relative">
        <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Filter pending list by Client ID, Name, or Mobile Number..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 rounded-xl bg-white dark:bg-surface-900 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-sm font-medium shadow-sm transition-all"
        />
      </div>

      {/* Pending Clients Content */}
      {loading ? (
        <div className="p-16 text-center">
          <div className="w-8 h-8 border-3 border-rose-500/20 border-t-rose-500 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-500 dark:text-slate-400">Loading pending dues list...</p>
        </div>
      ) : clients.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border border-slate-200 dark:border-surface-700/60 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">All Clear! No Pending Dues</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {searchQuery 
              ? `No pending dues found matching "${searchQuery}".` 
              : 'There are currently no clients with outstanding pending balances from settled loans.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            <span>Showing {clients.length} Client{clients.length > 1 ? 's' : ''} with Pending Balance</span>
            <span>Sorted by Highest Pending</span>
          </div>

          {clients.map(client => {
            const isExpanded = expandedClients.has(client.id);

            return (
              <div
                key={client.id}
                className="glass-card rounded-2xl border border-slate-200 dark:border-surface-700/60 shadow-lg overflow-hidden transition-all"
              >
                {/* Client Main Row */}
                <div className="p-5 sm:p-6 bg-white dark:bg-surface-900/90 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left: Avatar, Name & TOTAL PENDING IN FRONT OF NAME */}
                  <div className="flex items-center gap-3.5 flex-wrap">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white font-bold text-lg flex items-center justify-center shadow-md flex-shrink-0">
                      {client.name.charAt(0)}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        {/* 1. Client Name */}
                        <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                          {client.name}
                        </h2>

                        {/* 2. TOTAL PENDING PROMINENTLY IN FRONT OF NAME */}
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 text-white font-black text-sm sm:text-base shadow-md shadow-rose-600/25 animate-pulse">
                          <Coins className="w-4 h-4 text-white" />
                          <span>Total Pending: {formatCurrency(client.totalPendingAmount)}</span>
                        </div>

                        {/* Client ID Badge */}
                        <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-surface-800 px-2 py-0.5 rounded-md border border-slate-200 dark:border-surface-700">
                          ID #{client.clientNo || client.id}
                        </span>
                      </div>

                      {/* Contact Info & Meta */}
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2.5 flex-wrap">
                        <span className="text-brand-600 dark:text-brand-400 font-semibold font-mono">
                          +91 {client.mobileNumber}
                        </span>
                        {client.maskedAadhaar && (
                          <>
                            <span>•</span>
                            <span>Aadhaar: {client.maskedAadhaar}</span>
                          </>
                        )}
                        <span>•</span>
                        <span className="text-slate-600 dark:text-slate-300 font-medium">
                          {client.pendingLoansCount} pending loan{client.pendingLoansCount > 1 ? 's' : ''}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Right Actions: Pay Button & View Details */}
                  <div className="flex items-center gap-2.5 flex-wrap self-end lg:self-center">
                    {/* Primary Pay Pending Amount Button */}
                    <button
                      onClick={() => handleOpenPayModal(client)}
                      className="px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-md shadow-emerald-600/30 active:scale-95 transition-all flex items-center gap-2"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Pay Pending ({formatCurrency(client.totalPendingAmount)})</span>
                    </button>

                    {/* View Profile */}
                    <button
                      onClick={() => onOpenClientDetail(client.id)}
                      className="px-3.5 py-2.5 rounded-xl font-bold text-xs text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-surface-800 hover:bg-slate-200 dark:hover:bg-surface-700 border border-slate-200 dark:border-surface-700 transition-colors flex items-center gap-1.5"
                    >
                      <span>Profile</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>

                    {/* Expand/Collapse Toggle */}
                    <button
                      onClick={() => toggleExpand(client.id)}
                      className="p-2.5 rounded-xl bg-slate-100 dark:bg-surface-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white border border-slate-200 dark:border-surface-700 transition-colors"
                      title={isExpanded ? 'Collapse Loans' : 'Expand Loans'}
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Loans Breakdown */}
                {isExpanded && (
                  <div className="p-4 sm:p-5 bg-slate-50/70 dark:bg-surface-950/60 border-t border-slate-200 dark:border-surface-800 space-y-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-rose-500" />
                      <span>Loan Breakdown Carrying Pending Balances ({client.loans.length})</span>
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {client.loans.map((loan, idx) => (
                        <div
                          key={loan.id}
                          className="p-3.5 rounded-xl bg-white dark:bg-surface-900 border border-slate-200 dark:border-surface-800 shadow-sm space-y-2.5 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 font-mono font-bold flex items-center justify-center text-[11px] border border-rose-200 dark:border-rose-500/30">
                                #{idx + 1}
                              </span>
                              <span className="font-bold text-slate-800 dark:text-slate-200">
                                {getDurationLabel(loan.duration)}
                              </span>
                            </div>

                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">
                              Pending: {formatCurrency(loan.pendingAmount)}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-1 bg-slate-50 dark:bg-surface-950 p-2 rounded-lg text-[10px] font-mono">
                            <div>
                              <span className="text-slate-400 block font-sans">Principal</span>
                              <strong className="text-slate-800 dark:text-slate-200">{formatCurrency(loan.amountTaken)}</strong>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-sans">Total Paid</span>
                              <strong className="text-emerald-600 dark:text-emerald-400">{formatCurrency(loan.totalPaid)}</strong>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-sans">Pending</span>
                              <strong className="text-rose-600 dark:text-rose-400">{formatCurrency(loan.pendingAmount)}</strong>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                            <span>Cycle: {formatDate(loan.startDate)} to {formatDate(loan.dueDate)}</span>
                            <button
                              onClick={() => handleOpenPayModal(client, loan)}
                              className="text-emerald-600 dark:text-emerald-400 hover:underline font-bold"
                            >
                              Clear This Loan →
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pay Pending Modal */}
      {payModalClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="glass-card w-full max-w-lg rounded-2xl p-6 sm:p-7 border border-slate-200 dark:border-surface-700 shadow-2xl space-y-5 bg-white dark:bg-surface-900">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-surface-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Record Pending Payment
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Clear pending money for <strong className="text-slate-800 dark:text-slate-200">{payModalClient.name}</strong>
                  </p>
                </div>
              </div>

              <button
                onClick={handleClosePayModal}
                disabled={submittingPayment}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-surface-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitPayment} className="space-y-4">
              {/* Context Summary Banner */}
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 flex items-center justify-between text-xs">
                <div>
                  <span className="text-rose-700 dark:text-rose-300 font-semibold block">
                    {payModalLoan ? 'Selected Loan Pending' : 'Total Pending (All Loans)'}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                    Client ID #{payModalClient.clientNo || payModalClient.id} • {payModalClient.mobileNumber}
                  </span>
                </div>
                <span className="text-lg font-black text-rose-600 dark:text-rose-400 font-mono">
                  {formatCurrency(payModalLoan ? payModalLoan.pendingAmount : payModalClient.totalPendingAmount)}
                </span>
              </div>

              {/* Amount to Pay */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                  Amount Received (₹) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  autoFocus
                  min="1"
                  max={payModalLoan ? payModalLoan.pendingAmount : payModalClient.totalPendingAmount}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="Enter amount given by client..."
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-base font-mono font-bold shadow-inner"
                />
              </div>

              {/* Payment Mode */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                  Payment Mode
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['Cash', 'UPI', 'Bank Transfer'].map(mode => (
                    <button
                      type="button"
                      key={mode}
                      onClick={() => setPaymentMode(mode)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                        paymentMode === mode
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-300 border-brand-500 shadow-sm'
                          : 'bg-slate-50 dark:bg-surface-950 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-surface-700 hover:bg-slate-100 dark:hover:bg-surface-800'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Note */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                  Note / Reference (Optional)
                </label>
                <input
                  type="text"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder="e.g. Received pending cash from Karan"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 text-xs"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={submittingPayment}
                  onClick={handleClosePayModal}
                  className="flex-1 py-3 rounded-xl font-bold text-sm text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-surface-800 hover:bg-slate-200 dark:hover:bg-surface-700 transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submittingPayment}
                  className="flex-1 py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-600/30 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {submittingPayment ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Clearing...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm & Clear Dues</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
