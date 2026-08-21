import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(() => {
    const saved = localStorage.getItem('budget_admin_user');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('budget_admin_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifySession = async () => {
      const storedToken = localStorage.getItem('budget_admin_token');
      if (storedToken) {
        try {
          const res = await api.getMe();
          setAdmin(res.admin);
          localStorage.setItem('budget_admin_user', JSON.stringify(res.admin));
        } catch (err) {
          logout();
        }
      }
      setLoading(false);
    };

    verifySession();

    const handleAuthExpired = () => {
      logout();
    };
    window.addEventListener('auth-expired', handleAuthExpired);
    return () => window.removeEventListener('auth-expired', handleAuthExpired);
  }, []);

  const login = async (email, password) => {
    const res = await api.login(email, password);
    setToken(res.token);
    setAdmin(res.admin);
    localStorage.setItem('budget_admin_token', res.token);
    localStorage.setItem('budget_admin_user', JSON.stringify(res.admin));
    return res;
  };

  const logout = () => {
    setToken(null);
    setAdmin(null);
    localStorage.removeItem('budget_admin_token');
    localStorage.removeItem('budget_admin_user');
  };

  return (
    <AuthContext.Provider value={{ admin, token, isAuthenticated: !!token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
