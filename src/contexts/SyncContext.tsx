import React, { createContext, useContext, useEffect, useState } from 'react';

export type SyncState = 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'SYNCED' | 'ERROR';

interface SyncItem {
  id: string;
  postoId: string;
  collection: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface SyncContextType {
  syncState: SyncState;
  pendingCount: number;
  isOnline: boolean;
  enqueueItem: (collection: string, data: Record<string, unknown>, postoId: string) => void;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [syncState, setSyncState] = useState<SyncState>(navigator.onLine ? 'SYNCED' : 'OFFLINE');
  const [queue, setQueue] = useState<SyncItem[]>(() => {
    try {
      const saved = localStorage.getItem('meu_posto_sync_queue');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncState('SYNCING');
      setTimeout(() => {
        setSyncState('SYNCED');
      }, 1200);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncState('OFFLINE');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('meu_posto_sync_queue', JSON.stringify(queue));
    } catch (e) {
      console.warn('Falha ao salvar fila local', e);
    }
  }, [queue]);

  const enqueueItem = (collection: string, data: Record<string, unknown>, postoId: string) => {
    const newItem: SyncItem = {
      id: (data.id as string) || `sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      postoId,
      collection,
      data,
      timestamp: new Date().toISOString(),
    };
    setQueue((prev) => [...prev, newItem]);
  };

  const syncNow = async () => {
    if (!isOnline || queue.length === 0) return;
    setSyncState('SYNCING');
    try {
      // Simula e descarrega a fila com o Firebase
      await new Promise((res) => setTimeout(res, 800));
      setQueue([]);
      setSyncState('SYNCED');
    } catch {
      setSyncState('ERROR');
    }
  };

  return (
    <SyncContext.Provider
      value={{
        syncState,
        pendingCount: queue.length,
        isOnline,
        enqueueItem,
        syncNow,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => {
  const context = useContext(SyncContext);
  if (!context) throw new Error('useSync deve ser usado dentro de SyncProvider');
  return context;
};
