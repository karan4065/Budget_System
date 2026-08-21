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
  Filter, 
  CalendarDays, 
  CalendarRange, 
  Calendar, 
  Users, 
  Eye, 
  CreditCard, 
  PlusCircle, 
  Phone, 
  ArrowUpDown, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  RefreshCw, 
  ExternalLink, 
  MessageSquare,
  History
} from 'lucide-react';

export function ClientLists({ 
  initialDuration = null, 
  onOpenClientDetail, 
  onOpenAddClient, 
  onOpenPayment 
}) {
  const { success, error } = useNotify();
  const { refreshSignal, triggerRefresh } = useSync();

  // Active filter tab: 'weekly' | 'fortnight' | 'monthly' | 'due-tomorrow' | 'history'
  const [activeDuration, setActiveDuration] = useState(initialDuration || 'weekly');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'overdue' | 'completed'
  const [searchQuery, setSearchQuery] = useState('');
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendingReminderId, setSendingReminderId] = useState(null);

  // Sync if initialDuration prop changes from navigation
  useEffect(() => {
    if (initialDuration) {
      setActiveDuration(initialDuration);
    }
  }, [initialDuration]);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const params = {};
      if (activeDuration !== 'all') {
        params.duration = activeDuration;
      }
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const res = await api.getClients(params);
      setClients(res.clients || []);
    } catch (err) {
      error(err.message || 'Failed to fetch clients.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [activeDuration, statusFilter, searchQuery, refreshSignal]);

  const [pendingReminder, setPendingReminder] = useState(null);
  const [confirmingReminder, setConfirmingReminder] = useState(false);

  const handleSendReminder = async (e, loanId, clientName) => {
    e.stopPropagation();
    if (!loanId) return;
    setSendingReminderId(loanId);
    try {
      const res = await api.prepareManualReminder(loanId);
      if (res.directWhatsAppUrl) {
        window.open(res.directWhatsAppUrl, '_blank', 'noopener,noreferrer');
      }
      setPendingReminder({
        loanId,
        clientName: res.clientName || clientName || 'Client',
        messageText: res.messageText,
        reminderType: res.reminderType
      });
      success(`WhatsApp opened for ${res.clientName || clientName}. Send the message and confirm below.`);
    } catch (err) {
      error(err.message || 'Failed to prepare WhatsApp reminder.');
    } finally {
      setSendingReminderId(null);
    }
  };

  const handleConfirmReminderSent = async () => {
    if (!pendingReminder) return;
    setConfirmingReminder(true);
    try {
      const res = await api.confirmReminderLog(pendingReminder.loanId, {
        messageText: pendingReminder.messageText,
        reminderType: pendingReminder.reminderType
      });
      success(res.message || 'WhatsApp reminder successfully logged (+1)!');
      setPendingReminder(null);
      triggerRefresh();
      fetchClients();
    } catch (err) {
      error(err.message || 'Failed to record reminder log.');
    } finally {
      setConfirmingReminder(false);
    }
  };

  const getHeaderInfo = () => {
    switch (activeDuration) {
      case 'due-tomorrow':
      case 'due_tomorrow':
        return {
          title: 'Due Tomorrow',
          badge: 'Unpaid Dues',
          icon: Clock,
          desc: 'Active loans due tomorrow awaiting repayment. Send advance WhatsApp reminders.',
          color: 'amber'
        };
      case 'weekly':
        return {
          title: 'Weekly Schedule',
          badge: '7 Days Active',
          icon: CalendarDays,
          desc: 'Active loans with 7-day repayment schedule (+10% interest).',
          color: 'blue'
        };
      case 'fortnight':
        return {
          title: 'Fortnightly Schedule',
          badge: '14 Days Active',
          icon: CalendarRange,
          desc: 'Active loans with 14-day repayment schedule (+10% interest).',
          color: 'purple'
        };
      case 'monthly':
        return {
          title: 'Monthly Schedule',
          badge: '1 Month Active',
          icon: Calendar,
          desc: 'Active loans with monthly repayment schedule (+10% interest).',
          color: 'emerald'
        };
      case 'history':
      case 'completed':
      case 'paid':
        return {
          title: 'Loan History',
          badge: 'Archived / Paid',
          icon: History,
          desc: 'Archived list of completed and fully settled loans with zero remaining balance.',
          color: 'emerald'
        };
      default:
        return {
          title: 'Loan Records',
          badge: 'Active Loans',
          icon: CalendarDays,
          desc: 'List of loans and schedule records.',
          color: 'brand'
        };
    }
  };

  const headerInfo = getHeaderInfo();
  const HeaderIcon = headerInfo.icon;

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      {/* Category Tabs Switcher */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 dark:border-surface-800 scrollbar-none">
        {[
          { id: 'weekly', label: 'Weekly (7 Days)', icon: CalendarDays, color: 'text-blue-600 dark:text-blue-400' },
          { id: 'fortnight', label: 'Fortnightly (14 Days)', icon: CalendarRange, color: 'text-purple-600 dark:text-purple-400' },
          { id: 'monthly', label: 'Monthly (30 Days)', icon: Calendar, color: 'text-emerald-600 dark:text-emerald-400' },
          { id: 'due-tomorrow', label: 'Due Tomorrow', icon: Clock, color: 'text-amber-600 dark:text-amber-400' },
          { id: 'history', label: 'History', icon: History, color: 'text-emerald-600 dark:text-emerald-400' }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeDuration === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveDuration(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30'
                  : 'bg-white dark:bg-surface-900/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-surface-800 border border-slate-200 dark:border-surface-800'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : tab.color}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Page Title & Search Header */}
      <div className="glass-card rounded-2xl p-5 border border-slate-200 dark:border-surface-700/60 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-surface-800 border border-slate-200 dark:border-surface-700 flex items-center justify-center text-brand-600 dark:text-brand-400">
              <HeaderIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">{headerInfo.title}</h1>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-700 dark:text-brand-300 border border-brand-500/30">
                  {headerInfo.badge}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{headerInfo.desc}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchClients}
            title="Refresh list"
            className="p-2.5 rounded-xl bg-slate-100 dark:bg-surface-900 border border-slate-200 dark:border-surface-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-surface-800 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={onOpenAddClient}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-md shadow-brand-600/25 active:scale-95 transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ Add Client</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        {/* Search input */}
        <div className="sm:col-span-8 relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by client name, mobile number, or Aadhaar..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-surface-900/90 border border-slate-200 dark:border-surface-700/80 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500 text-sm shadow-inner transition-all"
          />
        </div>

        {/* Status selector */}
        <div className="sm:col-span-4 flex items-center gap-1.5 bg-white dark:bg-surface-900/90 border border-slate-200 dark:border-surface-700/80 p-1 rounded-xl">
          {[
            { id: 'all', label: 'All' },
            { id: 'active', label: 'Active' },
            { id: 'overdue', label: 'Overdue' },
            { id: 'completed', label: 'Completed' },
          ].map(st => (
            <button
              key={st.id}
              onClick={() => setStatusFilter(st.id)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === st.id
                  ? 'bg-slate-100 dark:bg-surface-800 text-slate-900 dark:text-white shadow-sm border border-slate-300 dark:border-surface-700'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Clients Display: Responsive Desktop Table & Mobile Cards */}
      {loading ? (
        <div className="p-12 text-center">
          <div className="w-8 h-8 border-3 border-brand-500/20 border-t-brand-500 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-500 dark:text-slate-400">Loading {headerInfo.title}...</p>
        </div>
      ) : clients.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border border-slate-200 dark:border-surface-700/60 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-surface-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mx-auto">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">No clients found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              {searchQuery 
                ? `No clients matched "${searchQuery}" in this category.` 
                : `There are currently no clients registered under ${headerInfo.title}.`}
            </p>
          </div>
          <button
            onClick={onOpenAddClient}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-brand-600 hover:bg-brand-500 shadow transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add First Client</span>
          </button>
        </div>
      ) : (
        <>
          {/* Desktop & Tablet Table (Hidden on Mobile) */}
          <div className="hidden md:block glass-card rounded-2xl border border-slate-200 dark:border-surface-700/60 shadow-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-surface-950/80 border-b border-slate-200 dark:border-surface-800 text-slate-500 dark:text-slate-400 uppercase font-semibold tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Client Details</th>
                  <th className="px-5 py-3.5">Amount Taken</th>
                  <th className="px-5 py-3.5">Start Date</th>
                  <th className="px-5 py-3.5">Due Date</th>
                  <th className="px-5 py-3.5">Outstanding</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-surface-800/80">
                {clients.map(client => {
                  const statusInfo = getDueStatusInfo(client.dueDate, client.remainingAmount);
                  const isOverdue = statusInfo.status === 'overdue';

                  return (
                    <tr 
                      key={client.id}
                      className="hover:bg-slate-50 dark:hover:bg-surface-800/40 transition-colors group cursor-pointer"
                      onClick={() => onOpenClientDetail(client.id)}
                    >
                      {/* Name & Mobile */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-brand-600/20 to-indigo-600/20 dark:from-brand-600/30 dark:to-indigo-600/30 border border-brand-500/30 text-brand-600 dark:text-brand-300 font-bold flex items-center justify-center text-sm shadow-inner">
                            {client.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-300 transition-colors">
                              {client.name}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                              <span>+91 {client.mobileNumber}</span>
                              {client.maskedAadhaar && (
                                <span className="text-[10px] text-slate-400 dark:text-slate-500">({client.maskedAadhaar})</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Amount Taken */}
                      <td className="px-5 py-4 font-mono font-bold text-slate-800 dark:text-slate-200 text-sm">
                        {formatCurrency(client.amountTaken)}
                        <span className="block text-[10px] font-normal text-slate-500 dark:text-slate-400 uppercase">
                          {getDurationLabel(client.duration)}
                        </span>
                      </td>

                      {/* Start Date */}
                      <td className="px-5 py-4 text-slate-700 dark:text-slate-300">
                        {formatDate(client.startDate)}
                      </td>

                      {/* Due Date & relative badge */}
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {formatDate(client.dueDate)}
                        </div>
                        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold ${statusInfo.badgeClass}`}>
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* Outstanding */}
                      <td className="px-5 py-4 font-mono">
                        <div className={`font-bold text-sm ${client.remainingAmount > 0 ? (isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-300') : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {formatCurrency(client.remainingAmount)}
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          Paid: {formatCurrency(client.totalPaid || 0)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                          client.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                            : isOverdue
                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30'
                            : 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30'
                        }`}>
                          {client.status || 'active'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                        {client.latestRecordId && client.remainingAmount > 0 && (
                          <button
                            onClick={(e) => handleSendReminder(e, client.latestRecordId, client.name)}
                            disabled={sendingReminderId === client.latestRecordId}
                            title="Send WhatsApp Payment Reminder"
                            className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30 transition-all inline-flex items-center gap-1.5 text-xs font-semibold"
                          >
                            <MessageSquare className={`w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 ${sendingReminderId === client.latestRecordId ? 'animate-pulse' : ''}`} />
                            <span className="hidden xl:inline">WhatsApp</span>
                          </button>
                        )}

                        {client.remainingAmount > 0 && (
                          <button
                            onClick={() => onOpenPayment({
                              id: client.latestRecordId,
                              amountTaken: client.amountTaken,
                              totalPaid: client.totalPaid,
                              remainingAmount: client.remainingAmount,
                              dueDate: client.dueDate
                            }, client)}
                            title="Record Payment"
                            className="p-2 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:hover:bg-purple-500/20 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30 transition-all inline-flex items-center gap-1 text-xs font-semibold"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span className="hidden xl:inline">Pay</span>
                          </button>
                        )}

                        <button
                          onClick={() => onOpenClientDetail(client.id)}
                          className="p-2 rounded-lg bg-slate-100 hover:bg-brand-600 hover:text-white text-slate-700 dark:bg-surface-800 dark:hover:bg-brand-600 dark:hover:text-white dark:text-slate-300 border border-slate-200 dark:border-surface-700 transition-all inline-flex items-center gap-1 text-xs font-semibold"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View (Visible on Mobile) */}
          <div className="md:hidden space-y-3">
            {clients.map(client => {
              const statusInfo = getDueStatusInfo(client.dueDate, client.remainingAmount);
              const isOverdue = statusInfo.status === 'overdue';

              return (
                <div
                  key={client.id}
                  onClick={() => onOpenClientDetail(client.id)}
                  className="glass-card rounded-2xl p-4 border border-slate-200 dark:border-surface-700/60 shadow-lg space-y-3 active:scale-[0.99] transition-transform"
                >
                  {/* Top Bar: Name, Status & Mobile */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-base text-slate-900 dark:text-white">{client.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                        <a 
                          href={`tel:${client.mobileNumber}`} 
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline"
                        >
                          <Phone className="w-3 h-3" />
                          <span>+91 {client.mobileNumber}</span>
                        </a>
                      </div>
                    </div>

                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      client.status === 'completed'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                        : isOverdue
                        ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30'
                        : 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30'
                    }`}>
                      {client.status || 'active'}
                    </span>
                  </div>

                  {/* Financial Grid */}
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-surface-950/60 p-3 rounded-xl border border-slate-200 dark:border-surface-800 text-xs">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase">Loan Amount</p>
                      <p className="font-bold font-mono text-sm text-slate-800 dark:text-slate-200">{formatCurrency(client.amountTaken)}</p>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">{getDurationLabel(client.duration)}</span>
                    </div>

                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 uppercase">Outstanding</p>
                      <p className={`font-bold font-mono text-sm ${isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-300'}`}>
                        {formatCurrency(client.remainingAmount)}
                      </p>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">Paid: {formatCurrency(client.totalPaid || 0)}</span>
                    </div>
                  </div>

                  {/* Due Date & Actions footer */}
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Due: <strong>{formatDate(client.dueDate)}</strong></span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${statusInfo.badgeClass}`}>
                        {statusInfo.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {client.latestRecordId && client.remainingAmount > 0 && (
                        <button
                          onClick={(e) => handleSendReminder(e, client.latestRecordId, client.name)}
                          disabled={sendingReminderId === client.latestRecordId}
                          title="Send WhatsApp Reminder"
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30 font-bold text-xs inline-flex items-center gap-1"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>WhatsApp</span>
                        </button>
                      )}

                      {client.remainingAmount > 0 && (
                        <button
                          onClick={() => onOpenPayment({
                            id: client.latestRecordId,
                            amountTaken: client.amountTaken,
                            totalPaid: client.totalPaid,
                            remainingAmount: client.remainingAmount,
                            dueDate: client.dueDate
                          }, client)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs shadow transition-all"
                        >
                          Pay
                        </button>
                      )}
                      <button
                        onClick={() => onOpenClientDetail(client.id)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-surface-800 dark:hover:bg-surface-700 text-slate-700 dark:text-slate-200 font-semibold text-xs border border-slate-200 dark:border-surface-700"
                      >
                        View
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* WhatsApp Return & Log Confirmation Modal */}
      {pendingReminder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="glass-card max-w-md w-full rounded-2xl p-6 border border-emerald-500/30 shadow-2xl space-y-4 bg-white dark:bg-surface-900 text-center animate-scale-in">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto text-xl">
              <MessageSquare className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Confirm WhatsApp Reminder Sent
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                WhatsApp was opened for <strong>{pendingReminder.clientName}</strong>. If you sent the reminder message, confirm below to record <strong>1 Reminder</strong> in history.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingReminder(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-surface-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-surface-800 transition-colors"
              >
                No, Cancel
              </button>
              <button
                type="button"
                disabled={confirmingReminder}
                onClick={handleConfirmReminderSent}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 active:scale-95 transition-all disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                <span>{confirmingReminder ? 'Recording...' : 'Yes, Record as 1 Reminder'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
