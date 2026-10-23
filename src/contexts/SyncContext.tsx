import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
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

// Whitelist rigorosa de coleções operacionais permitidas no sistema Meu Posto
export const COLECOES_PERMITIDAS = new Set([
  'funcionarios',
  'escalas',
  'escalasImportadas',
  'turnos',
  'fechamentos',
  'ocorrenciasCaixa',
  'rateios',
  'lmc',
  'tanques',
  'bicos',
  'afericoes',
  'densidades',
  'analises',
  'conformidades',
  'relatorios',
  'auditoria',
]);

const ID_REGEX = /^[a-zA-Z0-9_\-\.]+$/;

export function isValidSyncId(id: string): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && ID_REGEX.test(id);
}

interface SyncContextType {
  syncState: SyncState;
  pendingCount: number;
  isOnline: boolean;
  ultimoPingNuvem: string;
  enqueueItem: (collection: string, data: Record<string, unknown>, postoId: string) => void;
  syncNow: () => Promise<void>;
  storageDisponivel: boolean;
}

const STORAGE_SYNC_QUEUE_KEY = 'meu_posto_offline_sync_queue';

const carregarFilaLocal = (): SyncItem[] => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = localStorage.getItem(STORAGE_SYNC_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: any) =>
        item &&
        typeof item.id === 'string' &&
        typeof item.postoId === 'string' &&
        typeof item.collection === 'string' &&
        item.data &&
        typeof item.data === 'object'
    );
  } catch (err) {
    console.warn('[Sync] Falha ao restaurar fila do armazenamento local:', err);
    return [];
  }
};

const salvarFilaLocal = (items: SyncItem[]): boolean => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    if (items.length > 0) {
      localStorage.setItem(STORAGE_SYNC_QUEUE_KEY, JSON.stringify(items));
    } else {
      localStorage.removeItem(STORAGE_SYNC_QUEUE_KEY);
    }
    return true;
  } catch (err) {
    console.error('[Sync] Falha crítica de persistência local (Cota do Storage ou restrição do navegador):', err);
    return false;
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
  const [storageDisponivel, setStorageDisponivel] = useState<boolean>(true);

  // Fila sincronizada via Ref para proteção absoluta contra condições de corrida (Race Conditions)
  const filaInicial = carregarFilaLocal();
  const [queue, setQueue] = useState<SyncItem[]>(filaInicial);
  const queueRef = useRef<SyncItem[]>(filaInicial);
  const isSyncingRef = useRef<boolean>(false);

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
   * Processador Atômico e Concorrente-Safe da Fila de Sincronização:
   * 1. Usa Mutex (isSyncingRef) para impedir execuções sobrepostas.
   * 2. Snapshot dos itens atuais a processar.
   * 3. Gravação com validação de coleção e IDs.
   * 4. Remove APENAS os itens confirmados com sucesso.
   * 5. Qualquer item enfileirado DURANTE a sincronização é estritamente preservado.
   */
  const processarFilaSincronizacao = async () => {
    if (isSyncingRef.current) return;
    if (queueRef.current.length === 0) return;

    isSyncingRef.current = true;
    setSyncState('SINCRONIZANDO NUVEM...');

    const conexaoOk = await verificarConexaoNuvem();
    if (!conexaoOk) {
      setSyncState('OFFLINE (CACHE NUVEM)');
      isSyncingRef.current = false;
      return;
    }

    const snapshotItens = [...queueRef.current];
    const idsConfirmadosComSucesso = new Set<string>();

    for (const item of snapshotItens) {
      // 1. Validação estrita da coleção de destino
      if (!COLECOES_PERMITIDAS.has(item.collection)) {
        console.error(`[Segurança Sync] Coleção não autorizada rejeitada: "${item.collection}". Item ignorado.`);
        continue;
      }

      // 2. Validação dos IDs
      if (!isValidSyncId(item.postoId) || !isValidSyncId(item.id)) {
        console.error(`[Segurança Sync] Identificador malformado rejeitado. Posto: "${item.postoId}", ID: "${item.id}".`);
        continue;
      }

      try {
        const docRef = doc(db, 'postos', item.postoId, item.collection, item.id);
        const payloadFinal = {
          ...item.data,
          postoId: item.postoId,
        };

        await setDoc(docRef, payloadFinal, { merge: true });
        idsConfirmadosComSucesso.add(item.id);
      } catch (err) {
        console.error(`[Sync] Falha na persistência remota do item ${item.id} (${item.collection}):`, err);
        // Não adiciona em idsConfirmadosComSucesso; o item permanece na fila
      }
    }

    // Atualização atômica sem sobrescrever itens recém-chegados
    queueRef.current = queueRef.current.filter((item) => !idsConfirmadosComSucesso.has(item.id));
    setQueue([...queueRef.current]);

    const salvo = salvarFilaLocal(queueRef.current);
    if (!salvo) setStorageDisponivel(false);

    if (queueRef.current.length > 0) {
      setSyncState('ERRO DE REDE');
    } else {
      setSyncState('NUVEM 24H ATIVA');
    }

    isSyncingRef.current = false;
  };

  const syncNow = async () => {
    await processarFilaSincronizacao();
  };

  /**
   * Enfileiramento de itens com integridade e sem concorrência
   */
  const enqueueItem = (collectionName: string, data: Record<string, unknown>, postoId: string) => {
    if (!COLECOES_PERMITIDAS.has(collectionName)) {
      console.error(`[Sync] Tentativa de enfileirar em coleção inválida: "${collectionName}"`);
      return;
    }

    const itemId = (data.id as string) || `sync-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (!isValidSyncId(postoId) || !isValidSyncId(itemId)) {
      console.error(`[Sync] IDs inválidos no enfileiramento: posto=${postoId}, id=${itemId}`);
      return;
    }

    const newItem: SyncItem = {
      id: itemId,
      postoId,
      collection: collectionName,
      data,
      timestamp: new Date().toISOString(),
    };

    queueRef.current = [...queueRef.current, newItem];
    setQueue([...queueRef.current]);

    const salvo = salvarFilaLocal(queueRef.current);
    if (!salvo) setStorageDisponivel(false);

    // Se estiver online, dispara tentativa de processamento
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      setTimeout(() => {
        processarFilaSincronizacao();
      }, 50);
    }
  };

  useEffect(() => {
    verificarConexaoNuvem();

    // Sincroniza fila pendente ao iniciar se houver conexão
    if (queueRef.current.length > 0 && typeof navigator !== 'undefined' && navigator.onLine) {
      processarFilaSincronizacao();
    }

    // Heartbeat contínuo 24h na nuvem a cada 30 segundos
    const timer = setInterval(verificarConexaoNuvem, 30000);

    const handleOnline = () => {
      setIsOnline(true);
      setSyncState('SINCRONIZANDO NUVEM...');
      verificarConexaoNuvem().then((ok) => {
        if (ok) {
          processarFilaSincronizacao();
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
        storageDisponivel,
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
