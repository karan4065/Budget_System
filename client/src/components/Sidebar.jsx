import { 
  LayoutDashboard, 
  UserPlus, 
  CalendarDays, 
  CalendarRange, 
  Calendar, 
  Users, 
  Search, 
  History, 
  AlertCircle,
  AlertOctagon,
  Clock, 
  Shield, 
  HelpCircle,
  CheckCircle2,
  Coins
} from 'lucide-react';

export function Sidebar({ currentTab, onNavigate, isMobileOpen, onCloseMobile, stats }) {
  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null
    },
    {
      section: 'Overdue & Collections'
    },
    {
      id: 'overdue',
      label: 'Overdue',
      icon: AlertOctagon,
      badge: stats?.overdueRecordsCount || null,
      badgeColor: 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300 border-rose-500/30 animate-pulse'
    },
    {
      id: 'due-tomorrow',
      label: 'Due Tomorrow',
      icon: Clock,
      badge: stats?.dueTomorrowCount || null,
      badgeColor: 'bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 border-amber-500/30 font-semibold'
    },
    {
      section: 'Reminders & Schedules'
    },
    {
      id: 'history',
      label: 'Loan History',
      icon: History,
      badge: null
    },
    {
      id: 'pending-list',
      label: 'Pending List',
      icon: Coins,
      badge: stats?.pendingClientsCount || null,
      badgeColor: 'bg-rose-500/15 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border-rose-500/30 font-bold'
    },
    {
      section: 'Records & Auditing'
    },
    {
      id: 'all-clients',
      label: 'All Clients',
      icon: Users,
      badge: stats?.totalClients || null,
      badgeColor: 'bg-slate-100 text-slate-700 dark:bg-surface-800 dark:text-slate-300 border-slate-300 dark:border-surface-700'
    },
    {
      id: 'search',
      label: 'Search Client',
      icon: Search
    },
    {
      id: 'transactions',
      label: 'Transactions Ledger',
      icon: History
    }
  ];

  const handleItemClick = (id) => {
    onNavigate(id);
    if (onCloseMobile) onCloseMobile();
  };

  const content = (
    <div className="flex flex-col h-full justify-between p-4">
      <div className="space-y-6">
        {/* Navigation list */}
        <nav className="space-y-1.5">
          {navItems.map((item, idx) => {
            if (item.section) {
              return (
                <div key={idx} className="pt-4 pb-1 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {item.section}
                </div>
              );
            }

            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-300 border border-brand-200 dark:border-brand-500/40 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-surface-800/80 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>

                {item.badge !== null && item.badge !== undefined && (
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${item.badgeColor || 'bg-slate-100 text-slate-700 dark:bg-surface-800 dark:text-slate-300 border-slate-300 dark:border-surface-700'}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom info card */}
      <div className="pt-4 border-t border-slate-200 dark:border-surface-800/80 space-y-3">
        {stats?.overdueRecordsCount > 0 && (
          <div 
            onClick={() => handleItemClick('overdue')}
            className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-300 text-xs flex items-center gap-2 cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-500/15 transition-colors"
          >
            <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 flex-shrink-0 animate-bounce" />
            <div className="font-medium">
              <span className="font-bold">{stats.overdueRecordsCount} Overdue</span> record(s) need attention.
            </div>
          </div>
        )}

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-surface-900/60 border border-slate-200 dark:border-surface-800 text-slate-500 dark:text-slate-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
            <span>Single Admin Mode</span>
          </div>
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse"></span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 flex-shrink-0 border-r border-slate-200 dark:border-surface-800/80 bg-white/60 dark:bg-surface-950/40 backdrop-blur-md sticky top-16 self-start h-[calc(100vh-4rem)] overflow-y-auto">
        {content}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative flex flex-col w-72 max-w-full bg-white dark:bg-surface-950 border-r border-slate-200 dark:border-surface-800 h-full z-50">
            {content}
          </div>
        </div>
      )}
    </>
  );
}
