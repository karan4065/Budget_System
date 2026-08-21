import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { 
  ShieldCheck, 
  LogOut, 
  Search, 
  Menu, 
  X, 
  Calendar,
  Sun,
  Moon
} from 'lucide-react';

export function Navbar({ onOpenAddClient, onOpenSearch, onToggleMobileSidebar, isMobileSidebarOpen, activeTab, onNavigate }) {
  const { admin, logout } = useAuth();
  const { theme, toggleTheme, isDark } = useTheme();
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const formattedDate = currentDateTime.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-200 dark:border-surface-800/80 bg-white/90 dark:bg-surface-950/85 backdrop-blur-xl transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: Mobile hamburger & Logo */}
          <div className="flex items-center gap-3">
            <button
              onClick={onToggleMobileSidebar}
              className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-surface-800 focus:outline-none transition-colors"
              aria-label="Toggle Navigation"
            >
              {isMobileSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>

            <button 
              onClick={() => onNavigate('dashboard')}
              className="flex items-center gap-2.5 text-left group focus:outline-none"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-400 flex items-center justify-center shadow-lg shadow-brand-500/20 group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-slate-900 via-brand-700 to-indigo-600 dark:from-white dark:via-slate-100 dark:to-brand-200 bg-clip-text text-transparent">
                  BudgetFlow
                </span>
                <span className="hidden sm:inline-block ml-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-brand-500/10 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400 border border-brand-500/20 dark:border-brand-500/30 rounded-full">
                  Admin Only
                </span>
              </div>
            </button>
          </div>

          {/* Center: Search & Date Header */}
          <div className="hidden md:flex items-center gap-4">
            <button
              onClick={onOpenSearch}
              className="flex items-center gap-3 px-3.5 py-1.5 rounded-lg bg-slate-100 dark:bg-surface-900 border border-slate-200 dark:border-surface-700/60 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:border-brand-500/40 text-sm transition-all w-64 shadow-inner"
            >
              <Search className="w-4 h-4 text-brand-500 dark:text-brand-400" />
              <span>Search mobile or name...</span>
              <kbd className="ml-auto text-[10px] bg-white dark:bg-surface-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded border border-slate-200 dark:border-surface-700 shadow-sm">
                /
              </kbd>
            </button>

            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-surface-900/60 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-surface-800">
              <Calendar className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>{formattedDate}</span>
            </div>
          </div>

          {/* Right: Theme Toggle, Quick Action, Admin Identity, Logout */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-amber-300 hover:bg-slate-100 dark:hover:bg-surface-800 border border-slate-200 dark:border-surface-800 transition-all shadow-sm"
              aria-label="Toggle Theme"
            >
              {isDark ? (
                <Sun className="w-5 h-5 text-amber-400 animate-in spin-in-180 duration-300" />
              ) : (
                <Moon className="w-5 h-5 text-slate-700 animate-in spin-in-180 duration-300" />
              )}
            </button>

            {/* Mobile Search Icon */}
            <button
              onClick={onOpenSearch}
              className="md:hidden p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-surface-800 transition-colors"
              aria-label="Search"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Admin Badge */}
            <div className="hidden sm:flex items-center gap-2.5 pl-3 border-l border-slate-200 dark:border-surface-800">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-xs shadow-inner">
                {admin?.name?.charAt(0) || 'S'}
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                  {admin?.name || 'Administrator'}
                </p>
                <p className="text-[10px] text-brand-600 dark:text-brand-400 font-mono">
                  {admin?.email || 'sumit@gmail.com'}
                </p>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={logout}
              title="Logout Admin Session"
              className="p-2 rounded-xl text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-slate-200 dark:border-transparent hover:border-rose-200 dark:hover:border-rose-500/20 transition-all"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
