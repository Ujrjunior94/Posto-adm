import React, { createContext, useContext, useEffect, useState } from 'react';
import { testConnection } from '../repositories/firestoreRepository';
import { db } from '../config/firebase';
import { doc, setDoc } from 'firebase/firestore';

export type SyncState = 'NUVEM 24H ATIVA' | 'SINCRONIZANDO NUVEM...' | 'OFFLINE (CACHE NUVEM)' | 'ERRO DE REDE';

export interface SyncItem {
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

const STORAGE_SYNC_QUEUE_KEY = 'meu_posto_offline_sync_queue';

const carregarFilaLocal = (): SyncItem[] => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = localStorage.getItem(STORAGE_SYNC_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const salvarFilaLocal = (items: SyncItem[]) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (items.length > 0) {
      localStorage.setItem(STORAGE_SYNC_QUEUE_KEY, JSON.stringify(items));
    } else {
      localStorage.removeItem(STORAGE_SYNC_QUEUE_KEY);
    }
  } catch {
    // ignore storage quota issues
  }
};

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [syncState, setSyncState] = useState<SyncState>(
    typeof navigator !== 'undefined' && navigator.onLine ? 'NUVEM 24H ATIVA' : 'OFFLINE (CACHE NUVEM)'
  );
  const [ultimoPingNuvem, setUltimoPingNuvem] = useState<string>(() =>
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
  const [queue, setQueue] = useState<SyncItem[]>(() => carregarFilaLocal());

  const verificarConexaoNuvem = async (): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOnline(false);
      setSyncState('OFFLINE (CACHE NUVEM)');
      return false;
    }
    const ok = await testConnection();
    if (ok) {
      setIsOnline(true);
      setSyncState((prev) => (prev === 'SINCRONIZANDO NUVEM...' ? prev : 'NUVEM 24H ATIVA'));
      setUltimoPingNuvem(
        new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
      return true;
    } else {
      setSyncState('ERRO DE REDE');
      return false;
    }
  };

  /**
   * Sincronização segura sem perda de dados:
   * Processa cada item pendente individualmente contra o Firestore.
   * Somente remove da fila os itens que forem confirmados e gravados com sucesso.
   * Se ocorrer erro, os itens restantes são preservados na fila e no localStorage.
   */
  const processarFilaSincronizacao = async (filaAtual: SyncItem[]) => {
    if (filaAtual.length === 0) return;

    setSyncState('SINCRONIZANDO NUVEM...');
    const conexaoOk = await verificarConexaoNuvem();
    if (!conexaoOk) {
      setSyncState('OFFLINE (CACHE NUVEM)');
      return;
    }

    const itensRestantes: SyncItem[] = [];

    for (const item of filaAtual) {
      try {
        const docRef = doc(db, 'postos', item.postoId, item.collection, item.id);
        await setDoc(docRef, item.data, { merge: true });
      } catch (err) {
        console.error(`[Sync] Falha ao persistir item pendente ${item.id} (${item.collection}):`, err);
        itensRestantes.push(item);
      }
    }

    setQueue(itensRestantes);
    salvarFilaLocal(itensRestantes);

    if (itensRestantes.length > 0) {
      setSyncState('ERRO DE REDE');
    } else {
      setSyncState('NUVEM 24H ATIVA');
    }
  };

  const syncNow = async () => {
    await processarFilaSincronizacao(queue);
  };

  const enqueueItem = (collectionName: string, data: Record<string, unknown>, postoId: string) => {
    const newItem: SyncItem = {
      id: (data.id as string) || `sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      postoId,
      collection: collectionName,
      data,
      timestamp: new Date().toISOString(),
    };
    setQueue((prev) => {
      const atualizada = [...prev, newItem];
      salvarFilaLocal(atualizada);
      return atualizada;
    });

    // Se estiver online, tenta processar imediatamente
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      setTimeout(() => {
        processarFilaSincronizacao([...queue, newItem]);
      }, 100);
    }
  };

  useEffect(() => {
    verificarConexaoNuvem();

    // Se houver itens pendentes carregados do localStorage ao iniciar, tenta sincronizar
    if (queue.length > 0 && typeof navigator !== 'undefined' && navigator.onLine) {
      processarFilaSincronizacao(queue);
    }

    // Heartbeat contínuo 24h na nuvem a cada 30 segundos
    const timer = setInterval(verificarConexaoNuvem, 30000);

    const handleOnline = () => {
      setIsOnline(true);
      setSyncState('SINCRONIZANDO NUVEM...');
      verificarConexaoNuvem().then((ok) => {
        if (ok) {
          const filaSalva = carregarFilaLocal();
          if (filaSalva.length > 0) {
            processarFilaSincronizacao(filaSalva);
          }
        }
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncState('OFFLINE (CACHE NUVEM)');
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      clearInterval(timer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

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
