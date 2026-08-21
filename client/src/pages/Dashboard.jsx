import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useNotify } from '../context/NotificationContext';
import { useSync } from '../context/SyncContext';
import { formatCurrency, formatDate, getDueStatusInfo } from '../utils/formatters';
import { 
  TrendingUp, 
  Clock, 
  ArrowUpRight, 
  ArrowDownLeft, 
  CalendarDays, 
  CalendarRange, 
  Calendar,
  PlusCircle, 
  Search, 
  CheckCircle2, 
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  Wallet,
  Sparkles,
  MessageSquare,
  AlertCircle,
  Percent,
  RefreshCw
} from 'lucide-react';

export function Dashboard({ onNavigate, onOpenAddClient, onOpenClientDetail, onOpenPayment }) {
  const { success, error } = useNotify();
  const { refreshSignal } = useSync();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const data = await api.getDashboardStats();
      setStats(data);
    } catch (err) {
      error(err.message || 'Failed to load dashboard statistics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [refreshSignal]);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-brand-500/20 border-t-brand-500 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      {/* Header & Quick Action Buttons */}
      <div className="glass-card rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-surface-700/60 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Dashboard
          </h1>
          
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <button
            onClick={onOpenAddClient}
            className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-lg shadow-brand-600/30 active:scale-95 transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span> Add Client</span>
          </button>
        </div>
      </div>

      {/* Main Financial Metric Cards (5 Core Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
        {/* 1. Total Principal Given */}
        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-surface-700/60 shadow-lg relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Principal</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
              {formatCurrency(Number(stats?.totalPrincipal || stats?.totalAmountGiven || 0))}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Clients: <strong className="text-slate-700 dark:text-slate-200">{stats?.totalClients || 0}</strong>
            </p>
          </div>
        </div>

        {/* 2. Total Interest (10%) */}
        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-surface-700/60 shadow-lg relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Interest (10%)</span>
            <div className="w-8 h-8 rounded-lg bg-amber-600/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <h2 className="text-xl sm:text-2xl font-extrabold text-amber-600 dark:text-amber-400 font-mono tracking-tight">
              +{formatCurrency(
                Number(stats?.totalInterest > 0 ? stats.totalInterest : (Number(stats?.totalPrincipal || stats?.totalAmountGiven || 0) * 0.10))
              )}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Earned on Loans
            </p>
          </div>
        </div>

        {/* 3. Total Payable Amount */}
        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-surface-700/60 shadow-lg relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Payable</span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <h2 className="text-xl sm:text-2xl font-extrabold text-purple-600 dark:text-purple-300 font-mono tracking-tight">
              {formatCurrency(
                Number(stats?.totalPayable > 0 ? stats.totalPayable : (Number(stats?.totalPrincipal || stats?.totalAmountGiven || 0) * 1.10))
              )}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Principal + 10%
            </p>
          </div>
        </div>

        {/* 4. Total Collected */}
        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-surface-700/60 shadow-lg relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Collected</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <h2 className="text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
              {formatCurrency(stats?.totalAmountCollected)}
            </h2>
            <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-1">
              Paid: <strong className="text-emerald-700 dark:text-emerald-300">{stats?.completedRecords || 0}</strong>
            </p>
          </div>
        </div>

        {/* 5. Total Revenue (Total Collected - Total Principal) */}
        {(() => {
          const principalVal = Number(stats?.totalPrincipal || stats?.totalAmountGiven || 0);
          const collectedVal = Number(stats?.totalAmountCollected || 0);
          const revenueVal = stats?.totalRevenue !== undefined ? Number(stats.totalRevenue) : (collectedVal - principalVal);
          const isProfit = revenueVal >= 0;

          return (
            <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-surface-700/60 shadow-lg relative overflow-hidden group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Revenue</span>
                <div className={`w-8 h-8 rounded-lg ${isProfit ? 'bg-teal-500/15 text-teal-600 dark:text-teal-400' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'} flex items-center justify-center`}>
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2.5">
                <h2 className={`text-xl sm:text-2xl font-extrabold ${isProfit ? 'text-teal-600 dark:text-teal-300' : 'text-rose-600 dark:text-rose-400'} font-mono tracking-tight`}>
                  {isProfit ? `+${formatCurrency(revenueVal)}` : `-${formatCurrency(Math.abs(revenueVal))}`}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Collected - Principal
                </p>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Quick Reminder & Due Schedule Status Row (4 Items) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Due Today */}
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 uppercase">Due Today</p>
            <p className="text-lg font-bold text-amber-900 dark:text-white font-mono mt-0.5">{stats?.dueTodayCount || 0}</p>
          </div>
          <Clock className="w-5 h-5 text-amber-500" />
        </div>

        {/* Due Tomorrow */}
        <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-indigo-800 dark:text-indigo-300 uppercase">Due Tomorrow</p>
            <p className="text-lg font-bold text-indigo-900 dark:text-white font-mono mt-0.5">{stats?.dueTomorrowCount || 0}</p>
          </div>
          <Calendar className="w-5 h-5 text-indigo-500" />
        </div>

        {/* Overdue */}
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-rose-800 dark:text-rose-300 uppercase">Overdue Loans</p>
            <p className="text-lg font-bold text-rose-900 dark:text-white font-mono mt-0.5">{stats?.overdueRecordsCount || 0}</p>
          </div>
          <ShieldAlert className="w-5 h-5 text-rose-500" />
        </div>

        {/* WhatsApp Sent */}
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 uppercase">WhatsApp Sent</p>
            <p className="text-lg font-bold text-emerald-900 dark:text-white font-mono mt-0.5">{stats?.whatsappSentCount || 0}</p>
          </div>
          <MessageSquare className="w-5 h-5 text-emerald-500" />
        </div>
      </div>

      {/* Duration Categories Breakdown */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            <span>Repayment Frequencies (10% Interest Applied)</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Weekly (7 Days) */}
          <div 
            onClick={() => onNavigate('weekly')}
            className="glass-card glass-card-hover rounded-2xl p-5 border border-blue-200 dark:border-blue-500/20 bg-gradient-to-br from-blue-50/50 to-white dark:from-blue-950/40 dark:to-surface-900 cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors">Weekly</h3>
                  <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">7 Days Schedule</span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-all" />
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-surface-800 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Clients</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{stats?.durationBreakdown?.[0]?.count || 0}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Principal Volume</p>
                <p className="text-sm font-bold text-blue-600 dark:text-blue-300 font-mono">
                  {formatCurrency(stats?.durationBreakdown?.[0]?.amount || 0)}
                </p>
              </div>
            </div>
          </div>

          {/* Fortnight (14 Days) */}
          <div 
            onClick={() => onNavigate('fortnight')}
            className="glass-card glass-card-hover rounded-2xl p-5 border border-purple-200 dark:border-purple-500/20 bg-gradient-to-br from-purple-50/50 to-white dark:from-purple-950/40 dark:to-surface-900 cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-500/15 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                  <CalendarRange className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 group-hover:text-purple-600 dark:group-hover:text-purple-300 transition-colors">Fortnightly</h3>
                  <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400">14 Days Schedule</span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-all" />
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-surface-800 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Clients</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{stats?.durationBreakdown?.[1]?.count || 0}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Principal Volume</p>
                <p className="text-sm font-bold text-purple-600 dark:text-purple-300 font-mono">
                  {formatCurrency(stats?.durationBreakdown?.[1]?.amount || 0)}
                </p>
              </div>
            </div>
          </div>

          {/* Monthly (30 Days) */}
          <div 
            onClick={() => onNavigate('monthly')}
            className="glass-card glass-card-hover rounded-2xl p-5 border border-emerald-200 dark:border-emerald-500/20 bg-gradient-to-br from-emerald-50/50 to-white dark:from-emerald-950/40 dark:to-surface-900 cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-colors">Monthly</h3>
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">1 Month Schedule</span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-all" />
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-surface-800 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Clients</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{stats?.durationBreakdown?.[2]?.count || 0}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Principal Volume</p>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-300 font-mono">
                  {formatCurrency(stats?.durationBreakdown?.[2]?.amount || 0)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Overdue Clients & Recent WhatsApp Reminders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Overdue Loans */}
        <div className="glass-card rounded-2xl p-5 border border-slate-200 dark:border-surface-700/60 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-surface-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-rose-500/15 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">Overdue Clients</h3>
              </div>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border border-rose-300 dark:border-rose-500/30">
                {stats?.overdueRecords?.length || 0}
              </span>
            </div>

            <div className="mt-3 space-y-2.5">
              {stats?.overdueRecords && stats.overdueRecords.length > 0 ? (
                stats.overdueRecords.map(item => {
                  const statusInfo = getDueStatusInfo(item.dueDate, item.remainingAmount);
                  return (
                    <div 
                      key={item.recordId}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-surface-950/70 border border-rose-200 dark:border-rose-500/20 hover:border-rose-400 dark:hover:border-rose-500/40 transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{item.clientName}</p>
                          <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-surface-800 px-1.5 py-0.2 rounded">
                            {item.duration}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                          <span>+91 {item.mobileNumber}</span>
                          <span>•</span>
                          <span className="text-rose-600 dark:text-rose-400 font-semibold">{statusInfo.label}</span>
                        </p>
                      </div>

                      <div className="text-right flex items-center gap-2">
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Remaining</p>
                          <p className="text-sm font-bold text-rose-600 dark:text-rose-400 font-mono">
                            {formatCurrency(item.remainingAmount)}
                          </p>
                        </div>

                        <button
                          onClick={() => onOpenClientDetail(item.clientId)}
                          className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-surface-800 dark:hover:bg-surface-700 text-brand-600 dark:text-brand-400 transition-colors"
                          title="View Client"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500/70 dark:text-emerald-400/60 mx-auto mb-2" />
                  <span>No overdue clients. All payments are on schedule.</span>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 mt-3 border-t border-slate-200 dark:border-surface-800/80 text-right">
            <button
              onClick={() => onNavigate('all-clients')}
              className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-500 dark:hover:text-brand-300 inline-flex items-center gap-1"
            >
              <span>View all clients</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Recent WhatsApp Reminders & Activity */}
        <div className="glass-card rounded-2xl p-5 border border-slate-200 dark:border-surface-700/60 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-surface-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">WhatsApp Reminders</h3>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                Auto & Manual Logs
              </span>
            </div>

            <div className="mt-3 space-y-2.5">
              {stats?.recentReminders && stats.recentReminders.length > 0 ? (
                stats.recentReminders.map(rem => {
                  const isSent = rem.status === 'sent';
                  return (
                    <div 
                      key={rem.id}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-surface-950/70 border border-slate-200 dark:border-surface-800 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-900 dark:text-white truncate">{rem.clientName}</p>
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
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
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate font-mono">
                          {rem.phoneNumber} • Due: {formatDate(rem.dueDate)}
                        </p>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          isSent
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30'
                        }`}>
                          {rem.status}
                        </span>
                        <p className="text-[10px] text-slate-400 font-mono mt-1">
                          ₹{Number(rem.amount).toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs space-y-1">
                  <MessageSquare className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                  <p>No WhatsApp reminders dispatched yet.</p>
                  <p className="text-[11px] text-slate-400">Scheduled checks run automatically in the background.</p>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 mt-3 border-t border-slate-200 dark:border-surface-800/80 text-right">
            <button
              onClick={() => onNavigate('transactions')}
              className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-500 dark:hover:text-brand-300 inline-flex items-center gap-1"
            >
              <span>View Transactions & Ledger</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
