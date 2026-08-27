import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useNotify } from '../context/NotificationContext';
import { useSync } from '../context/SyncContext';
import { 
  formatCurrency, 
  formatDate, 
  maskAadhaar 
} from '../utils/formatters';
import { 
  Users, 
  Search, 
  Calendar, 
  Phone, 
  Eye, 
  PlusCircle, 
  Filter, 
  RefreshCw, 
  CreditCard, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  ArrowUpDown,
  X
} from 'lucide-react';

export function AllClients({ onOpenClientDetail, onOpenAddClient, onOpenNewLoan }) {
  const { error } = useNotify();
  const { refreshSignal, triggerRefresh } = useSync();

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'completed'

  const fetchClients = async () => {
    try {
      setLoading(true);
      const params = {
        duration: 'directory'
      };
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }
      if (startDate) {
        params.startDate = startDate;
      }
      if (endDate) {
        params.endDate = endDate;
      }
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }

      const res = await api.getClients(params);
      setClients(res.clients || []);
    } catch (err) {
      error(err.message || 'Failed to fetch client directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [searchQuery, startDate, endDate, statusFilter, refreshSignal]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setStatusFilter('all');
  };

  const hasActiveFilters = searchQuery || startDate || endDate || statusFilter !== 'all';

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      {/* Page Header */}
      <div className="glass-card rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-surface-700/60 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-brand-600/30">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                All Clients Directory
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300 border border-brand-200 dark:border-brand-500/30">
                {clients.length} {clients.length === 1 ? 'Client' : 'Clients'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Complete client profiles. Click any client to view their loan history and transaction ledger.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={fetchClients}
            title="Refresh Client List"
            className="p-2.5 rounded-xl border border-slate-200 dark:border-surface-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-surface-800 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={onOpenAddClient}
            className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-lg shadow-brand-600/30 active:scale-95 transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add Client</span>
          </button>
        </div>
      </div>

      {/* Advanced Filter Bar (Search by ID, Name, Number, Aadhaar + Date Filters) */}
      <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-surface-700/60 shadow-lg space-y-3.5">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Keyword Search */}
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Client ID (e.g. 1), name, mobile, or Aadhaar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Start Date */}
          <div className="md:col-span-3 relative">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900">
              <span className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-transparent text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none"
              />
            </div>
          </div>

          {/* End Date */}
          <div className="md:col-span-3 relative">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900">
              <span className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-transparent text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none"
              />
            </div>
          </div>

          {/* Clear Filter Button */}
          <div className="md:col-span-1 flex justify-end">
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                title="Clear all filters"
                className="px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors whitespace-nowrap"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Status Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pt-1">
          {[
            { id: 'all', label: 'All Clients' },
            { id: 'active', label: 'Active Borrowers' },
            { id: 'completed', label: 'Fully Settled' }
          ].map((chip) => (
            <button
              key={chip.id}
              onClick={() => setStatusFilter(chip.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                statusFilter === chip.id
                  ? 'bg-brand-600 text-white shadow-md'
                  : 'bg-slate-100 dark:bg-surface-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Clients Table / Cards View */}
      {loading ? (
        <div className="py-16 text-center space-y-3">
          <div className="w-8 h-8 border-4 border-brand-500/20 border-t-brand-500 rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400 font-medium">Loading client directory...</p>
        </div>
      ) : clients.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border border-slate-200 dark:border-surface-700/60 shadow-lg space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-surface-800 text-slate-400 flex items-center justify-center mx-auto">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">No Clients Found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              {hasActiveFilters ? 'No clients match your filter criteria. Try clearing search filters.' : 'No clients registered in the system yet.'}
            </p>
          </div>
          {hasActiveFilters ? (
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-surface-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200"
            >
              Clear Filters
            </button>
          ) : (
            <button
              onClick={onOpenAddClient}
              className="px-4 py-2 rounded-xl bg-brand-600 text-white text-xs font-bold hover:bg-brand-500 shadow"
            >
              + Register First Client
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block glass-card rounded-2xl border border-slate-200 dark:border-surface-700/60 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-surface-950/80 border-b border-slate-200 dark:border-surface-800 text-slate-500 dark:text-slate-400 uppercase font-semibold tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5 whitespace-nowrap">Client Profile</th>
                    <th className="px-5 py-3.5 whitespace-nowrap">Contact & Aadhaar</th>
                    <th className="px-5 py-3.5 whitespace-nowrap">Total Loans</th>
                    <th className="px-5 py-3.5 whitespace-nowrap">Total Borrowed</th>
                    <th className="px-5 py-3.5 whitespace-nowrap">Total Repaid</th>
                    <th className="px-5 py-3.5 whitespace-nowrap">Outstanding</th>
                    <th className="px-5 py-3.5 whitespace-nowrap">Date Joined</th>
                    <th className="px-5 py-3.5 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-surface-800/80">
                  {clients.map((client) => {
                    const hasActiveLoan = Number(client.totalOutstandingAmount) > 0;

                    return (
                      <tr
                        key={client.id}
                        onClick={() => onOpenClientDetail(client.id)}
                        className="hover:bg-slate-50 dark:hover:bg-surface-800/40 transition-colors cursor-pointer group"
                      >
                        {/* Client Profile */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-brand-600/20 to-indigo-600/20 dark:from-brand-600/30 dark:to-indigo-600/30 border border-brand-500/30 text-brand-600 dark:text-brand-300 font-bold flex items-center justify-center text-sm shadow-inner flex-shrink-0">
                              {client.name.charAt(0)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-300 transition-colors">
                                  {client.name}
                                </p>
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-surface-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-surface-700">
                                  ID #{client.displayId || client.clientNo || client.id}
                                </span>
                              </div>
                              {client.address && (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[150px]">
                                  {client.address}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Contact & Aadhaar */}
                        <td className="px-5 py-4 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          <p className="font-semibold text-xs flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>+91 {client.mobileNumber}</span>
                          </p>
                          {client.maskedAadhaar && (
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                              Aadhaar: {client.maskedAadhaar}
                            </p>
                          )}
                        </td>

                        {/* Total Loans Count */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 dark:bg-surface-800 dark:text-slate-300 border border-slate-200 dark:border-surface-700 whitespace-nowrap">
                            {client.totalLoansCount || 0} {client.totalLoansCount === 1 ? 'Loan' : 'Loans'}
                          </span>
                        </td>

                        {/* Total Borrowed */}
                        <td className="px-5 py-4 font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {formatCurrency(client.totalAmountTaken || client.amountTaken || 0)}
                        </td>

                        {/* Total Repaid */}
                        <td className="px-5 py-4 font-mono font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          {formatCurrency(client.totalAmountPaid || client.totalPaid || 0)}
                        </td>

                        {/* Outstanding */}
                        <td className="px-5 py-4 font-mono whitespace-nowrap">
                          {hasActiveLoan ? (
                            <span className="font-bold text-amber-600 dark:text-amber-400">
                              {formatCurrency(client.totalOutstandingAmount)}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                              Cleared
                            </span>
                          )}
                        </td>

                        {/* Date Joined */}
                        <td className="px-5 py-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {formatDate(client.createdAt)}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4 text-right space-x-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => onOpenClientDetail(client.id)}
                            className="px-3 py-1.5 rounded-lg bg-brand-50 hover:bg-brand-600 hover:text-white text-brand-700 dark:bg-brand-500/10 dark:hover:bg-brand-600 dark:hover:text-white dark:text-brand-300 border border-brand-200 dark:border-brand-500/30 transition-all inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View Profile</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards View */}
          <div className="md:hidden space-y-3">
            {clients.map((client) => {
              const hasActiveLoan = Number(client.totalOutstandingAmount) > 0;

              return (
                <div
                  key={client.id}
                  onClick={() => onOpenClientDetail(client.id)}
                  className="glass-card rounded-2xl p-4 border border-slate-200 dark:border-surface-700/60 shadow-lg space-y-3 active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-brand-500/20 text-brand-600 dark:text-brand-300 font-bold flex items-center justify-center text-sm">
                        {client.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white">{client.name}</h3>
                          <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-100 dark:bg-surface-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-surface-700">
                            #{client.displayId || client.clientNo || client.id}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">+91 {client.mobileNumber}</p>
                      </div>
                    </div>

                    {hasActiveLoan ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-200">
                        Active Loan
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-200">
                        Cleared
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-surface-950/60 p-2.5 rounded-xl border border-slate-200 dark:border-surface-800 text-xs font-mono">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-sans">Money Taken</p>
                      <p className="font-bold text-slate-800 dark:text-slate-200">{formatCurrency(client.totalAmountTaken || client.amountTaken || 0)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 uppercase font-sans">Outstanding</p>
                      <p className={`font-bold ${hasActiveLoan ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {formatCurrency(client.totalOutstandingAmount || 0)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-xs">
                    <span className="text-[11px] text-slate-400">
                      Joined: {formatDate(client.createdAt)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenClientDetail(client.id);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-brand-600 text-white font-bold text-xs"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
