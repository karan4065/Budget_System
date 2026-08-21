import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useNotify } from '../context/NotificationContext';
import { useSync } from '../context/SyncContext';
import { 
  formatCurrency, 
  formatDate, 
  getDurationLabel 
} from '../utils/formatters';
import { 
  History, 
  Search, 
  Filter, 
  Download, 
  Printer, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Calendar, 
  CreditCard, 
  RefreshCw,
  FileSpreadsheet
} from 'lucide-react';

export function TransactionsPage({ onOpenReceipt, onOpenClientDetail }) {
  const { error } = useNotify();
  const { refreshSignal } = useSync();

  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({ totalCount: 0, totalCollected: 0, totalDisbursed: 0 });
  const [loading, setLoading] = useState(true);

  const [typeFilter, setTypeFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const params = {};
      if (typeFilter) params.type = typeFilter;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await api.getTransactions(params);
      setTransactions(res.transactions || []);
      if (res.summary) setSummary(res.summary);
    } catch (err) {
      error(err.message || 'Failed to fetch transactions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [typeFilter, startDate, endDate, searchQuery, refreshSignal]);

  const exportCSV = () => {
    if (!transactions.length) return;

    const headers = ['Transaction ID', 'Date', 'Client Name', 'Mobile', 'Type', 'Amount (INR)', 'Payment Mode', 'Remaining After', 'Note'];
    const rows = transactions.map(t => [
      t.id,
      t.transactionDate,
      `"${t.clientName.replace(/"/g, '""')}"`,
      t.mobileNumber,
      t.transactionType,
      t.amount,
      t.paymentMode || 'Cash',
      t.remainingAfter,
      `"${(t.note || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BudgetFlow_Transactions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      {/* Header Banner */}
      <div className="glass-card rounded-2xl p-6 border border-slate-200 dark:border-surface-700/60 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Transactions Ledger
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            History of all disbursements and repayments.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchTransactions}
            title="Refresh"
            className="p-2.5 rounded-xl bg-slate-100 dark:bg-surface-900 border border-slate-200 dark:border-surface-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={exportCSV}
            disabled={!transactions.length}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-surface-900 hover:bg-slate-200 dark:hover:bg-surface-800 border border-slate-300 dark:border-surface-700 active:scale-95 disabled:opacity-50 transition-all"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Summary Stat Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card rounded-xl p-4 border border-slate-200 dark:border-surface-800">
          <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Total Filtered Entries</span>
          <p className="text-xl font-extrabold text-slate-900 dark:text-white font-mono mt-1">{summary.totalCount || 0}</p>
        </div>

        <div className="glass-card rounded-xl p-4 border border-slate-200 dark:border-surface-800">
          <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Total Collections (Repayments)</span>
          <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono mt-1">{formatCurrency(summary.totalCollected)}</p>
        </div>

        <div className="glass-card rounded-xl p-4 border border-slate-200 dark:border-surface-800">
          <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Total Disbursements</span>
          <p className="text-xl font-extrabold text-brand-600 dark:text-brand-300 font-mono mt-1">{formatCurrency(summary.totalDisbursed)}</p>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="glass-card rounded-2xl p-4 border border-slate-200 dark:border-surface-700/60 shadow-lg space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search text */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search client, mobile, note..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-xs focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* Type Filter */}
          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-brand-500"
            >
              <option value="">All Types (Payments & Disbursements)</option>
              <option value="payment">Payments / Repayments Only</option>
              <option value="disbursement">Disbursements (Loan Given) Only</option>
              <option value="penalty">Penalties Only</option>
              <option value="adjustment">Adjustments Only</option>
            </select>
          </div>

          {/* Start Date */}
          <div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-brand-500"
              title="From Date"
            />
          </div>

          {/* End Date */}
          <div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-surface-950 border border-slate-200 dark:border-surface-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-brand-500"
              title="To Date"
            />
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      {loading ? (
        <div className="p-12 text-center">
          <div className="w-8 h-8 border-3 border-brand-500/20 border-t-brand-500 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-500 dark:text-slate-400">Loading ledger...</p>
        </div>
      ) : transactions.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center space-y-2 border border-slate-200 dark:border-surface-700/60">
          <p className="text-base font-bold text-slate-900 dark:text-white">No transactions found</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">No records matched the selected filters.</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl border border-slate-200 dark:border-surface-700/60 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-surface-950/90 border-b border-slate-200 dark:border-surface-800 text-slate-500 dark:text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3.5">ID / Date</th>
                  <th className="px-4 py-3.5">Client</th>
                  <th className="px-4 py-3.5">Type</th>
                  <th className="px-4 py-3.5">Amount</th>
                  <th className="px-4 py-3.5">Mode</th>
                  <th className="px-4 py-3.5">Balance After</th>
                  <th className="px-4 py-3.5">Note</th>
                  <th className="px-4 py-3.5 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-surface-800/60">
                {transactions.map(txn => {
                  const isPayment = txn.transactionType === 'payment';
                  const isDisbursement = txn.transactionType === 'disbursement';

                  return (
                    <tr key={txn.id} className="hover:bg-slate-50 dark:hover:bg-surface-800/30 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                        <div>{formatDate(txn.transactionDate)}</div>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">#{txn.id}</span>
                      </td>

                      <td className="px-4 py-3">
                        <button
                          onClick={() => onOpenClientDetail(txn.clientId)}
                          className="font-bold text-slate-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-300 text-left transition-colors block"
                        >
                          {txn.clientName}
                        </button>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">+91 {txn.mobileNumber}</span>
                      </td>

                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          isPayment
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                            : isDisbursement
                            ? 'bg-purple-50 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30'
                        }`}>
                          {txn.transactionType}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-mono font-bold text-sm">
                        <span className={isPayment ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'}>
                          {isPayment ? '+' : ''}{formatCurrency(txn.amount)}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {txn.paymentMode || 'Cash'}
                      </td>

                      <td className="px-4 py-3 font-mono font-semibold text-slate-700 dark:text-slate-300">
                        {formatCurrency(txn.remainingAfter)}
                      </td>

                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 italic max-w-xs truncate">
                        {txn.note || '-'}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {isPayment && (
                          <button
                            onClick={() => onOpenReceipt({
                              transactionId: txn.id,
                              clientName: txn.clientName,
                              mobileNumber: txn.mobileNumber,
                              amount: txn.amount,
                              transactionDate: txn.transactionDate,
                              transactionType: txn.transactionType,
                              paymentMode: txn.paymentMode,
                              remainingAfter: txn.remainingAfter,
                              loanAmount: txn.loanAmount,
                              dueDate: txn.loanDueDate,
                              note: txn.note
                            })}
                            title="Print Payment Receipt"
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-surface-800 dark:hover:bg-surface-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors inline-block"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
