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
import { generateClientTransactionsCSV } from '../utils/csvExport';
import { 
  ArrowLeft, 
  User, 
  Phone, 
  Shield, 
  MapPin, 
  CreditCard, 
  PlusCircle, 
  History, 
  Calendar, 
  Clock, 
  Printer, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  Edit3, 
  Trash2, 
  ChevronDown, 
  ChevronUp,
  RotateCcw,
  Sparkles,
  MessageSquare,
  Send,
  RefreshCw,
  Bell,
  Smartphone,
  Copy,
  Check,
  Download,
  FileSpreadsheet,
  X
} from 'lucide-react';

export function ClientDetail({ 
  clientId, 
  onBack, 
  onOpenPayment, 
  onOpenNewLoan, 
  onOpenReceipt 
}) {
  const { success, error } = useNotify();
  const { refreshSignal, triggerRefresh } = useSync();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedLoanId, setExpandedLoanId] = useState(null);
  const [showRawAadhaar, setShowRawAadhaar] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderChooserLoanId, setReminderChooserLoanId] = useState(null);
  const [pendingReminder, setPendingReminder] = useState(null);
  const [confirmingReminder, setConfirmingReminder] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [exportingCSV, setExportingCSV] = useState(false);

  const fetchClientData = async () => {
    try {
      setLoading(true);
      const res = await api.getClient(clientId);
      setData(res);
      if (res.activeLoan) {
        setExpandedLoanId(res.activeLoan.id);
      }
    } catch (err) {
      error(err.message || 'Failed to load client details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clientId) {
      fetchClientData();
    }
  }, [clientId, refreshSignal]);

  const handleExportCSV = async () => {
    try {
      setExportingCSV(true);
      if (data && data.client) {
        generateClientTransactionsCSV(data.client, data.loanRecords || []);
        success(`Transaction history CSV downloaded for ${data.client.name}.`);
      } else {
        await api.downloadClientCSV(clientId);
        success('Transaction history CSV downloaded.');
      }
    } catch (err) {
      error(err.message || 'Failed to export transaction history.');
    } finally {
      setExportingCSV(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!window.confirm(`Are you sure you want to permanently delete client "${data?.client?.name}" and all historical records? This action cannot be undone.`)) {
      return;
    }

    try {
      await api.deleteClient(clientId);
      success('Client deleted successfully.');
      triggerRefresh();
      onBack();
    } catch (err) {
      error(err.message || 'Failed to delete client.');
    }
  };

  const handleDeleteLoan = async (loanId) => {
    if (!window.confirm(`Are you sure you want to delete loan record #${loanId} and its associated transactions?`)) {
      return;
    }

    try {
      await api.deleteLoan(loanId);
      success('Loan record deleted successfully.');
      triggerRefresh();
    } catch (err) {
      error(err.message || 'Failed to delete loan record.');
    }
  };

  const handleDeleteTransaction = async (txnId, txnType) => {
    if (txnType === 'disbursement') {
      error('Initial loan disbursement cannot be deleted directly. Delete or edit the loan instead.');
      return;
    }

    if (!window.confirm('Are you sure you want to delete/reverse this payment transaction? The loan balance will be automatically recalculated.')) {
      return;
    }

    try {
      await api.deleteTransaction(txnId);
      success('Transaction deleted and loan balance restored.');
      triggerRefresh();
    } catch (err) {
      error(err.message || 'Failed to delete transaction.');
    }
  };

  const handleTriggerReminder = async (loanId, channel = 'whatsapp') => {
    if (!loanId) return;
    setSendingReminder(true);
    try {
      let customMessage = undefined;
      if (activeLoansList.length > 1) {
        const clientName = data?.client?.name || 'Valued Client';
        const loanLines = activeLoansList.map((l, i) => {
          const lAmt = formatCurrency(Number(l.remainingAmount || l.totalPayable || (Number(l.amountTaken) * 1.10)));
          const lDue = formatDate(l.dueDate);
          const isOverdue = l.dueDate && new Date().toISOString().split('T')[0] > l.dueDate;
          const seq = loanRecords.length - loanRecords.findIndex(lr => lr.id === l.id);
          const ordinalTag = seq > 0 ? ` (${getLoanOrdinalLabel(seq)})` : '';
          const overdueTag = isOverdue ? ' (Overdue)' : '';
          return `${i + 1}) ${lAmt} - Due: ${lDue}${ordinalTag}${overdueTag}`;
        }).join('\n');

        const totalRemAmt = formatCurrency(totalRemaining);
        const hasAnyOverdue = activeLoansList.some(l => l.dueDate && new Date().toISOString().split('T')[0] > l.dueDate);

        customMessage = `Hello ${clientName}, you have ${activeLoansList.length} active loans with outstanding payments:\n\n${loanLines}\n\nTotal Outstanding: ${totalRemAmt}.\nPlease make your payments ${hasAnyOverdue ? 'as soon as possible' : 'on time'}. Thank you.`;
      }

      const res = await api.prepareManualReminder(loanId, { customMessage });

      // Open delivery channel
      if (channel === 'whatsapp' && res.directWhatsAppUrl) {
        window.open(res.directWhatsAppUrl, '_blank', 'noopener,noreferrer');
      } else if (channel === 'sms') {
        const recipient = res.phoneNumber || res.recipient || data?.client?.mobileNumber || '';
        const cleanDigits = String(recipient).replace(/\D/g, '');
        const phoneFormatted = cleanDigits.length === 10 ? `+91${cleanDigits}` : (cleanDigits ? `+${cleanDigits}` : '');
        const smsUrl = `sms:${phoneFormatted}?body=${encodeURIComponent(res.messageText || customMessage)}`;
        
        const link = document.createElement('a');
        link.href = smsUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      setReminderChooserLoanId(null);
      
      // Open confirmation modal so user can record exactly 1 log
      setPendingReminder({
        loanId,
        channel,
        clientName: res.clientName || data?.client?.name || 'Client',
        phoneNumber: res.recipient || data?.client?.mobileNumber,
        messageText: res.messageText || customMessage,
        reminderType: res.reminderType
      });

      success(`${channel === 'sms' ? 'SMS' : 'WhatsApp'} message opened! Click "Record as 1 Reminder" to save in history.`);
    } catch (err) {
      error(err.message || `Failed to prepare ${channel === 'sms' ? 'SMS' : 'WhatsApp'} reminder.`);
    } finally {
      setSendingReminder(false);
    }
  };

  const handleConfirmReminderSent = async () => {
    if (!pendingReminder) return;
    setConfirmingReminder(true);
    try {
      const res = await api.confirmReminderLog(pendingReminder.loanId, {
        messageText: pendingReminder.messageText,
        reminderType: pendingReminder.reminderType,
        channel: pendingReminder.channel
      });
      success(res.message || `${pendingReminder.channel === 'sms' ? 'SMS' : 'WhatsApp'} reminder recorded (+1)!`);
      setPendingReminder(null);
      triggerRefresh();
      fetchClientData();
    } catch (err) {
      error(err.message || 'Failed to record reminder log.');
    } finally {
      setConfirmingReminder(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="p-12 text-center">
        <div className="w-8 h-8 border-3 border-brand-500/20 border-t-brand-500 rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs text-slate-500 dark:text-slate-400">Loading client profile...</p>
      </div>
    );
  }

  if (!data || !data.client) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center space-y-4 border border-slate-200 dark:border-surface-700">
        <p className="text-slate-600 dark:text-slate-300">Client profile could not be found.</p>
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-surface-800 dark:hover:bg-surface-700 text-slate-800 dark:text-white text-xs font-semibold"
        >
          Back to List
        </button>
      </div>
    );
  }

  // Helper to extract pending amount from loan record or its settlement transaction note
  const getPendingAmountFromLoan = (l) => {
    if (!l) return 0;
    if (Number(l.pendingAmount) > 0) return Number(l.pendingAmount);
    if (l.note && l.note.toLowerCase().includes('marked as pending')) {
      const match = l.note.match(/Remaining\s*₹?\s*(\d+(?:\.\d+)?)\s*marked as pending/i);
      if (match && match[1]) return parseFloat(match[1]);
    }
    if (l.transactions && Array.isArray(l.transactions)) {
      for (const t of l.transactions) {
        if (t.note && t.note.toLowerCase().includes('marked as pending')) {
          const match = t.note.match(/Remaining\s*₹?\s*(\d+(?:\.\d+)?)\s*marked as pending/i);
          if (match && match[1]) return parseFloat(match[1]);
          if (t.transactionType === 'adjustment') return Number(t.amount) || 0;
        }
      }
    }
    const pPayable = Number(l.totalPayable ?? (Number(l.amountTaken || 0) * 1.10));
    const pPaid = Number(l.totalPaid || 0);
    if ((l.status === 'completed' || l.isSettledPending) && pPayable > pPaid) {
      return Math.max(0, pPayable - pPaid);
    }
    return 0;
  };

  const { client, activeLoan, activeLoans = [], loanRecords = [], reminders = [], stats } = data;
  const activeLoansList = (activeLoans && activeLoans.length > 0)
    ? activeLoans.filter(l => l.status !== 'completed' && !l.isSettledPending && getPendingAmountFromLoan(l) <= 0 && Number(l.remainingAmount) > 0)
    : (activeLoan && activeLoan.remainingAmount > 0 && activeLoan.status !== 'completed' && !activeLoan.isSettledPending && getPendingAmountFromLoan(activeLoan) <= 0
        ? [activeLoan] 
        : loanRecords.filter(l => (l.status === 'active' || l.status === 'overdue') && !l.isSettledPending && getPendingAmountFromLoan(l) <= 0 && Number(l.remainingAmount) > 0));
  const primaryActiveLoan = activeLoansList[0] || null;

  // Aggregate stats across all active loans
  const totalPrincipal = activeLoansList.reduce((s, l) => s + Number(l.amountTaken || 0), 0);
  const totalInterest = activeLoansList.reduce((s, l) => s + Number(l.interestAmount || (l.amountTaken * 0.10)), 0);
  const totalPayable = activeLoansList.reduce((s, l) => s + Number(l.totalPayable || (l.amountTaken * 1.10)), 0);
  const totalRepaid = activeLoansList.reduce((s, l) => s + Number(l.totalPaid || 0), 0);
  const totalRemaining = activeLoansList.reduce((s, l) => s + Number(l.remainingAmount || 0), 0);
  // Total pending money specifically marked on loan completions
  const totalPendingMarked = (loanRecords || []).reduce((s, l) => s + getPendingAmountFromLoan(l), 0);
  const overallPct = totalPayable > 0 ? Math.min(100, Math.round((totalRepaid / totalPayable) * 100)) : 0;

  // Combined loan object representing all active loans for recording payments
  const combinedActiveLoan = activeLoansList.length > 1 ? {
    id: primaryActiveLoan?.id,
    isCombined: true,
    activeLoans: activeLoansList,
    amountTaken: totalPrincipal,
    interestRate: 10,
    interestAmount: totalInterest,
    totalPayable: totalPayable,
    totalPaid: totalRepaid,
    remainingAmount: totalRemaining,
    duration: primaryActiveLoan?.duration || 'weekly',
    dueDate: primaryActiveLoan?.dueDate,
    status: 'active'
  } : primaryActiveLoan;

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Top Bar with Back Button & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-surface-900/80 hover:bg-slate-100 dark:hover:bg-surface-800 border border-slate-200 dark:border-surface-700/80 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-sm font-semibold transition-all shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Single-Click Transactions CSV Export Button */}
          <button
            onClick={handleExportCSV}
            disabled={exportingCSV}
            title="Download complete transaction ledger as CSV"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-surface-900 hover:bg-slate-100 dark:hover:bg-surface-800 border border-slate-300 dark:border-surface-700 shadow-sm active:scale-95 transition-all disabled:opacity-50"
          >
            <FileSpreadsheet className={`w-4 h-4 text-emerald-600 dark:text-emerald-400 ${exportingCSV ? 'animate-spin' : ''}`} />
            <span>{exportingCSV ? 'Exporting...' : 'Export CSV'}</span>
          </button>

          {combinedActiveLoan && combinedActiveLoan.remainingAmount > 0 && (
            <button
              onClick={() => setReminderChooserLoanId(combinedActiveLoan.id)}
              disabled={sendingReminder}
              title="Send Reminder to client via WhatsApp or SMS"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-500/30 transition-all active:scale-95 disabled:opacity-50"
            >
              <Bell className={`w-4 h-4 text-emerald-600 dark:text-emerald-400 ${sendingReminder ? 'animate-pulse' : ''}`} />
              <span>{sendingReminder ? 'Opening...' : 'Reminder'}</span>
            </button>
          )}

          <button
            onClick={() => onOpenNewLoan(client)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-md shadow-purple-600/20 active:scale-95 transition-all"
          >
            <History className="w-4 h-4" />
            <span>+ New Loan</span>
          </button>

          {combinedActiveLoan && combinedActiveLoan.remainingAmount > 0 && (
            <button
              onClick={() => onOpenPayment(combinedActiveLoan, client)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-md shadow-emerald-600/20 active:scale-95 transition-all"
            >
              <CreditCard className="w-4 h-4" />
              <span>+ Add Payment</span>
            </button>
          )}

          <button
            onClick={handleDeleteClient}
            title="Delete Client Record"
            className="p-2 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-slate-200 dark:border-surface-800 hover:border-rose-200 dark:hover:border-rose-500/20 transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Client Overview Header Card */}
      <div className="glass-card rounded-2xl p-6 border border-slate-200 dark:border-surface-700/60 shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          {/* Personal Info */}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">{client.name}</h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-surface-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-surface-700 font-mono">
                Client ID #{client.displayId || client.clientNo || client.id}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-xs text-slate-500 dark:text-slate-400">
              <a 
                href={`tel:${client.mobileNumber}`} 
                className="flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline font-mono font-semibold"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>+91 {client.mobileNumber}</span>
              </a>

              <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>WhatsApp Enabled</span>
              </div>

              {client.aadhaarNumber && (
                <div className="flex items-center gap-1 font-mono">
                  <Shield className="w-3.5 h-3.5 text-slate-400" />
                  <span>Aadhaar: </span>
                  <span className="text-slate-800 dark:text-slate-200">
                    {showRawAadhaar ? client.aadhaarNumber : client.maskedAadhaar}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowRawAadhaar(!showRawAadhaar)}
                    className="text-[10px] text-brand-600 dark:text-brand-400 hover:underline ml-1 font-sans font-semibold"
                  >
                    {showRawAadhaar ? 'Mask' : 'Reveal'}
                  </button>
                </div>
              )}

              {client.address && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>{client.address}</span>
                </div>
              )}
            </div>

            {client.notes && (
              <p className="text-xs text-slate-600 dark:text-slate-400 italic mt-2 bg-slate-100 dark:bg-surface-950/60 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-surface-800 inline-block">
                Note: {client.notes}
              </p>
            )}
          </div>

          {/* Lifetime Relationship Metrics */}
          <div className="grid grid-cols-3 gap-3 w-full lg:w-auto bg-slate-50 dark:bg-surface-950/60 p-4 rounded-xl border border-slate-200 dark:border-surface-800 text-center">
            <div className="px-2">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Total Loans</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white font-mono mt-0.5">{stats?.totalLoans || loanRecords?.length || 0}</p>
            </div>
            <div className="px-2 border-x border-slate-200 dark:border-surface-800">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Total Payable</p>
              <p className="text-sm sm:text-base font-bold text-purple-600 dark:text-purple-300 font-mono mt-0.5">
                {formatCurrency(
                  stats?.lifetimeTotalPayable || 
                  (loanRecords && loanRecords.length > 0 ? loanRecords.reduce((sum, l) => sum + Number(l.totalPayable || (l.amountTaken * 1.10)), 0) : (Number(stats?.lifetimeGiven || 0) * 1.10))
                )}
              </p>
            </div>
            <div className="px-2">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Lifetime Repaid</p>
              <p className="text-sm sm:text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{formatCurrency(stats?.lifetimePaid || 0)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Active Loans Section — Clean Consolidated Summary */}
      {activeLoansList.length > 0 ? (
        <div className="space-y-6">
          <div className="glass-card rounded-2xl p-6 border-2 border-brand-500/30 dark:border-brand-400/30 shadow-xl shadow-brand-500/5 space-y-5 bg-gradient-to-br from-brand-50/40 to-indigo-50/40 dark:from-brand-950/20 dark:to-indigo-950/20">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-brand-200/60 dark:border-brand-500/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-500/15 dark:bg-brand-600/25 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      {activeLoansList.length > 1 ? 'All Active Loans — Combined Summary' : 'All Active Loans'}
                    </h2>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-brand-500/15 text-brand-700 dark:text-brand-300 border border-brand-500/30 uppercase">
                      {activeLoansList.length} {activeLoansList.length === 1 ? 'Active Loan' : 'Active Loans'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {activeLoansList.length > 1
                      ? `Aggregate across all ${activeLoansList.length} outstanding active loans`
                      : `${getLoanOrdinalLabel(loanRecords.length - (primaryActiveLoan ? loanRecords.findIndex(l => l.id === primaryActiveLoan.id) : 0))} (Active) • Issued on ${formatDate(primaryActiveLoan?.startDate)} • Due ${formatDate(primaryActiveLoan?.dueDate)}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-rose-50 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">
                  Outstanding: {formatCurrency(totalRemaining)}
                </span>
                {combinedActiveLoan && combinedActiveLoan.remainingAmount > 0 && (
                  <button
                    onClick={() => onOpenPayment(combinedActiveLoan, client)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-sm active:scale-95 transition-all"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>+ Add Payment</span>
                  </button>
                )}
              </div>
            </div>

            {/* 5 aggregated boxes including Pending Amount */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
              <div className="bg-white/80 dark:bg-surface-900/80 p-4 rounded-xl border border-slate-200 dark:border-surface-800">
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Total Principal</p>
                <p className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white font-mono mt-1">
                  {formatCurrency(totalPrincipal)}
                </p>
              </div>

              <div className="bg-white/80 dark:bg-surface-900/80 p-4 rounded-xl border border-slate-200 dark:border-surface-800">
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Interest (10%)</p>
                <p className="text-xl sm:text-2xl font-extrabold text-amber-600 dark:text-amber-400 font-mono mt-1">
                  +{formatCurrency(totalInterest)}
                </p>
              </div>

              <div className="bg-purple-50/80 dark:bg-purple-950/40 p-4 rounded-xl border border-purple-200 dark:border-purple-500/40">
                <p className="text-xs text-purple-700 dark:text-purple-300 uppercase font-semibold">Total Payable</p>
                <p className="text-xl sm:text-2xl font-extrabold text-purple-700 dark:text-purple-300 font-mono mt-1">
                  {formatCurrency(totalPayable)}
                </p>
              </div>

              <div className="bg-white/80 dark:bg-surface-900/80 p-4 rounded-xl border border-slate-200 dark:border-surface-800">
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Total Repaid</p>
                <p className="text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono mt-1">
                  {formatCurrency(totalRepaid)}
                </p>
              </div>

              <div className="bg-rose-50/80 dark:bg-rose-950/40 p-4 rounded-xl border border-rose-200 dark:border-rose-500/40">
                <p className="text-xs text-rose-700 dark:text-rose-300 uppercase font-semibold">Pending Amount</p>
                <p className="text-xl sm:text-2xl font-extrabold text-rose-600 dark:text-rose-400 font-mono mt-1">
                  {formatCurrency(totalPendingMarked)}
                </p>
              </div>
            </div>

            {/* Loan Sequence Badge Indicator */}
            {activeLoansList.length === 1 && primaryActiveLoan && (
              <div className="flex items-center gap-2 pt-0.5 text-xs text-slate-600 dark:text-slate-300 font-medium">
                <span className="text-slate-400 dark:text-slate-500">Loan ID:</span>
                <span className="px-2.5 py-0.5 rounded-md bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30 font-bold font-mono">
                  {getLoanOrdinalLabel(loanRecords.length - loanRecords.findIndex(l => l.id === primaryActiveLoan.id))}
                </span>
                <span className="text-slate-400">•</span>
                <span className="text-slate-500 dark:text-slate-400">Issued: {formatDate(primaryActiveLoan?.startDate)}</span>
                <span className="text-slate-400">•</span>
                <span className="text-slate-500 dark:text-slate-400">Due: {formatDate(primaryActiveLoan?.dueDate)}</span>
              </div>
            )}

            {/* Combined progress bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-500 dark:text-slate-400">Repayment Progress (of Total Payable)</span>
                <span className="text-brand-600 dark:text-brand-300 font-mono">{overallPct}% Complete</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-surface-950 rounded-full h-3 overflow-hidden border border-slate-200 dark:border-surface-800">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    overallPct >= 100
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      : 'bg-gradient-to-r from-brand-600 to-indigo-400'
                  }`}
                  style={{ width: `${overallPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-8 text-center space-y-3 border border-slate-200 dark:border-surface-700">
          <p className="text-slate-500 dark:text-slate-400">No active loans currently.</p>
          <button
            onClick={() => onOpenNewLoan(client)}
            className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs"
          >
            + Issue New Loan
          </button>
        </div>
      )}

      {/* Reminders Audit Log Section (WhatsApp & SMS History) */}
      <div className="glass-card rounded-2xl p-6 border border-slate-200 dark:border-surface-700/60 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-brand-600 dark:text-brand-400" />
            <span>Reminders History</span>
          </h2>

          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300 border border-brand-200 dark:border-brand-500/30">
            {reminders.length} Reminders
          </span>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-surface-800 text-xs">
          {reminders && reminders.length > 0 ? (
            reminders.map((rem) => {
              const isSent = rem.status === 'sent';
              const isSms = rem.channel === 'sms' || 
                            rem.reminderType?.toLowerCase().includes('sms') || 
                            rem.whatsappMessageId?.toLowerCase().includes('sms');
              const cleanType = (rem.reminderType || 'manual').replace(/^sms_/, '').replace(/_/g, ' ');

              return (
                <div key={rem.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      isSms
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30'
                        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                    }`}>
                      {isSms ? (
                        <>
                          <Smartphone className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                          <span>SMS</span>
                        </>
                      ) : (
                        <>
                          <MessageSquare className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          <span>WhatsApp</span>
                        </>
                      )}
                    </span>

                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700 dark:bg-surface-800 dark:text-slate-300 border border-slate-200 dark:border-surface-700">
                      {cleanType}
                    </span>

                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {formatDate(rem.sentAt)}
                    </span>

                    <span className="text-slate-400 font-medium">
                      ({loanRecords.findIndex(l => l.id === rem.loanId) !== -1 ? getLoanOrdinalLabel(loanRecords.length - loanRecords.findIndex(l => l.id === rem.loanId)) : 'Loan'} • Due {formatDate(rem.dueDate)})
                    </span>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center flex-shrink-0">
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      ₹{Number(rem.amount).toLocaleString('en-IN')}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      isSent
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                        : 'bg-rose-50 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30'
                    }`}>
                      {rem.status}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-slate-400 dark:text-slate-500 py-4 text-center">
              No reminders logged for this client yet.
            </p>
          )}
        </div>
      </div>

      {/* Historical & Active Loan Records Section (Loan History) */}
      <div className="glass-card rounded-2xl p-6 border border-slate-200 dark:border-surface-700/60 shadow-xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <History className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <span>Loan History</span>
          </h2>

          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30">
            {loanRecords.length} Loans
          </span>
        </div>

        <div className="space-y-4 pt-2">
          {loanRecords.map((loan, idx) => {
            const isExpanded = expandedLoanId === loan.id;
            const pendingAmt = getPendingAmountFromLoan(loan);
            const isCompleted = loan.status === 'completed' || Boolean(loan.isSettledPending) || pendingAmt > 0 || Number(loan.remainingAmount) <= 0;
            const payableBase = loan.totalPayable || (loan.amountTaken * 1.10) || 1;
            const percentPaid = isCompleted ? 100 : (payableBase > 0 ? Math.min(100, Math.round((loan.totalPaid / payableBase) * 100)) : 0);

            return (
              <div 
                key={loan.id}
                className="rounded-2xl border border-slate-200 dark:border-surface-800 bg-slate-50 dark:bg-surface-950/70 overflow-hidden transition-all shadow-sm"
              >
                {/* Header */}
                <div 
                  onClick={() => setExpandedLoanId(isExpanded ? null : loan.id)}
                  className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-surface-800/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-xs font-bold flex items-center justify-center border border-purple-200 dark:border-purple-500/30 flex-shrink-0">
                      #{loanRecords.length - idx}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                          {formatDate(loan.startDate)} to {formatDate(loan.dueDate)}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30 uppercase">
                          {getLoanOrdinalLabel(loanRecords.length - idx)}
                        </span>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-surface-800 dark:text-slate-300 border border-slate-200 dark:border-surface-700 uppercase">
                          {getDurationLabel(loan.duration)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 font-medium">
                        {getLoanOrdinalLabel(loanRecords.length - idx)} • Issued on {formatDate(loan.startDate)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      isCompleted 
                        ? (pendingAmt > 0
                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 font-semibold'
                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30')
                        : (loan.status === 'overdue'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 animate-pulse'
                            : 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30')
                    }`}>
                      {isCompleted 
                        ? (pendingAmt > 0 ? `Completed (${formatCurrency(pendingAmt)} Pending)` : 'Completed') 
                        : (loan.status === 'overdue' && loan.daysOverdue ? `${loan.daysOverdue}d Overdue` : loan.status)}
                    </span>

                    {/* Delete loan button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteLoan(loan.id);
                      }}
                      title="Delete this loan"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/20 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>

                {/* Overdue Accrual Explainer Banner if Overdue */}
                {loan.status === 'overdue' && loan.remainingAmount > 0 && (
                  <div className="mx-4 sm:mx-5 mb-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Overdue Weekly Accrual Active (Week {loan.overdueWeeks || Math.ceil((loan.daysOverdue || 1) / 7)}):</span>{' '}
                      Base 10% interest ({formatCurrency(loan.baseInterest || (loan.amountTaken * 0.10))}) + Accrued Overdue Interest ({formatCurrency(loan.overdueInterest || 0)}) = Total Interest {formatCurrency(loan.interestAmount || 0)}.
                    </div>
                  </div>
                )}

                {/* 5 Financial Stat Boxes for Loan Record */}
                <div className="px-4 sm:px-5 pb-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                    {/* Principal */}
                    <div className="bg-white dark:bg-surface-900 p-3 rounded-xl border border-slate-200 dark:border-surface-800">
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Principal</p>
                      <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-mono mt-0.5">
                        {formatCurrency(loan.amountTaken)}
                      </p>
                    </div>

                    {/* Interest (10%) */}
                    <div className="bg-white dark:bg-surface-900 p-3 rounded-xl border border-slate-200 dark:border-surface-800">
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Interest (10%)</p>
                      <p className="text-base sm:text-lg font-bold text-amber-600 dark:text-amber-400 font-mono mt-0.5">
                        +{formatCurrency(loan.interestAmount || (loan.amountTaken * 0.10))}
                      </p>
                    </div>

                    {/* Total Payable */}
                    <div className="bg-purple-50/60 dark:bg-purple-950/30 p-3 rounded-xl border border-purple-200 dark:border-purple-500/30">
                      <p className="text-[10px] text-purple-700 dark:text-purple-300 uppercase font-semibold">Total Payable</p>
                      <p className="text-base sm:text-lg font-bold text-purple-700 dark:text-purple-300 font-mono mt-0.5">
                        {formatCurrency(loan.totalPayable || (loan.amountTaken * 1.10))}
                      </p>
                    </div>

                    {/* Total Repaid */}
                    <div className="bg-white dark:bg-surface-900 p-3 rounded-xl border border-slate-200 dark:border-surface-800">
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Total Repaid</p>
                      <p className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                        {formatCurrency(loan.totalPaid)}
                      </p>
                    </div>

                    {/* Pending Amount */}
                    <div className="bg-rose-50/60 dark:bg-rose-950/30 p-3 rounded-xl border border-rose-200 dark:border-rose-500/30">
                      <p className="text-[10px] text-rose-700 dark:text-rose-300 uppercase font-semibold">Pending Amount</p>
                      <p className="text-base sm:text-lg font-bold text-rose-600 dark:text-rose-400 font-mono mt-0.5">
                        {formatCurrency(pendingAmt)}
                      </p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      <span>Repayment Progress</span>
                      <span className="font-mono">{percentPaid}% Complete</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-surface-900 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${
                          isCompleted || percentPaid >= 100 ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-brand-600'
                        }`}
                        style={{ width: `${percentPaid}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Expanded Clean Transactions Ledger */}
                {isExpanded && (
                  <div className="p-4 border-t border-slate-200 dark:border-surface-800/80 bg-white/70 dark:bg-surface-950/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                        <span>Transaction Ledger</span>
                      </h4>

                      {loan.remainingAmount > 0 && (
                        <button
                          type="button"
                          onClick={() => onOpenPayment(loan, client)}
                          className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>+ Record Payment</span>
                        </button>
                      )}
                    </div>

                    <div className="divide-y divide-slate-200 dark:divide-surface-800 text-xs">
                      {loan.transactions && loan.transactions.length > 0 ? (
                        loan.transactions.map(t => (
                          <div key={t.id} className="py-2.5 flex items-center justify-between text-slate-700 dark:text-slate-300">
                            <div>
                              <span className="font-semibold text-slate-900 dark:text-slate-200">{formatDate(t.transactionDate)}</span>
                              <span className="text-slate-500 ml-2">({t.transactionType} via {t.paymentMode || 'Cash'})</span>
                              {t.note && <span className="text-slate-500 dark:text-slate-400 italic ml-2">- {t.note}</span>}
                            </div>
                            <div className="text-right font-mono flex items-center gap-2">
                              <span className={t.transactionType === 'payment' ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-800 dark:text-slate-300'}>
                                {t.transactionType === 'payment' ? '+' : ''}{formatCurrency(t.amount)}
                              </span>
                              <span className="text-slate-400 text-[10px]">(Bal: {formatCurrency(t.remainingAfter)})</span>
                              
                              {t.transactionType === 'payment' && (
                                <button
                                  type="button"
                                  onClick={() => onOpenReceipt({
                                    transactionId: t.id,
                                    clientName: client.name,
                                    mobileNumber: client.mobileNumber,
                                    amount: t.amount,
                                    transactionDate: t.transactionDate,
                                    transactionType: t.transactionType,
                                    paymentMode: t.paymentMode,
                                    remainingAfter: t.remainingAfter,
                                    loanAmount: loan.amountTaken,
                                    dueDate: loan.dueDate,
                                    note: t.note
                                  })}
                                  title="Print Payment Receipt"
                                  className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
                                >
                                  <Printer className="w-3 h-3" />
                                </button>
                              )}

                              {t.transactionType !== 'disbursement' && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTransaction(t.id, t.transactionType)}
                                  title="Delete transaction"
                                  className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-slate-400 dark:text-slate-500 py-2">No transaction records for this loan.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Reminder Channel Selector Modal (WhatsApp vs SMS) */}
      {reminderChooserLoanId && (
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
                onClick={() => setReminderChooserLoanId(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Option 1: WhatsApp */}
              <button
                type="button"
                disabled={sendingReminder}
                onClick={() => handleTriggerReminder(reminderChooserLoanId, 'whatsapp')}
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
                disabled={sendingReminder}
                onClick={() => handleTriggerReminder(reminderChooserLoanId, 'sms')}
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
              Registered Phone: +91 {client.mobileNumber}
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
