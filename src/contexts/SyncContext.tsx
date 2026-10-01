import React, { createContext, useContext, useEffect, useState } from 'react';
import { testConnection } from '../repositories/firestoreRepository';

export type SyncState = 'NUVEM 24H ATIVA' | 'SINCRONIZANDO NUVEM...' | 'OFFLINE (CACHE NUVEM)' | 'ERRO DE REDE';

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
  ultimoPingNuvem: string;
  enqueueItem: (collection: string, data: Record<string, unknown>, postoId: string) => void;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [syncState, setSyncState] = useState<SyncState>(
    navigator.onLine ? 'NUVEM 24H ATIVA' : 'OFFLINE (CACHE NUVEM)'
  );
  const [ultimoPingNuvem, setUltimoPingNuvem] = useState<string>(() =>
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
  const [queue, setQueue] = useState<SyncItem[]>([]);

  const verificarConexaoNuvem = async () => {
    if (!navigator.onLine) {
      setIsOnline(false);
      setSyncState('OFFLINE (CACHE NUVEM)');
      return;
    }
    const ok = await testConnection();
    if (ok) {
      setIsOnline(true);
      setSyncState('NUVEM 24H ATIVA');
      setUltimoPingNuvem(
        new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    }
  };

  useEffect(() => {
    verificarConexaoNuvem();

    // Heartbeat contínuo 24h na nuvem a cada 30 segundos
    const timer = setInterval(verificarConexaoNuvem, 30000);

    const handleOnline = () => {
      setIsOnline(true);
      setSyncState('SINCRONIZANDO NUVEM...');
      verificarConexaoNuvem();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncState('OFFLINE (CACHE NUVEM)');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const enqueueItem = (collectionName: string, data: Record<string, unknown>, postoId: string) => {
    const newItem: SyncItem = {
      id: (data.id as string) || `sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      postoId,
      collection: collectionName,
      data,
      timestamp: new Date().toISOString(),
    };
    setQueue((prev) => [...prev, newItem]);
  };

  const syncNow = async () => {
    setSyncState('SINCRONIZANDO NUVEM...');
    await verificarConexaoNuvem();
    setQueue([]);
  };

  return (
    <SyncContext.Provider
      value={{
        syncState,
        pendingCount: queue.length,
        isOnline,
        ultimoPingNuvem,
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
