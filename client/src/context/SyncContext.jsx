import React, { createContext, useContext, useState, useCallback } from 'react';

const SyncContext = createContext();

export function SyncProvider({ children }) {
  const [refreshSignal, setRefreshSignal] = useState(0);

  const triggerRefresh = useCallback(() => {
    setRefreshSignal(prev => prev + 1);
  }, []);

  return (
    <SyncContext.Provider value={{ refreshSignal, triggerRefresh }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}
