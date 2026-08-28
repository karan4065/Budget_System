import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useNotify } from '../context/NotificationContext';
import { useSync } from '../context/SyncContext';
import { 
  formatCurrency, 
  formatDate, 
  getDurationLabel, 
  getDueStatusInfo, 
  maskAadhaar,
  getOrdinal,
  getLoanOrdinalLabel
} from '../utils/formatters';
import { 
  Search, 
  Phone, 
  User, 
  History, 
  CreditCard, 
  Clock, 
  AlertCircle, 
  PlusCircle, 
  ChevronRight 
} from 'lucide-react';

export function SearchClient({ onOpenClientDetail, onOpenAddClient, onOpenPayment, onOpenNewLoan }) {
  const { error } = useNotify();
  const { refreshSignal } = useSync();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();

    if (!query.trim()) {
      return;
    }

    setLoading(true);
    setHasSearched(true);
    try {
      const res = await api.searchClients(query.trim());
      setResults(res.results || []);
    } catch (err) {
      error(err.message || 'Search failed.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasSearched && query.trim()) {
      handleSearch();
    }
  }, [refreshSignal]);

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      {/* Header & Search Box */}
      <div className="glass-card rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-surface-700/60 shadow-xl space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Search Client
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Lookup client records by Client ID, mobile number, name, or Aadhaar.
          </p>
        </div>

        {/* Search Input Bar */}
        <form onSubmit={handleSearch} className="space-y-3 pt-1">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                required
                autoFocus
                placeholder="Enter Client ID (e.g. 1), Name, Mobile, or Aadhaar..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-base font-medium shadow-inner transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-lg shadow-brand-600/30 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Search</span>
                </>
              )}
            </button>
          </div>

          {/* Quick Search Badges / Hints */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-600 dark:text-slate-300">Quick Search:</span>
            <span className="px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300 border border-brand-200 dark:border-brand-500/20 font-medium">
              Client ID (e.g. 1, 2)
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-surface-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-surface-700">
              Mobile Number
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-surface-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-surface-700">
              Client Name
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-surface-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-surface-700">
              Aadhaar Number
            </span>
          </div>
        </form>
      </div>

      {/* Search Results Display */}
      {loading ? (
        <div className="p-12 text-center">
          <div className="w-8 h-8 border-3 border-brand-500/20 border-t-brand-500 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-500 dark:text-slate-400">Searching...</p>
        </div>
      ) : hasSearched && results && results.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center border border-slate-200 dark:border-surface-700/60 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">No client found with this query.</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              No records found for "{query}". You can add this client now.
            </p>
          </div>
          <button
            onClick={onOpenAddClient}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-brand-600 hover:bg-brand-500 shadow transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ Add Client</span>
          </button>
        </div>
      ) : results && results.length > 0 ? (
        <div className="space-y-6">
          <h2 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
            Found {results.length} Client{results.length > 1 ? 's' : ''}
          </h2>

          {results.map(client => {
            const activeLoans = (client.records || []).filter(r => 
              (r.status === 'active' || r.status === 'overdue') && 
              !r.isSettledPending && 
              (Number(r.pendingAmount || r.pending_amount || 0) <= 0) && 
              Number(r.remainingAmount || r.remaining_amount || 0) > 0
            );
            const activeLoan = activeLoans[0] || null;
            const pastLoans = (client.records || []).filter(r => r.id !== activeLoan?.id);

            return (
              <div 
                key={client.id}
                className="glass-card rounded-2xl p-6 border border-slate-200 dark:border-surface-700/60 shadow-xl space-y-5"
              >
                {/* Client Profile Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-surface-800">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white font-bold text-xl flex items-center justify-center shadow-md">
                      {client.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white">{client.name}</h3>
                        <span className="text-xs font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-surface-800 px-2 py-0.5 rounded border border-slate-200 dark:border-surface-700">
                          ID #{client.displayId || client.clientNo || client.id}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5 flex items-center gap-3">
                        <span className="text-brand-600 dark:text-brand-400 font-semibold">+91 {client.mobileNumber}</span>
                        {client.maskedAadhaar && (
                          <>
                            <span>•</span>
                            <span>Aadhaar: {client.maskedAadhaar}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => onOpenNewLoan(client)}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 transition-all flex items-center gap-1.5 shadow"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>+ New Loan</span>
                    </button>

                    <button
                      onClick={() => onOpenClientDetail(client.id)}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-surface-800 hover:bg-brand-600 hover:text-white border border-slate-200 dark:border-surface-700 transition-all flex items-center gap-1.5"
                    >
                      <span>View Profile</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Lifetime Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-surface-950/60 p-4 rounded-xl border border-slate-200 dark:border-surface-800 text-xs">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Total Loans</span>
                    <strong className="text-sm text-slate-900 dark:text-white font-mono">{client.totalLoansCount || 0}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Total Borrowed</span>
                    <strong className="text-sm text-slate-800 dark:text-slate-200 font-mono">{formatCurrency(client.totalAmountTaken)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Total Repaid</span>
                    <strong className="text-sm text-emerald-600 dark:text-emerald-400 font-mono">{formatCurrency(client.totalPaid)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Current Outstanding</span>
                    <strong className={`text-sm font-mono ${client.totalOutstanding > 0 ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
                      {formatCurrency(client.totalOutstanding)}
                    </strong>
                  </div>
                </div>

                {/* Active Loan Snapshot */}
                {activeLoan && (
                  <div className="p-4 rounded-xl bg-brand-50/50 dark:bg-surface-950/70 border border-brand-200 dark:border-brand-500/30 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-brand-700 dark:text-brand-300 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{formatDate(activeLoan.start_date || activeLoan.startDate)} to {formatDate(activeLoan.due_date || activeLoan.dueDate)}</span>
                        </span>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30">
                          {client.records?.length ? getLoanOrdinalLabel(client.records.length - client.records.findIndex(r => r.id === activeLoan.id)) : 'Active Loan'}
                        </span>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-brand-500/15 text-brand-700 dark:text-brand-300">
                          {getDurationLabel(activeLoan.duration)}
                        </span>
                      </div>

                      <button
                        onClick={() => onOpenPayment({
                          id: activeLoan.id,
                          amountTaken: activeLoan.amountTaken ?? activeLoan.amount_taken,
                          totalPaid: activeLoan.totalPaid ?? activeLoan.total_paid,
                          remainingAmount: activeLoan.remainingAmount ?? activeLoan.remaining_amount,
                          dueDate: activeLoan.dueDate ?? activeLoan.due_date
                        }, client)}
                        className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm"
                      >
                        + Record Payment
                      </button>
                    </div>

                    {/* 5 Financial Stat Boxes */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                      <div className="bg-white dark:bg-surface-900 p-2.5 rounded-lg border border-slate-200 dark:border-surface-800">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold block">Principal</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                          {formatCurrency(activeLoan.amountTaken ?? activeLoan.amount_taken ?? 0)}
                        </span>
                      </div>
                      <div className="bg-white dark:bg-surface-900 p-2.5 rounded-lg border border-slate-200 dark:border-surface-800">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold block">Interest (10%)</span>
                        <span className="text-sm font-bold text-amber-600 dark:text-amber-400 font-mono">
                          +{formatCurrency(activeLoan.interestAmount ?? activeLoan.interest_amount ?? (Number(activeLoan.amountTaken ?? activeLoan.amount_taken ?? 0) * 0.10))}
                        </span>
                      </div>
                      <div className="bg-purple-50/60 dark:bg-purple-950/30 p-2.5 rounded-lg border border-purple-200 dark:border-purple-500/30">
                        <span className="text-[10px] text-purple-700 dark:text-purple-300 uppercase font-semibold block">Total Payable</span>
                        <span className="text-sm font-bold text-purple-700 dark:text-purple-300 font-mono">
                          {formatCurrency(activeLoan.totalPayable ?? activeLoan.total_payable ?? (Number(activeLoan.amountTaken ?? activeLoan.amount_taken ?? 0) * 1.10))}
                        </span>
                      </div>
                      <div className="bg-white dark:bg-surface-900 p-2.5 rounded-lg border border-slate-200 dark:border-surface-800">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold block">Total Repaid</span>
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                          {formatCurrency(activeLoan.totalPaid ?? activeLoan.total_paid ?? 0)}
                        </span>
                      </div>
                      <div className="bg-rose-50/60 dark:bg-rose-950/30 p-2.5 rounded-lg border border-rose-200 dark:border-rose-500/30">
                        <span className="text-[10px] text-rose-700 dark:text-rose-300 uppercase font-semibold block">Pending Amount</span>
                        <span className="text-sm font-bold text-rose-600 dark:text-rose-400 font-mono">
                          {formatCurrency(activeLoan.pendingAmount ?? activeLoan.pending_amount ?? 0)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                      <span>Due: <strong className="text-slate-800 dark:text-slate-200">{formatDate(activeLoan.dueDate ?? activeLoan.due_date)}</strong></span>
                      <span>Remaining: <strong className="text-rose-600 dark:text-rose-400 font-mono">{formatCurrency(activeLoan.remainingAmount ?? activeLoan.remaining_amount ?? 0)}</strong></span>
                    </div>
                  </div>
                )}

                {/* Previous Records List (Preserved History) */}
                {pastLoans.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                      <span>Previous Loans ({pastLoans.length})</span>
                    </p>

                    <div className="space-y-2">
                      {pastLoans.map((pLoan, i) => {
                        const loanSeq = client.records?.length ? (client.records.length - client.records.findIndex(r => r.id === pLoan.id)) : (pastLoans.length - i);
                        const pPrincipal = Number(pLoan.amountTaken ?? pLoan.amount_taken ?? 0);
                        const pInterest = Number(pLoan.interestAmount ?? pLoan.interest_amount ?? (pPrincipal * 0.10));
                        const pPayable = Number(pLoan.totalPayable ?? pLoan.total_payable ?? (pPrincipal + pInterest));
                        const pPaid = Number(pLoan.totalPaid ?? pLoan.total_paid ?? 0);
                        let pPending = Number(pLoan.pendingAmount ?? pLoan.pending_amount ?? 0);
                        if (pPending <= 0 && (pLoan.status === 'completed' || Boolean(pLoan.isSettledPending)) && pPayable > pPaid) {
                          pPending = Math.max(0, pPayable - pPaid);
                        }
                        const isCompleted = pLoan.status === 'completed' || Boolean(pLoan.isSettledPending) || pPending > 0;

                        return (
                          <div 
                            key={pLoan.id}
                            className="p-3 rounded-xl bg-slate-50 dark:bg-surface-950/70 border border-slate-200 dark:border-surface-800 space-y-2 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="w-6 h-6 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-mono font-bold flex items-center justify-center text-[11px] border border-purple-200 dark:border-purple-500/30">
                                  #{loanSeq}
                                </span>
                                <span className="font-bold text-slate-900 dark:text-white">
                                  {formatDate(pLoan.startDate ?? pLoan.start_date)} to {formatDate(pLoan.dueDate ?? pLoan.due_date)}
                                </span>
                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">
                                  {getLoanOrdinalLabel(loanSeq)}
                                </span>
                                <span className="text-slate-500">• {getDurationLabel(pLoan.duration)}</span>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                isCompleted 
                                  ? (pPending > 0
                                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 font-semibold'
                                      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30')
                                  : (pLoan.status === 'overdue'
                                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40'
                                      : 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30')
                              }`}>
                                {isCompleted && pPending > 0 ? `Completed (${formatCurrency(pPending)} Pending)` : pLoan.status}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
                              <div className="bg-white dark:bg-surface-900 p-2 rounded border border-slate-200 dark:border-surface-800">
                                <span className="text-[9px] text-slate-400 uppercase block font-medium">Principal</span>
                                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{formatCurrency(pPrincipal)}</span>
                              </div>
                              <div className="bg-white dark:bg-surface-900 p-2 rounded border border-slate-200 dark:border-surface-800">
                                <span className="text-[9px] text-slate-400 uppercase block font-medium">Interest (10%)</span>
                                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">+{formatCurrency(pInterest)}</span>
                              </div>
                              <div className="bg-purple-50/50 dark:bg-purple-950/20 p-2 rounded border border-purple-200 dark:border-purple-500/20">
                                <span className="text-[9px] text-purple-700 dark:text-purple-300 uppercase block font-medium">Total Payable</span>
                                <span className="font-mono font-bold text-purple-700 dark:text-purple-300">{formatCurrency(pPayable)}</span>
                              </div>
                              <div className="bg-white dark:bg-surface-900 p-2 rounded border border-slate-200 dark:border-surface-800">
                                <span className="text-[9px] text-slate-400 uppercase block font-medium">Total Repaid</span>
                                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(pPaid)}</span>
                              </div>
                              <div className="bg-rose-50/50 dark:bg-rose-950/20 p-2 rounded border border-rose-200 dark:border-rose-500/20">
                                <span className="text-[9px] text-rose-700 dark:text-rose-300 uppercase block font-medium">Pending Amount</span>
                                <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                                  {formatCurrency(pPending)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
