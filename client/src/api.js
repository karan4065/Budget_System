import { generateClientTransactionsCSV } from './utils/csvExport';

// API service for Budget Management System
// When running locally on localhost, use relative '/api' to communicate with local server (port 5000 via Vite proxy).
const isLocal = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const rawApiUrl = isLocal ? '' : (import.meta.env.VITE_API_URL || '');
const API_BASE = rawApiUrl 
  ? (rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl.replace(/\/$/, '')}/api`) 
  : '/api';

function getAuthHeader() {
  const token = localStorage.getItem('budget_admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('budget_admin_token');
      localStorage.removeItem('budget_admin_user');
      if (window.location.pathname !== '/login') {
        window.dispatchEvent(new CustomEvent('auth-expired'));
      }
    }
    throw new Error(data.error || `HTTP error ${response.status}`);
  }

  return data;
}

export const api = {
  // Auth
  login: (email, password) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  }),
  getMe: () => request('/auth/me'),

  // Dashboard
  getDashboardStats: () => request('/dashboard/stats'),

  // Clients
  getClients: (params = {}) => {
    const query = new URLSearchParams();
    if (params.duration) query.set('duration', params.duration);
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    return request(`/clients?${query.toString()}`);
  },
  getClient: (id) => request(`/clients/${id}`),
  createClient: (data) => request('/clients', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateClient: (id, data) => request(`/clients/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteClient: (id) => request(`/clients/${id}`, {
    method: 'DELETE'
  }),
  addLoanToClient: (id, data) => request(`/clients/${id}/loans`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateLoan: (id, data) => request(`/clients/loans/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteLoan: (id) => request(`/clients/loans/${id}`, {
    method: 'DELETE'
  }),
  searchClients: (query) => request(`/clients/search/${encodeURIComponent(query)}`),
  downloadClientCSV: async (clientId) => {
    const clientData = await api.getClient(clientId);
    if (!clientData || !clientData.client) {
      throw new Error('Client data could not be retrieved.');
    }
    generateClientTransactionsCSV(clientData.client, clientData.loanRecords || []);
  },

  // Transactions
  getTransactions: (params = {}) => {
    const query = new URLSearchParams();
    if (params.type) query.set('type', params.type);
    if (params.startDate) query.set('startDate', params.startDate);
    if (params.endDate) query.set('endDate', params.endDate);
    if (params.search) query.set('search', params.search);
    return request(`/transactions?${query.toString()}`);
  },
  createTransaction: (data) => request('/transactions', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateTransaction: (id, data) => request(`/transactions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteTransaction: (id) => request(`/transactions/${id}`, {
    method: 'DELETE'
  }),

  // WhatsApp Reminders
  getReminders: (params = {}) => {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.loanId) query.set('loanId', params.loanId);
    if (params.clientId) query.set('clientId', params.clientId);
    if (params.limit) query.set('limit', params.limit);
    return request(`/reminders?${query.toString()}`);
  },
  prepareManualReminder: (loanId, data = {}) => request(`/reminders/${loanId}/prepare`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  confirmReminderLog: (loanId, data = {}) => request(`/reminders/${loanId}/confirm`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  sendManualReminder: (loanId, data = {}) => request(`/reminders/${loanId}/send`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  triggerCronSweep: () => request('/reminders/trigger-cron', {
    method: 'POST'
  })
};
