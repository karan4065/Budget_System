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
  History,
  Bell,
  Smartphone,
  Copy,
  Check,
  X
} from 'lucide-react';

export function ClientLists({ 
  initialDuration = null, 
  hideTabs = false,
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
  const [reminderChooserData, setReminderChooserData] = useState(null);
  const [pendingReminder, setPendingReminder] = useState(null);
  const [confirmingReminder, setConfirmingReminder] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

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

  const handleOpenReminderChooser = (e, loanId, clientName, mobileNumber) => {
    e.stopPropagation();
    if (!loanId) return;
    setReminderChooserData({ loanId, clientName, mobileNumber });
  };

  const isDueTomorrow = activeDuration === 'due-tomorrow' || activeDuration === 'due_tomorrow';

  const handleToggleReminder = async (client) => {
    const loanId = client.latestRecordId;
    if (!loanId) return;

    const currentStatus = Boolean(client.reminderSent);
    const newStatus = !currentStatus;

    // Optimistically update UI
    setClients(prev => prev.map(c => 
      c.id === client.id 
        ? { ...c, reminderSent: newStatus, lastReminderSentAt: newStatus ? new Date().toISOString() : null } 
        : c
    ));

    try {
      await api.toggleLoanReminderStatus(loanId, newStatus);
      success(newStatus ? `Reminder marked as sent for ${client.name}` : `Reminder mark removed for ${client.name}`);
    } catch (err) {
      // Revert on error
      setClients(prev => prev.map(c => 
        c.id === client.id ? { ...c, reminderSent: currentStatus } : c
      ));
      error(err.message || 'Failed to update reminder status');
    }
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
        phoneNumber: res.recipient || reminderChooserData?.mobileNumber,
        messageText: res.messageText,
        reminderType: res.reminderType
      });

      success(`${channel === 'sms' ? 'SMS' : 'WhatsApp'} message opened! Click "Record as 1 Reminder" to save in history.`);
    } catch (err) {
      error(err.message || `Failed to prepare ${channel === 'sms' ? 'SMS' : 'WhatsApp'} reminder.`);
    } finally {
      setSendingReminderId(null);
    }
  };

  const handleConfirmReminderSent = async () => {
    if (!pendingReminder) return;
    const confirmedLoanId = pendingReminder.loanId;
    setConfirmingReminder(true);
    try {
      const res = await api.confirmReminderLog(confirmedLoanId, {
        messageText: pendingReminder.messageText,
        reminderType: pendingReminder.reminderType,
        channel: pendingReminder.channel
      });
      success(res.message || `${pendingReminder.channel === 'sms' ? 'SMS' : 'WhatsApp'} reminder confirmed (+1)!`);
      setClients(prev => prev.map(c => 
        (c.latestRecordId === confirmedLoanId || c.id === confirmedLoanId)
          ? { ...c, reminderSent: true, lastReminderSentAt: new Date().toISOString() }
          : c
      ));
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
      {/* Category Tabs Switcher (Weekly / Fortnightly / Monthly / History) */}
      {!hideTabs && activeDuration !== 'due-tomorrow' && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 dark:border-surface-800 scrollbar-none">
          {[
            { id: 'weekly', label: 'Weekly (7 Days)', icon: CalendarDays, color: 'text-blue-600 dark:text-blue-400' },
            { id: 'fortnight', label: 'Fortnightly (14 Days)', icon: CalendarRange, color: 'text-purple-600 dark:text-purple-400' },
            { id: 'monthly', label: 'Monthly (30 Days)', icon: Calendar, color: 'text-emerald-600 dark:text-emerald-400' },
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
      )}

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
            placeholder="Search by Client ID (e.g. 1), name, mobile, or Aadhaar..."
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
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-surface-950/80 border-b border-slate-200 dark:border-surface-800 text-slate-500 dark:text-slate-400 uppercase font-semibold tracking-wider">
                  <tr>
                    {isDueTomorrow && (
                      <th className="px-4 py-3.5 text-center whitespace-nowrap w-16" title="Reminder Sent Status">Status</th>
                    )}
                    <th className="px-5 py-3.5 whitespace-nowrap">Client Details</th>
                    <th className="px-5 py-3.5 whitespace-nowrap">Amount Taken</th>
                    <th className="px-5 py-3.5 whitespace-nowrap">Start Date</th>
                    <th className="px-5 py-3.5 whitespace-nowrap">Due Date</th>
                    <th className="px-5 py-3.5 whitespace-nowrap">Outstanding</th>
                    <th className="px-5 py-3.5 whitespace-nowrap">Status</th>
                    <th className="px-5 py-3.5 text-right whitespace-nowrap">Actions</th>
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
                      {/* Reminder Tickmark Status (Only on Due Tomorrow page) */}
                      {isDueTomorrow && (
                        <td 
                          className="px-4 py-4 text-center whitespace-nowrap"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleReminder(client);
                          }}
                        >
                          {client.reminderSent ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleReminder(client);
                              }}
                              title={`Reminder sent${client.lastReminderSentAt ? ` (${formatDate(client.lastReminderSentAt)})` : ''}. Click to toggle.`}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:scale-110 active:scale-95 transition-all shadow-sm group"
                            >
                              <Check className="w-4 h-4 stroke-[3]" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleReminder(client);
                              }}
                              title="Reminder not sent yet. Click to mark as sent."
                              className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 dark:bg-surface-800/80 border border-slate-200 dark:border-surface-700 text-slate-300 dark:text-slate-600 hover:text-slate-400 hover:border-slate-300 dark:hover:border-surface-600 hover:scale-110 active:scale-95 transition-all group"
                            >
                              <span className="text-sm font-bold leading-none select-none">—</span>
                            </button>
                          )}
                        </td>
                      )}

                      {/* Name & Mobile */}
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
                      <td className="px-5 py-4 font-mono font-bold text-slate-800 dark:text-slate-200 text-sm whitespace-nowrap">
                        {formatCurrency(client.amountTaken)}
                        <span className="block text-[10px] font-normal text-slate-500 dark:text-slate-400 uppercase">
                          {getDurationLabel(client.duration)}
                        </span>
                      </td>

                      {/* Start Date */}
                      <td className="px-5 py-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {formatDate(client.startDate)}
                      </td>

                      {/* Due Date & relative badge */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {formatDate(client.dueDate)}
                        </div>
                        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold ${statusInfo.badgeClass}`}>
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* Outstanding */}
                      <td className="px-5 py-4 font-mono whitespace-nowrap">
                        <div className={`font-bold text-sm ${client.remainingAmount > 0 ? (isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-300') : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {formatCurrency(client.remainingAmount)}
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          Paid: {formatCurrency(client.totalPaid || 0)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4 whitespace-nowrap">
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
                      <td className="px-5 py-4 text-right space-x-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {client.latestRecordId && client.remainingAmount > 0 && (
                          <button
                            onClick={(e) => handleOpenReminderChooser(e, client.latestRecordId, client.name, client.mobileNumber)}
                            disabled={sendingReminderId === client.latestRecordId}
                            title="Send Reminder via WhatsApp or SMS"
                            className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30 transition-all inline-flex items-center gap-1.5 text-xs font-semibold"
                          >
                            <Bell className={`w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 ${sendingReminderId === client.latestRecordId ? 'animate-pulse' : ''}`} />
                            <span className="hidden xl:inline">Reminder</span>
                          </button>
                        )}

                        {client.remainingAmount > 0 && (
                          <button
                            onClick={() => onOpenPayment({
                              id: client.latestRecordId,
                              amountTaken: client.amountTaken,
                              interestAmount: client.interestAmount,
                              totalPayable: client.totalPayable,
                              remainingAmount: client.remainingAmount,
                              totalPaid: client.totalPaid,
                              duration: client.duration,
                              dueDate: client.dueDate,
                              daysOverdue: client.daysOverdue,
                              overdueWeeks: client.overdueWeeks,
                              overdueInterest: client.overdueInterest
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
                    <div className="flex items-center gap-2.5">
                      {isDueTomorrow && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleReminder(client);
                          }}
                          className="flex-shrink-0"
                          title={client.reminderSent ? "Reminder sent. Click to toggle." : "Reminder not sent. Click to mark."}
                        >
                          {client.reminderSent ? (
                            <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                              <Check className="w-4 h-4 stroke-[3]" />
                            </div>
                          ) : (
                            <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 dark:bg-surface-800 border border-slate-200 dark:border-surface-700 text-slate-300 dark:text-slate-600 font-bold text-xs">
                              —
                            </div>
                          )}
                        </button>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base text-slate-900 dark:text-white">{client.name}</h3>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-surface-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-surface-700">
                            #{client.displayId || client.clientNo || client.id}
                          </span>
                        </div>
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
                          onClick={(e) => handleOpenReminderChooser(e, client.latestRecordId, client.name, client.mobileNumber)}
                          disabled={sendingReminderId === client.latestRecordId}
                          title="Send Reminder via WhatsApp or SMS"
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30 font-bold text-xs inline-flex items-center gap-1"
                        >
                          <Bell className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Reminder</span>
                        </button>
                      )}

                      {client.remainingAmount > 0 && (
                        <button
                          onClick={() => onOpenPayment({
                            id: client.latestRecordId,
                            amountTaken: client.amountTaken,
                            interestAmount: client.interestAmount,
                            totalPayable: client.totalPayable,
                            remainingAmount: client.remainingAmount,
                            totalPaid: client.totalPaid,
                            duration: client.duration,
                            dueDate: client.dueDate,
                            daysOverdue: client.daysOverdue,
                            overdueWeeks: client.overdueWeeks,
                            overdueInterest: client.overdueInterest
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

      {/* Reminder Channel Selector Modal (WhatsApp vs SMS) */}
      {reminderChooserData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="glass-card max-w-sm w-full rounded-2xl p-6 border border-slate-200 dark:border-surface-700/80 shadow-2xl space-y-5 bg-white dark:bg-surface-900 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-surface-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Send Reminder</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Choose message delivery method</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReminderChooserData(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Option 1: WhatsApp */}
              <button
                type="button"
                disabled={sendingReminderId !== null}
                onClick={() => handleTriggerReminder(reminderChooserData.loanId, 'whatsapp')}
                className="w-full p-4 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/50 hover:bg-emerald-50 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40 text-left flex items-center gap-3.5 transition-all group active:scale-95"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/30 flex-shrink-0 group-hover:scale-105 transition-transform">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                    WhatsApp Reminder
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Send via WhatsApp chat window
                  </p>
                </div>
              </button>

              {/* Option 2: SMS / Text Message */}
              <button
                type="button"
                disabled={sendingReminderId !== null}
                onClick={() => handleTriggerReminder(reminderChooserData.loanId, 'sms')}
                className="w-full p-4 rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50/50 hover:bg-blue-50 dark:bg-blue-950/20 dark:hover:bg-blue-950/40 text-left flex items-center gap-3.5 transition-all group active:scale-95"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/30 flex-shrink-0 group-hover:scale-105 transition-transform">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    SMS / Text Message
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Send direct SMS for keypad / non-Android phones
                  </p>
                </div>
              </button>
            </div>

            <p className="text-[11px] text-center text-slate-400 dark:text-slate-500">
              Recipient: {reminderChooserData.clientName} (+91 {reminderChooserData.mobileNumber})
            </p>
          </div>
        </div>
      )}

      {/* Reminder Confirmation / Logging Modal */}
      {pendingReminder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="glass-card max-w-md w-full rounded-2xl p-6 border border-slate-200 dark:border-surface-700/80 shadow-2xl space-y-4 bg-white dark:bg-surface-900 text-center animate-scale-in">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto text-xl ${
              pendingReminder.channel === 'sms'
                ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
            }`}>
              {pendingReminder.channel === 'sms' ? <Smartphone className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase mb-2 bg-slate-100 dark:bg-surface-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-surface-700">
                {pendingReminder.channel === 'sms' ? 'SMS Text Message' : 'WhatsApp Reminder'}
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Confirm Reminder Sent
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                Message was prepared for <strong>{pendingReminder.clientName}</strong> (+91 {pendingReminder.phoneNumber}). If sent, confirm below to record in reminder history.
              </p>
            </div>

            {/* Message Preview Box with Copy Button */}
            <div className="bg-slate-50 dark:bg-surface-950 p-3 rounded-xl border border-slate-200 dark:border-surface-800 text-left text-xs space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Message Content:</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(pendingReminder.messageText);
                    setCopiedMessage(true);
                    setTimeout(() => setCopiedMessage(false), 2000);
                  }}
                  className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline font-semibold"
                >
                  {copiedMessage ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedMessage ? 'Copied!' : 'Copy Message'}</span>
                </button>
              </div>
              <p className="text-slate-700 dark:text-slate-300 font-mono text-[11px] leading-relaxed select-all">
                {pendingReminder.messageText}
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingReminder(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-surface-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-surface-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmingReminder}
                onClick={handleConfirmReminderSent}
                className={`flex-1 py-2.5 rounded-xl text-white text-xs font-bold shadow-lg active:scale-95 transition-all disabled:opacity-50 inline-flex items-center justify-center gap-1.5 ${
                  pendingReminder.channel === 'sms'
                    ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30'
                    : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                }`}
              >
                <span>{confirmingReminder ? 'Recording...' : 'Yes, Record as 1 Reminder (+1)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
