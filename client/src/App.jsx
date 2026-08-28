import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { useSync } from './context/SyncContext';
import { api } from './api';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { MobileNav } from './components/MobileNav';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { ClientLists } from './pages/ClientLists';
import { ClientDetail } from './pages/ClientDetail';
import { SearchClient } from './pages/SearchClient';
import { TransactionsPage } from './pages/TransactionsPage';
import { AllClients } from './pages/AllClients';
import { OverdueAccounts } from './pages/OverdueAccounts';
import { AddClientModal } from './components/AddClientModal';
import { AddPaymentModal } from './components/AddPaymentModal';
import { NewLoanModal } from './components/NewLoanModal';
import { ReceiptModal } from './components/ReceiptModal';

export default function App() {
  const { isAuthenticated, loading } = useAuth();
  const { refreshSignal, triggerRefresh } = useSync();

  // Navigation tab state
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Global modals
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [paymentModalData, setPaymentModalData] = useState(null); // { loanRecord, client }
  const [newLoanClient, setNewLoanClient] = useState(null); // client
  const [receiptData, setReceiptData] = useState(null);

  // Quick stats for sidebar badge counts
  const [sidebarStats, setSidebarStats] = useState(null);

  const fetchSidebarStats = async () => {
    if (!isAuthenticated) return;
    try {
      const stats = await api.getDashboardStats();
      setSidebarStats(stats);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchSidebarStats();
    }
  }, [isAuthenticated, refreshSignal]);

  // Global keyboard shortcut ('/' to search, 'Esc' to close)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === '/' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setCurrentTab('search');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-surface-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-brand-500/20 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  const handleNavigate = (tab) => {
    if (tab === 'add-client') {
      setIsAddClientOpen(true);
      return;
    }
    setCurrentTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenClientDetail = (clientId) => {
    setSelectedClientId(clientId);
    setCurrentTab('client-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenPayment = (loanRecord, client) => {
    setPaymentModalData({ loanRecord, client });
  };

  const handleOpenNewLoan = (client) => {
    setNewLoanClient(client);
  };

  const handleOpenReceipt = (data) => {
    setReceiptData(data);
  };

  const handleClientCreated = (clientId, duration) => {
    triggerRefresh();
    handleOpenClientDetail(clientId);
  };

  const handlePaymentSuccess = () => {
    triggerRefresh();
  };

  const handleNewLoanSuccess = (recordId) => {
    triggerRefresh();
    if (selectedClientId) {
      handleOpenClientDetail(selectedClientId);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-surface-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-brand-500 selection:text-white transition-colors">
      {/* Top Navbar */}
      <Navbar
        onOpenAddClient={() => setIsAddClientOpen(true)}
        onOpenSearch={() => setCurrentTab('search')}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(prev => !prev)}
        isMobileSidebarOpen={isMobileSidebarOpen}
        activeTab={currentTab}
        onNavigate={handleNavigate}
      />

      {/* Main Layout Body */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        {/* Desktop Sidebar & Mobile Drawer */}
        <Sidebar
          currentTab={currentTab}
          onNavigate={handleNavigate}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          stats={sidebarStats}
        />

        {/* Dynamic Content Area — pb-20 for mobile bottom nav */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-10 min-w-0 max-w-full overflow-x-hidden">
          {currentTab === 'dashboard' && (
            <Dashboard
              onNavigate={handleNavigate}
              onOpenAddClient={() => setIsAddClientOpen(true)}
              onOpenClientDetail={handleOpenClientDetail}
              onOpenPayment={handleOpenPayment}
            />
          )}

          {currentTab === 'weekly' && (
            <ClientLists
              initialDuration="weekly"
              onOpenClientDetail={handleOpenClientDetail}
              onOpenAddClient={() => setIsAddClientOpen(true)}
              onOpenPayment={handleOpenPayment}
            />
          )}

          {currentTab === 'fortnight' && (
            <ClientLists
              initialDuration="fortnight"
              onOpenClientDetail={handleOpenClientDetail}
              onOpenAddClient={() => setIsAddClientOpen(true)}
              onOpenPayment={handleOpenPayment}
            />
          )}

          {currentTab === 'monthly' && (
            <ClientLists
              initialDuration="monthly"
              onOpenClientDetail={handleOpenClientDetail}
              onOpenAddClient={() => setIsAddClientOpen(true)}
              onOpenPayment={handleOpenPayment}
            />
          )}

          {currentTab === 'overdue' && (
            <OverdueAccounts
              onOpenClientDetail={handleOpenClientDetail}
              onOpenPayment={handleOpenPayment}
              onOpenAddClient={() => setIsAddClientOpen(true)}
            />
          )}

          {currentTab === 'due-tomorrow' && (
            <ClientLists
              initialDuration="due-tomorrow"
              hideTabs={true}
              onOpenClientDetail={handleOpenClientDetail}
              onOpenAddClient={() => setIsAddClientOpen(true)}
              onOpenPayment={handleOpenPayment}
            />
          )}

          {currentTab === 'all-clients' && (
            <AllClients
              onOpenClientDetail={handleOpenClientDetail}
              onOpenAddClient={() => setIsAddClientOpen(true)}
              onOpenNewLoan={handleOpenNewLoan}
            />
          )}

          {(currentTab === 'history' || currentTab === 'completed-loans') && (
            <ClientLists
              initialDuration="history"
              onOpenClientDetail={handleOpenClientDetail}
              onOpenAddClient={() => setIsAddClientOpen(true)}
              onOpenPayment={handleOpenPayment}
            />
          )}

          {currentTab === 'search' && (
            <SearchClient
              onOpenClientDetail={handleOpenClientDetail}
              onOpenAddClient={() => setIsAddClientOpen(true)}
              onOpenPayment={handleOpenPayment}
              onOpenNewLoan={handleOpenNewLoan}
            />
          )}

          {currentTab === 'transactions' && (
            <TransactionsPage
              onOpenReceipt={handleOpenReceipt}
              onOpenClientDetail={handleOpenClientDetail}
            />
          )}

          {currentTab === 'client-detail' && selectedClientId && (
            <ClientDetail
              clientId={selectedClientId}
              onBack={() => setCurrentTab('all-clients')}
              onOpenPayment={handleOpenPayment}
              onOpenNewLoan={handleOpenNewLoan}
              onOpenReceipt={handleOpenReceipt}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileNav
        currentTab={currentTab}
        onNavigate={handleNavigate}
        onOpenAddClient={() => setIsAddClientOpen(true)}
      />

      {/* Global Modals */}
      <AddClientModal
        isOpen={isAddClientOpen}
        onClose={() => setIsAddClientOpen(false)}
        onSuccess={handleClientCreated}
      />

      {paymentModalData && (
        <AddPaymentModal
          isOpen={!!paymentModalData}
          onClose={() => setPaymentModalData(null)}
          loanRecord={paymentModalData.loanRecord}
          client={paymentModalData.client}
          onSuccess={handlePaymentSuccess}
          onOpenReceipt={handleOpenReceipt}
        />
      )}

      {newLoanClient && (
        <NewLoanModal
          isOpen={!!newLoanClient}
          onClose={() => setNewLoanClient(null)}
          client={newLoanClient}
          onSuccess={handleNewLoanSuccess}
        />
      )}

      {receiptData && (
        <ReceiptModal
          isOpen={!!receiptData}
          onClose={() => setReceiptData(null)}
          data={receiptData}
        />
      )}
    </div>
  );
}
