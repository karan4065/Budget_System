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
  RefreshCw
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

  const [pendingReminder, setPendingReminder] = useState(null);
  const [confirmingReminder, setConfirmingReminder] = useState(false);

  const handleSendReminder = async (loanId) => {
    if (!loanId) return;
    setSendingReminder(true);
    try {
      const res = await api.prepareManualReminder(loanId);
      if (res.directWhatsAppUrl) {
        window.open(res.directWhatsAppUrl, '_blank', 'noopener,noreferrer');
      }
      setPendingReminder({
        loanId,
        clientName: res.clientName || data?.client?.name || 'Client',
        messageText: res.messageText,
        reminderType: res.reminderType
      });
      success(`WhatsApp chat opened for ${res.clientName || data?.client?.name}. Send the message and confirm below.`);
    } catch (err) {
      error(err.message || 'Failed to prepare WhatsApp reminder.');
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
        reminderType: pendingReminder.reminderType
      });
      success(res.message || 'WhatsApp reminder successfully logged (+1)!');
      setPendingReminder(null);
      triggerRefresh();
      fetchClientDetail();
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

  const { client, activeLoan, loanRecords = [], reminders = [], stats } = data;
  const currentRemaining = activeLoan ? activeLoan.remainingAmount : 0;
  const statusInfo = activeLoan ? getDueStatusInfo(activeLoan.dueDate, currentRemaining) : null;
  const isOverdue = statusInfo?.status === 'overdue';

  // Calculate percentage paid for active loan (based on total payable)
  const payableBase = activeLoan ? (activeLoan.totalPayable || (activeLoan.amountTaken * 1.10)) : 1;
  const percentPaid = activeLoan && payableBase > 0
    ? Math.min(100, Math.round((activeLoan.totalPaid / payableBase) * 100))
    : 0;

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

        <div className="flex items-center gap-2.5">
          {activeLoan && activeLoan.remainingAmount > 0 && (
            <button
              onClick={() => handleSendReminder(activeLoan.id)}
              disabled={sendingReminder}
              title="Send WhatsApp payment reminder to client"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-500/30 transition-all active:scale-95 disabled:opacity-50"
            >
              <MessageSquare className={`w-4 h-4 text-emerald-600 dark:text-emerald-400 ${sendingReminder ? 'animate-pulse' : ''}`} />
              <span>{sendingReminder ? 'Sending...' : 'WhatsApp Reminder'}</span>
            </button>
          )}

          <button
            onClick={() => onOpenNewLoan(client)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-md shadow-purple-600/20 active:scale-95 transition-all"
          >
            <History className="w-4 h-4" />
            <span>+ New Loan</span>
          </button>

          {activeLoan && activeLoan.remainingAmount > 0 && (
            <button
              onClick={() => onOpenPayment(activeLoan, client)}
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
          {/* Avatar & Personal Info */}
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-purple-600 border border-brand-500/30 text-white font-extrabold text-2xl flex items-center justify-center shadow-lg shadow-brand-500/25 flex-shrink-0">
              {client.name.charAt(0)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">{client.name}</h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-surface-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-surface-700 font-mono">
                  Client ID #{client.id}
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

      {/* Active Loan Details Card */}
      {activeLoan ? (
        <div className="glass-card rounded-2xl p-6 border border-slate-200 dark:border-surface-700/60 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-surface-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-500/10 dark:bg-brand-600/20 text-brand-600 dark:text-brand-400 flex items-center justify-center font-bold">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Active Loan Record</h2>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-brand-500/15 text-brand-700 dark:text-brand-300 border border-brand-500/30 uppercase">
                    {getDurationLabel(activeLoan.duration)}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Record ID #{activeLoan.id} • Issued on {formatDate(activeLoan.startDate)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                activeLoan.status === 'completed'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                  : isOverdue
                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30'
                  : 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30'
              }`}>
                {activeLoan.status}
              </span>

              {statusInfo && (
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusInfo.badgeClass}`}>
                  {statusInfo.label}
                </span>
              )}
            </div>
          </div>

          {/* Financial Numbers 4-Box Grid (Principal, 10% Interest, Total Payable, Total Paid) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            {/* Principal */}
            <div className="bg-slate-50 dark:bg-surface-950/70 p-4 rounded-xl border border-slate-200 dark:border-surface-800">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Principal</p>
              <p className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white font-mono mt-1">
                {formatCurrency(activeLoan.amountTaken)}
              </p>
            </div>

            {/* Interest (10%) */}
            <div className="bg-slate-50 dark:bg-surface-950/70 p-4 rounded-xl border border-slate-200 dark:border-surface-800">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Interest (10%)</p>
              <p className="text-xl sm:text-2xl font-extrabold text-amber-600 dark:text-amber-400 font-mono mt-1">
                +{formatCurrency(activeLoan.interestAmount || (activeLoan.amountTaken * 0.10))}
              </p>
            </div>

            {/* Total Payable */}
            <div className="bg-purple-50/70 dark:bg-purple-950/40 p-4 rounded-xl border border-purple-200 dark:border-purple-500/40">
              <p className="text-xs text-purple-700 dark:text-purple-300 uppercase font-semibold">Total Payable</p>
              <p className="text-xl sm:text-2xl font-extrabold text-purple-700 dark:text-purple-300 font-mono mt-1">
                {formatCurrency(activeLoan.totalPayable || (activeLoan.amountTaken * 1.10))}
              </p>
            </div>

            {/* Total Repaid */}
            <div className="bg-slate-50 dark:bg-surface-950/70 p-4 rounded-xl border border-slate-200 dark:border-surface-800">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Total Repaid</p>
              <p className="text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono mt-1">
                {formatCurrency(activeLoan.totalPaid)}
              </p>
            </div>
          </div>

          {/* Repayment Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-500 dark:text-slate-400">Repayment Progress (of Total Payable)</span>
              <span className="text-brand-600 dark:text-brand-300 font-mono">{percentPaid}% Complete</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-surface-950 rounded-full h-3 overflow-hidden border border-slate-200 dark:border-surface-800">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  percentPaid >= 100 
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400' 
                    : 'bg-gradient-to-r from-brand-600 to-indigo-400'
                }`}
                style={{ width: `${percentPaid}%` }}
              />
            </div>
          </div>

          {/* Current Loan Chronological Transaction History Table */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                <span>Transaction Ledger</span>
              </h3>

              {activeLoan.remainingAmount > 0 && (
                <button
                  onClick={() => onOpenPayment(activeLoan, client)}
                  className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>+ Record Payment</span>
                </button>
              )}
            </div>

            <div className="glass-panel rounded-xl overflow-hidden border border-slate-200 dark:border-surface-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-surface-950/90 border-b border-slate-200 dark:border-surface-800 text-slate-500 dark:text-slate-400 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Mode</th>
                    <th className="px-4 py-3">Remaining Balance</th>
                    <th className="px-4 py-3">Note</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-surface-800/60">
                  {activeLoan.transactions && activeLoan.transactions.length > 0 ? (
                    activeLoan.transactions.map((txn, idx) => {
                      const isDisbursement = txn.transactionType === 'disbursement';
                      const isPayment = txn.transactionType === 'payment';

                      return (
                        <tr key={txn.id} className="hover:bg-slate-50 dark:hover:bg-surface-800/30 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                            {formatDate(txn.transactionDate)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              isDisbursement
                                ? 'bg-purple-50 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30'
                                : isPayment
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
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
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400 italic">
                            {txn.note || '-'}
                          </td>
                          <td className="px-4 py-3 text-right space-x-1.5">
                            {isPayment && (
                              <button
                                onClick={() => onOpenReceipt({
                                  transactionId: txn.id,
                                  clientName: client.name,
                                  mobileNumber: client.mobileNumber,
                                  amount: txn.amount,
                                  transactionDate: txn.transactionDate,
                                  transactionType: txn.transactionType,
                                  paymentMode: txn.paymentMode,
                                  remainingAfter: txn.remainingAfter,
                                  loanAmount: activeLoan.amountTaken,
                                  dueDate: activeLoan.dueDate,
                                  note: txn.note
                                })}
                                title="Print Payment Receipt"
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-surface-800 dark:hover:bg-surface-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors inline-block"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {!isDisbursement && (
                              <button
                                onClick={() => handleDeleteTransaction(txn.id, txn.transactionType)}
                                title="Delete / Reverse Transaction"
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 dark:bg-surface-800 dark:hover:bg-rose-500/20 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors inline-block"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="7" className="p-4 text-center text-slate-400 dark:text-slate-500">
                        No transactions recorded for this loan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
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

      {/* WhatsApp Reminders Audit Log Section */}
      <div className="glass-card rounded-2xl p-6 border border-slate-200 dark:border-surface-700/60 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>WhatsApp Reminders History</span>
          </h2>

          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
            {reminders.length} Reminders
          </span>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-surface-800 text-xs">
          {reminders && reminders.length > 0 ? (
            reminders.map((rem) => {
              const isSent = rem.status === 'sent';
              return (
                <div key={rem.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        rem.reminderType === 'due_today'
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                          : rem.reminderType === 'due_tomorrow'
                          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                          : rem.reminderType === 'overdue'
                          ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                          : 'bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300'
                      }`}>
                        {rem.reminderType.replace('_', ' ')}
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {formatDate(rem.sentAt)}
                      </span>
                      <span className="text-slate-400 font-mono">
                        (Loan #{rem.loanId} • Due {formatDate(rem.dueDate)})
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 italic">
                      "{rem.message}"
                    </p>
                    {rem.errorMessage && (
                      <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">
                        Error: {rem.errorMessage}
                      </p>
                    )}
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
              No WhatsApp reminders logged for this client yet.
            </p>
          )}
        </div>
      </div>

      {/* Historical Loan Records Section */}
      <div className="glass-card rounded-2xl p-6 border border-slate-200 dark:border-surface-700/60 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <History className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <span>Loan History</span>
          </h2>

          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30">
            {loanRecords.length} Loans
          </span>
        </div>

        <div className="space-y-3 pt-2">
          {loanRecords.map((loan, idx) => {
            const isExpanded = expandedLoanId === loan.id;
            const isCompleted = loan.status === 'completed';

            return (
              <div 
                key={loan.id}
                className="rounded-xl border border-slate-200 dark:border-surface-800 bg-slate-50 dark:bg-surface-950/70 overflow-hidden transition-all"
              >
                {/* Accordion header */}
                <div 
                  onClick={() => setExpandedLoanId(isExpanded ? null : loan.id)}
                  className="p-4 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-surface-800/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-200 dark:bg-surface-800 text-slate-600 dark:text-slate-400 text-xs font-bold flex items-center justify-center">
                      #{loanRecords.length - idx}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white font-mono">
                          Principal: {formatCurrency(loan.amountTaken)}
                        </span>
                        <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 font-mono">
                          • Total Payable: {formatCurrency(loan.totalPayable || (loan.amountTaken * 1.10))}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {getDurationLabel(loan.duration)} • {formatDate(loan.startDate)} to {formatDate(loan.dueDate)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      isCompleted 
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30' 
                        : 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30'
                    }`}>
                      {loan.status}
                    </span>

                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      Paid: <strong className="text-slate-800 dark:text-slate-200">{formatCurrency(loan.totalPaid)}</strong>
                    </span>

                    {/* Delete loan button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteLoan(loan.id);
                      }}
                      title="Delete this loan"
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/20 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>

                {/* Expanded Transactions for this specific loan */}
                {isExpanded && (
                  <div className="p-4 border-t border-slate-200 dark:border-surface-800/80 bg-white/60 dark:bg-surface-950/40 space-y-2">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Transactions for Loan #{loan.id}
                    </p>
                    <div className="divide-y divide-slate-200 dark:divide-surface-800 text-xs">
                      {loan.transactions && loan.transactions.length > 0 ? (
                        loan.transactions.map(t => (
                          <div key={t.id} className="py-2 flex items-center justify-between text-slate-700 dark:text-slate-300">
                            <div>
                              <span className="font-semibold text-slate-900 dark:text-slate-200">{formatDate(t.transactionDate)}</span>
                              <span className="text-slate-500 ml-2">({t.transactionType} via {t.paymentMode})</span>
                              {t.note && <span className="text-slate-500 dark:text-slate-400 italic ml-2">- {t.note}</span>}
                            </div>
                            <div className="text-right font-mono flex items-center gap-2">
                              <span className={t.transactionType === 'payment' ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-800 dark:text-slate-300'}>
                                {formatCurrency(t.amount)}
                              </span>
                              <span className="text-slate-400 text-[10px]">(Bal: {formatCurrency(t.remainingAfter)})</span>
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
                        <p className="text-slate-400 dark:text-slate-500 py-2">No transaction records.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

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
                WhatsApp was opened for <strong>{pendingReminder.clientName}</strong>. If you clicked send in WhatsApp, confirm below to record <strong>1 Reminder</strong> in history.
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
