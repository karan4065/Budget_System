import React from 'react';
import { LayoutDashboard, CalendarDays, PlusCircle, Search, History } from 'lucide-react';

export function MobileNav({ currentTab, onNavigate, onOpenAddClient }) {
  const items = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'weekly', label: 'Weekly', icon: CalendarDays },
    { id: 'add-action', label: 'Add', icon: PlusCircle, isAction: true },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'transactions', label: 'Ledger', icon: History },
  ];

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-surface-950/95 border-t border-slate-200 dark:border-surface-800 backdrop-blur-xl px-2 py-1.5 flex items-center justify-around shadow-2xl safe-area-bottom">
      {items.map(item => {
        const Icon = item.icon;
        const isActive = currentTab === item.id;

        if (item.isAction) {
          return (
            <button
              key={item.id}
              onClick={onOpenAddClient}
              className="flex flex-col items-center justify-center -mt-5 bg-gradient-to-tr from-brand-600 to-indigo-500 text-white w-12 h-12 rounded-full shadow-lg shadow-brand-500/40 active:scale-95 transition-transform"
              aria-label="Add Client"
            >
              <Icon className="w-6 h-6" />
            </button>
          );
        }

        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`flex flex-col items-center justify-center w-14 py-1 rounded-xl transition-colors ${
              isActive 
                ? 'text-brand-600 dark:text-brand-400 font-semibold' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Icon className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
