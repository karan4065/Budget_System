import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useNotify } from '../context/NotificationContext';
import { useSync } from '../context/SyncContext';
import { 
  formatCurrency, 
  formatDate, 
  getDurationLabel, 
  getDueStatusInfo, 
  maskAadhaar 
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
            Lookup client records by mobile number or name.
          </p>
        </div>

        {/* Search Input Bar */}
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 pt-1">
          <div className="relative flex-1">
            <Phone className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              required
              autoFocus
              placeholder="Enter 10-digit mobile number or client name..."
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
            const activeLoan = client.records?.find(r => r.status === 'active' || r.status === 'overdue');
            const pastLoans = client.records?.filter(r => r.id !== activeLoan?.id) || [];

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
                          ID #{client.id}
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
                  <div className="p-4 rounded-xl bg-brand-50 dark:bg-brand-950/20 border border-brand-200 dark:border-brand-500/30 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-brand-700 dark:text-brand-300 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> Active Loan
                      </span>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-brand-500/15 text-brand-700 dark:text-brand-300">
                        {getDurationLabel(activeLoan.duration)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Loan Amount: </span>
                        <strong className="text-slate-900 dark:text-white font-mono">{formatCurrency(activeLoan.amount_taken)}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Due Date: </span>
                        <strong className="text-slate-800 dark:text-slate-200">{formatDate(activeLoan.due_date)}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Remaining: </span>
                        <strong className="text-rose-600 dark:text-rose-400 font-mono">{formatCurrency(activeLoan.remaining_amount)}</strong>
                      </div>

                      <button
                        onClick={() => onOpenPayment({
                          id: activeLoan.id,
                          amountTaken: activeLoan.amount_taken,
                          totalPaid: activeLoan.total_paid,
                          remainingAmount: activeLoan.remaining_amount,
                          dueDate: activeLoan.due_date
                        }, client)}
                        className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                      >
                        Record Payment
                      </button>
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

                    <div className="space-y-1.5">
                      {pastLoans.map((pLoan, i) => (
                        <div 
                          key={pLoan.id}
                          className="p-3 rounded-xl bg-slate-50 dark:bg-surface-950/70 border border-slate-200 dark:border-surface-800 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400 font-mono">#{pastLoans.length - i}</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">{formatCurrency(pLoan.amount_taken)}</span>
                            <span className="text-slate-500 dark:text-slate-400">• {getDurationLabel(pLoan.duration)}</span>
                            <span className="text-slate-400">({formatDate(pLoan.start_date)})</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                              {pLoan.status}
                            </span>
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
      ) : null}
    </div>
  );
}
