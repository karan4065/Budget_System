import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { useNotify } from '../context/NotificationContext';
import { useSync } from '../context/SyncContext';
import { 
  formatCurrency, 
  formatDate, 
  getDurationLabel, 
  maskAadhaar 
} from '../utils/formatters';
import { 
  AlertOctagon, 
  AlertTriangle, 
  AlertCircle,
  Search, 
  RefreshCw, 
  Eye, 
  CreditCard, 
  Phone, 
  Calendar, 
  Clock, 
  TrendingUp, 
  CheckCircle2, 
  MessageSquare, 
  Smartphone, 
  Copy, 
  Check, 
  X, 
  ShieldAlert, 
  ArrowUpDown, 
  Filter,
  DollarSign,
  Users
} from 'lucide-react';

export function OverdueAccounts({ 
  onOpenClientDetail, 
  onOpenPayment, 
  onOpenAddClient 
}) {
  const { success, error } = useNotify();
  const { refreshSignal, triggerRefresh } = useSync();

  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [durationFilter, setDurationFilter] = useState('all');
  const [sortBy, setSortBy] = useState('days_desc'); // 'days_desc' | 'amount_desc' | 'client_no'

  // Modal / Reminder dialog states
  const [reminderChooserData, setReminderChooserData] = useState(null);
  const [pendingReminder, setPendingReminder] = useState(null);
  const [confirmingReminder, setConfirmingReminder] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [sendingReminderId, setSendingReminderId] = useState(null);

  const fetchOverdueClients = async () => {
    try {
      setLoading(true);
      const res = await api.getClients({ duration: 'overdue' });
      const todayStr = new Date().toISOString().split('T')[0];
      // Strict guard: only keep clients whose due date has actually passed and still owe money
      const genuinelyOverdue = (res.clients || []).filter(c => {
        const dueDate = c.dueDate || '';
        const remaining = Number(c.remainingAmount) || 0;
        return dueDate && dueDate < todayStr && remaining > 0;
      });
      setClients(genuinelyOverdue);
    } catch (err) {
      error(err.message || 'Failed to load overdue clients.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverdueClients();
  }, [refreshSignal]);

  // Calculations for summary metrics
  const summaryMetrics = useMemo(() => {
    let totalPrincipal = 0;
    let totalBaseInterest = 0;
    let totalOverdueInterest = 0;
    let totalPayable = 0;
    let totalOutstanding = 0;
    let totalCollected = 0;

    clients.forEach(c => {
      const principal = Number(c.amountTaken) || 0;
      const baseInt = Number(c.baseInterest) || (principal * 0.10);
      const overdueInt = Number(c.overdueInterest) || 0;
      const payable = Number(c.totalPayable) || (principal + baseInt + overdueInt);
      const outstanding = Number(c.remainingAmount) || (payable - (Number(c.totalPaid) || 0));
      const paid = Number(c.totalPaid) || 0;

      totalPrincipal += principal;
      totalBaseInterest += baseInt;
      totalOverdueInterest += overdueInt;
      totalPayable += payable;
      totalOutstanding += outstanding;
      totalCollected += paid;
    });

    return {
      count: clients.length,
      totalPrincipal,
      totalBaseInterest,
      totalOverdueInterest,
      totalTotalInterest: totalBaseInterest + totalOverdueInterest,
      totalPayable,
      totalOutstanding,
      totalCollected
    };
  }, [clients]);

  // Filtered and sorted clients
  const filteredClients = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return clients
      .filter(c => {
        // Double-check: due date must be strictly before today and balance must be > 0
        const dueDate = c.dueDate || '';
        const remaining = Number(c.remainingAmount) || 0;
        if (!dueDate || dueDate >= todayStr || remaining <= 0) return false;

        if (durationFilter !== 'all' && (c.duration || '').toLowerCase() !== durationFilter.toLowerCase()) {
          return false;
        }
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        const clientNoStr = String(c.clientNo || c.id || '');
        const nameStr = (c.name || '').toLowerCase();
        const phoneStr = (c.mobileNumber || '').toLowerCase();
        return clientNoStr.includes(q) || nameStr.includes(q) || phoneStr.includes(q);
      })
      .sort((a, b) => {
        if (sortBy === 'days_desc') {
          return (b.daysOverdue || 0) - (a.daysOverdue || 0);
        }
        if (sortBy === 'amount_desc') {
          return (Number(b.remainingAmount) || 0) - (Number(a.remainingAmount) || 0);
        }
        if (sortBy === 'client_no') {
          return (Number(a.clientNo || a.id) || 0) - (Number(b.clientNo || b.id) || 0);
        }
        return 0;
      });
  }, [clients, searchQuery, durationFilter, sortBy]);

  const handleOpenReminderChooser = (e, loanId, clientName, mobileNumber) => {
    e.stopPropagation();
    if (!loanId) return;
    setReminderChooserData({ loanId, clientName, mobileNumber });
  };

  const handleTriggerReminder = async (loanId, channel = 'whatsapp') => {
    if (!loanId) return;
    setSendingReminderId(loanId);
    try {
      const res = await api.prepareManualReminder(loanId);

      // Open delivery channel
      if (channel === 'whatsapp' && res.directWhatsAppUrl) {
        window.open(res.directWhatsAppUrl, '_blank', 'noopener,noreferrer');
      } else if (channel === 'sms') {
        const recipient = res.phoneNumber || res.recipient || reminderChooserData?.mobileNumber || '';
        const cleanDigits = String(recipient).replace(/\D/g, '');
        const phoneFormatted = cleanDigits.length === 10 ? `+91${cleanDigits}` : (cleanDigits ? `+${cleanDigits}` : '');
        const smsUrl = `sms:${phoneFormatted}?body=${encodeURIComponent(res.messageText)}`;
        
        const link = document.createElement('a');
        link.href = smsUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      setReminderChooserData(null);
      setPendingReminder({
        loanId,
        channel,
        clientName: res.clientName || reminderChooserData?.clientName || 'Client',
        phoneNumber: res.phoneNumber || res.recipient || reminderChooserData?.mobileNumber,
        messageText: res.messageText,
        reminderType: res.reminderType || 'overdue',
        amount: res.amount
      });
    } catch (err) {
      error(err.message || 'Failed to prepare overdue reminder.');
    } finally {
      setSendingReminderId(null);
    }
  };

  const handleConfirmReminderLog = async () => {
    if (!pendingReminder) return;
    setConfirmingReminder(true);
    try {
      const res = await api.confirmManualReminder(pendingReminder.loanId, {
        messageText: pendingReminder.messageText,
        reminderType: pendingReminder.reminderType,
        channel: pendingReminder.channel
      });
      success(res.message || 'Overdue reminder history recorded.');
      setPendingReminder(null);
      triggerRefresh();
    } catch (err) {
      error(err.message || 'Failed to record reminder history.');
    } finally {
      setConfirmingReminder(false);
    }
  };

  const handleCopyMessage = () => {
    if (!pendingReminder?.messageText) return;
    navigator.clipboard.writeText(pendingReminder.messageText);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2000);
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-rose-500/10 via-amber-500/10 to-rose-500/5 dark:from-rose-950/40 dark:via-amber-950/30 dark:to-surface-900 border border-rose-200 dark:border-rose-500/30 p-5 rounded-2xl shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/30 flex-shrink-0">
            <AlertOctagon className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Overdue Accounts (Weekly Accrual)
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500 text-white shadow-sm">
                {summaryMetrics.count} Overdue
              </span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              Automatic +10% principal interest applied each week overdue past due date until payment is settled.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-center">
          <button
            onClick={() => {
              triggerRefresh();
              fetchOverdueClients();
            }}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-surface-800 hover:bg-slate-100 dark:hover:bg-surface-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-surface-700 rounded-xl text-sm font-medium transition-all shadow-sm active:scale-95 disabled:opacity-60"
            title="Refresh overdue balances"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-rose-500' : ''}`} />
            <span>Recalculate & Sync</span>
          </button>
        </div>
      </div>

      {/* Accrual Policy Explanation Box */}
      <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-4 rounded-xl flex items-start gap-3 text-xs sm:text-sm text-amber-900 dark:text-amber-200">
        <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed">
          <span className="font-bold text-amber-950 dark:text-amber-100">Weekly Overdue Accrual Rule:</span>{' '}
          When a loan passes its due date, <strong>10% of Principal</strong> is added for the 1st overdue week (Days 1–7), another <strong>+10%</strong> for the 2nd week (Days 8–14), and so on (e.g. ₹1,000 principal: ₹1,100 on due date &rarr; ₹1,200 Week 1 &rarr; ₹1,300 Week 2 &rarr; ₹1,400 Week 3).
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Overdue Accounts */}
        <div className="bg-white dark:bg-surface-900 border border-slate-200 dark:border-surface-800 rounded-2xl p-4 shadow-sm hover:border-rose-300 dark:hover:border-rose-500/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Overdue Accounts</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-500/15 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
            {summaryMetrics.count}
          </div>
          <div className="text-[11px] font-medium text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-1">
            <span>Requires active collection</span>
          </div>
        </div>

        {/* Principal in Default */}
        <div className="bg-white dark:bg-surface-900 border border-slate-200 dark:border-surface-800 rounded-2xl p-4 shadow-sm hover:border-slate-300 dark:hover:border-surface-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Principal Given</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
            {formatCurrency(summaryMetrics.totalPrincipal)}
          </div>
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1">
            Base principal disbursed
          </div>
        </div>

        {/* Accrued Interest Added */}
        <div className="bg-white dark:bg-surface-900 border border-slate-200 dark:border-surface-800 rounded-2xl p-4 shadow-sm hover:border-amber-300 dark:hover:border-amber-500/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Accrued Interest</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-500/15 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-600 dark:text-amber-400 mt-2">
            {formatCurrency(summaryMetrics.totalTotalInterest)}
          </div>
          <div className="text-[11px] font-medium text-amber-700 dark:text-amber-300 mt-1">
            {formatCurrency(summaryMetrics.totalOverdueInterest)} weekly accrual added
          </div>
        </div>

        {/* Total Overdue Outstanding */}
        <div className="bg-white dark:bg-surface-900 border border-rose-200 dark:border-rose-500/40 rounded-2xl p-4 shadow-sm bg-gradient-to-b from-rose-50/50 to-transparent dark:from-rose-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-700 dark:text-rose-300 uppercase tracking-wider">Total Outstanding</span>
            <div className="w-8 h-8 rounded-xl bg-rose-500 text-white flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-rose-600 dark:text-rose-400 mt-2">
            {formatCurrency(summaryMetrics.totalOutstanding)}
          </div>
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1">
            Total to collect right now
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-surface-900 border border-slate-200 dark:border-surface-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Search input */}
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search overdue by name, phone, or Client #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-surface-800 border border-slate-200 dark:border-surface-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
            >
              Clear
            </button>
          )}
        </div>

        {/* Filters and sorting */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {/* Duration filter */}
          <select
            value={durationFilter}
            onChange={(e) => setDurationFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-surface-800 border border-slate-200 dark:border-surface-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            <option value="all">All Loan Durations</option>
            <option value="weekly">Weekly (7 Days)</option>
            <option value="fortnight">Fortnight (14 Days)</option>
            <option value="monthly">Monthly (30 Days)</option>
          </select>

          {/* Sort order */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-surface-800 border border-slate-200 dark:border-surface-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            <option value="days_desc">Most Days Overdue</option>
            <option value="amount_desc">Highest Outstanding Balance</option>
            <option value="client_no">Client Number (1, 2, 3...)</option>
          </select>
        </div>
      </div>

      {/* Main Content: Table & Cards */}
      {loading ? (
        <div className="p-12 flex flex-col items-center justify-center bg-white dark:bg-surface-900 border border-slate-200 dark:border-surface-800 rounded-2xl space-y-4">
          <div className="w-10 h-10 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading overdue accounts & calculating weekly interest...</p>
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-surface-900 border border-slate-200 dark:border-surface-800 rounded-2xl space-y-3">
          <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">All Clear! No Overdue Accounts Found</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {searchQuery || durationFilter !== 'all' 
              ? 'No overdue clients match your search criteria. Try resetting filters.' 
              : 'All active clients are up to date on their loan repayment schedules.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table View */}
          <div className="hidden lg:block bg-white dark:bg-surface-900 border border-slate-200 dark:border-surface-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-surface-800 bg-slate-50/75 dark:bg-surface-950/50 text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
                    <th className="py-3.5 px-4">Client</th>
                    <th className="py-3.5 px-4">Loan Schedule</th>
                    <th className="py-3.5 px-4">Overdue Status</th>
                    <th className="py-3.5 px-4">Principal</th>
                    <th className="py-3.5 px-4">Accrued Interest</th>
                    <th className="py-3.5 px-4">Total Payable</th>
                    <th className="py-3.5 px-4">Remaining Balance</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-surface-800 text-sm">
                  {filteredClients.map((client) => {
                    const principal = Number(client.amountTaken) || 0;
                    const baseInt = Number(client.baseInterest) || (principal * 0.10);
                    const overdueInt = Number(client.overdueInterest) || 0;
                    const totalInt = baseInt + overdueInt;
                    const payable = Number(client.totalPayable) || (principal + totalInt);
                    const remaining = Number(client.remainingAmount) || payable;
                    const daysOverdue = client.daysOverdue || 0;
                    const overdueWeeks = client.overdueWeeks || (daysOverdue > 0 ? Math.ceil(daysOverdue / 7) : 0);

                    return (
                      <tr
                        key={client.id}
                        onClick={() => onOpenClientDetail(client.id)}
                        className="hover:bg-rose-50/40 dark:hover:bg-rose-950/10 transition-colors cursor-pointer group"
                      >
                        {/* Client Info */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-600 text-white font-bold flex items-center justify-center shadow-sm text-xs flex-shrink-0">
                              #{client.clientNo || client.id}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 dark:text-white group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors flex items-center gap-1.5">
                                <span>{client.name}</span>
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 font-mono">
                                <Phone className="w-3 h-3 text-slate-400" />
                                <span>{client.mobileNumber}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Loan Schedule */}
                        <td className="py-3.5 px-4">
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 capitalize">
                            {client.duration || 'weekly'}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>Due: {formatDate(client.dueDate)}</span>
                          </div>
                        </td>

                        {/* Overdue Status Badge */}
                        <td className="py-3.5 px-4">
                          <div className="inline-flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 animate-pulse">
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>{daysOverdue} Days Overdue</span>
                            </span>
                            <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 pl-1">
                              Week {overdueWeeks} Accrual (+{formatCurrency(overdueInt)})
                            </span>
                          </div>
                        </td>

                        {/* Principal */}
                        <td className="py-3.5 px-4 font-semibold text-slate-700 dark:text-slate-300">
                          {formatCurrency(principal)}
                        </td>

                        {/* Accrued Interest Breakdown */}
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-amber-600 dark:text-amber-400">
                            {formatCurrency(totalInt)}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            {formatCurrency(baseInt)} base + {formatCurrency(overdueInt)} ({overdueWeeks}w)
                          </div>
                        </td>

                        {/* Total Payable */}
                        <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                          {formatCurrency(payable)}
                        </td>

                        {/* Remaining Amount */}
                        <td className="py-3.5 px-4">
                          <span className="text-base font-extrabold text-rose-600 dark:text-rose-400">
                            {formatCurrency(remaining)}
                          </span>
                          {Number(client.totalPaid) > 0 && (
                            <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
                              Paid: {formatCurrency(client.totalPaid)}
                            </div>
                          )}
                        </td>

                        {/* Action Buttons */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {/* Collect Payment */}
                            <button
                              onClick={() => onOpenPayment({
                                id: client.latestRecordId,
                                amountTaken: principal,
                                interestAmount: totalInt,
                                totalPayable: payable,
                                remainingAmount: remaining,
                                totalPaid: client.totalPaid || 0,
                                duration: client.duration,
                                dueDate: client.dueDate
                              }, client)}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm transition-all active:scale-95"
                              title="Collect Payment"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              <span>Pay</span>
                            </button>

                            {/* WhatsApp / SMS Reminder Chooser */}
                            <button
                              onClick={(e) => handleOpenReminderChooser(e, client.latestRecordId, client.name, client.mobileNumber)}
                              className="px-2.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm transition-all active:scale-95"
                              title="Send Reminder"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>Remind</span>
                            </button>

                            {/* View Client Details */}
                            <button
                              onClick={() => onOpenClientDetail(client.id)}
                              className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-surface-800 dark:hover:bg-surface-700 rounded-lg transition-colors"
                              title="View Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile / Tablet Cards View */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:hidden gap-3.5">
            {filteredClients.map((client) => {
              const principal = Number(client.amountTaken) || 0;
              const baseInt = Number(client.baseInterest) || (principal * 0.10);
              const overdueInt = Number(client.overdueInterest) || 0;
              const totalInt = baseInt + overdueInt;
              const payable = Number(client.totalPayable) || (principal + totalInt);
              const remaining = Number(client.remainingAmount) || payable;
              const daysOverdue = client.daysOverdue || 0;
              const overdueWeeks = client.overdueWeeks || (daysOverdue > 0 ? Math.ceil(daysOverdue / 7) : 0);

              return (
                <div
                  key={client.id}
                  onClick={() => onOpenClientDetail(client.id)}
                  className="bg-white dark:bg-surface-900 border border-rose-200 dark:border-rose-500/30 rounded-2xl p-4 shadow-sm hover:border-rose-400 transition-all cursor-pointer relative overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-600 text-white font-bold flex items-center justify-center text-sm flex-shrink-0 shadow-sm">
                        #{client.clientNo || client.id}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white text-base leading-tight">
                          {client.name}
                        </h4>
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5 font-mono">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{client.mobileNumber}</span>
                        </div>
                      </div>
                    </div>

                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 animate-pulse">
                      {daysOverdue}d Overdue
                    </span>
                  </div>

                  {/* Overdue interest breakdown banner */}
                  <div className="mt-3 p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-500/10 border border-amber-200/80 dark:border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                    <div className="flex justify-between items-center font-bold">
                      <span>Week {overdueWeeks} Accrual Active:</span>
                      <span className="text-rose-600 dark:text-rose-400">+{formatCurrency(overdueInt)} Overdue Int.</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-300">
                      <span>Principal: {formatCurrency(principal)}</span>
                      <span>Total Interest: {formatCurrency(totalInt)}</span>
                    </div>
                  </div>

                  {/* Financial amounts summary */}
                  <div className="mt-3 grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-surface-800 text-xs">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-semibold">Total Payable</span>
                      <span className="font-bold text-slate-900 dark:text-white text-sm">
                        {formatCurrency(payable)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-rose-600 dark:text-rose-400 block text-[10px] uppercase font-semibold">Remaining Due</span>
                      <span className="font-extrabold text-rose-600 dark:text-rose-400 text-base">
                        {formatCurrency(remaining)}
                      </span>
                    </div>
                  </div>

                  {/* Mobile Actions */}
                  <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-surface-800 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onOpenPayment({
                        id: client.latestRecordId,
                        amountTaken: principal,
                        interestAmount: totalInt,
                        totalPayable: payable,
                        remainingAmount: remaining,
                        totalPaid: client.totalPaid || 0,
                        duration: client.duration,
                        dueDate: client.dueDate
                      }, client)}
                      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Collect Payment</span>
                    </button>

                    <button
                      onClick={(e) => handleOpenReminderChooser(e, client.latestRecordId, client.name, client.mobileNumber)}
                      className="flex-1 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Send Reminder</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reminder Channel Chooser Modal */}
      {reminderChooserData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-surface-900 border border-slate-200 dark:border-surface-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Send Overdue Reminder</h3>
              </div>
              <button
                onClick={() => setReminderChooserData(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Send an official overdue notice with updated balance and weekly accrued interest to <strong>{reminderChooserData.clientName}</strong> ({reminderChooserData.mobileNumber}):
            </p>

            <div className="space-y-2">
              <button
                onClick={() => handleTriggerReminder(reminderChooserData.loanId, 'whatsapp')}
                disabled={sendingReminderId === reminderChooserData.loanId}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm shadow-md shadow-emerald-500/20 active:scale-98 transition-all disabled:opacity-50"
              >
                <div className="flex items-center gap-2.5">
                  <MessageSquare className="w-5 h-5" />
                  <span>Send via WhatsApp</span>
                </div>
                <span className="text-xs bg-emerald-600/40 px-2 py-0.5 rounded-md">Direct</span>
              </button>

              <button
                onClick={() => handleTriggerReminder(reminderChooserData.loanId, 'sms')}
                disabled={sendingReminderId === reminderChooserData.loanId}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-600/20 active:scale-98 transition-all disabled:opacity-50"
              >
                <div className="flex items-center gap-2.5">
                  <Smartphone className="w-5 h-5" />
                  <span>Send via Direct SMS</span>
                </div>
                <span className="text-xs bg-indigo-700/40 px-2 py-0.5 rounded-md">SMS App</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal to Log Sent History */}
      {pendingReminder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-surface-900 border border-slate-200 dark:border-surface-800 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Check className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Record Sent History?</h3>
              </div>
              <button
                onClick={() => setPendingReminder(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-surface-800/80 rounded-xl text-xs space-y-2 border border-slate-200 dark:border-surface-700">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span>Client: <strong>{pendingReminder.clientName}</strong></span>
                <span>{pendingReminder.channel === 'sms' ? 'Direct SMS' : 'WhatsApp'}</span>
              </div>
              <div className="p-2 bg-white dark:bg-surface-900 rounded-lg border border-slate-200 dark:border-surface-700 font-mono text-[11px] text-slate-700 dark:text-slate-300 max-h-24 overflow-y-auto">
                {pendingReminder.messageText}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyMessage}
                className="flex items-center gap-1 px-3 py-2 bg-slate-100 dark:bg-surface-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition-colors"
              >
                {copiedMessage ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedMessage ? 'Copied' : 'Copy Text'}</span>
              </button>

              <button
                onClick={handleConfirmReminderLog}
                disabled={confirmingReminder}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow-md shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{confirmingReminder ? 'Recording...' : 'Yes, Log to History (+1)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
