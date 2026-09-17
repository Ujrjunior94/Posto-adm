import { db, auth } from '../config/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  onSnapshot,
  QueryConstraint,
  addDoc,
  getDocFromServer
} from 'firebase/firestore';
import { AuditLog, AuditAcao } from '../types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Validação de conexão inicial com o Firestore conforme SKILL.md
 */
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

/**
 * Registra auditoria imutável no Firestore (ou local se demo offline)
 */
export async function registrarAuditoria(
  postoId: string,
  usuarioId: string,
  usuarioNome: string,
  modulo: string,
  entidade: string,
  entidadeId: string,
  acao: AuditAcao,
  dadosAnteriores?: Record<string, unknown> | null,
  dadosNovos?: Record<string, unknown> | null
) {
  if (!auth.currentUser) {
    try {
      const raw = localStorage.getItem(`meuposto_demo_${postoId}_auditoria`);
      const logs = raw ? JSON.parse(raw) : [];
      logs.unshift({
        id: `audit-${Date.now()}`,
        postoId,
        usuarioId,
        usuarioNome,
        modulo,
        entidade,
        entidadeId,
        acao,
        dadosAnteriores: dadosAnteriores || null,
        dadosNovos: dadosNovos || null,
        timestamp: new Date().toISOString(),
        dispositivo: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 100) : 'Web App',
      });
      localStorage.setItem(`meuposto_demo_${postoId}_auditoria`, JSON.stringify(logs.slice(0, 50)));
    } catch {
      // ignore
    }
    return;
  }

  const path = `postos/${postoId}/auditoria`;
  try {
    const colRef = collection(db, 'postos', postoId, 'auditoria');
    await addDoc(colRef, {
      postoId,
      usuarioId,
      usuarioNome,
      modulo,
      entidade,
      entidadeId,
      acao,
      dadosAnteriores: dadosAnteriores || null,
      dadosNovos: dadosNovos || null,
      timestamp: new Date().toISOString(),
      dispositivo: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 100) : 'Web App',
    });
  } catch (err) {
    console.error('Falha ao gravar auditoria:', err);
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

/**
 * Repositório Base Genérico para subcoleções de um Posto
 */
export class PostoSubcollectionRepository<T extends { id: string }> {
  constructor(private subcollectionName: string) {}

  private getCollection(postoId: string) {
    return collection(db, 'postos', postoId, this.subcollectionName);
  }

  private getLocalKey(postoId: string) {
    return `meuposto_demo_${postoId}_${this.subcollectionName}`;
  }

  private getLocalItems(postoId: string): T[] {
    try {
      const raw = localStorage.getItem(this.getLocalKey(postoId));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private setLocalItems(postoId: string, items: T[]): void {
    try {
      localStorage.setItem(this.getLocalKey(postoId), JSON.stringify(items));
    } catch {
      // ignore
    }
  }

  async getById(postoId: string, id: string): Promise<T | null> {
    if (!auth.currentUser) {
      const items = this.getLocalItems(postoId);
      return items.find((it) => it.id === id) || null;
    }
    const path = `postos/${postoId}/${this.subcollectionName}/${id}`;
    try {
      const dRef = doc(db, 'postos', postoId, this.subcollectionName, id);
      const snap = await getDoc(dRef);
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as T;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
      return null;
    }
  }

  async getAll(postoId: string, ...constraints: QueryConstraint[]): Promise<T[]> {
    if (!auth.currentUser) {
      return this.getLocalItems(postoId);
    }
    const path = `postos/${postoId}/${this.subcollectionName}`;
    try {
      const col = this.getCollection(postoId);
      const q = query(col, ...constraints);
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as T));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
      return [];
    }
  }

  async save(postoId: string, item: T): Promise<void> {
    if (!auth.currentUser) {
      const items = this.getLocalItems(postoId);
      const idx = items.findIndex((it) => it.id === item.id);
      if (idx >= 0) {
        items[idx] = { ...items[idx], ...item };
      } else {
        items.push(item);
      }
      this.setLocalItems(postoId, items);
      return;
    }
    const path = `postos/${postoId}/${this.subcollectionName}/${item.id}`;
    try {
      const dRef = doc(db, 'postos', postoId, this.subcollectionName, item.id);
      await setDoc(dRef, item, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }

  async update(postoId: string, id: string, data: Partial<T>): Promise<void> {
    if (!auth.currentUser) {
      const items = this.getLocalItems(postoId);
      const idx = items.findIndex((it) => it.id === id);
      if (idx >= 0) {
        items[idx] = { ...items[idx], ...data };
        this.setLocalItems(postoId, items);
      }
      return;
    }
    const path = `postos/${postoId}/${this.subcollectionName}/${id}`;
    try {
      const dRef = doc(db, 'postos', postoId, this.subcollectionName, id);
      await updateDoc(dRef, data as Record<string, unknown>);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }

  async delete(postoId: string, id: string): Promise<void> {
    if (!auth.currentUser) {
      const items = this.getLocalItems(postoId);
      const filtered = items.filter((it) => it.id !== id);
      this.setLocalItems(postoId, filtered);
      return;
    }
    const path = `postos/${postoId}/${this.subcollectionName}/${id}`;
    try {
      const dRef = doc(db, 'postos', postoId, this.subcollectionName, id);
      await deleteDoc(dRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }

  async clearAll(postoId: string): Promise<void> {
    if (!auth.currentUser) {
      this.setLocalItems(postoId, []);
      return;
    }
    const path = `postos/${postoId}/${this.subcollectionName}`;
    try {
      const col = this.getCollection(postoId);
      const snap = await getDocs(col);
      if (snap.empty) return;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => {
        batch.delete(d.ref);
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }

  subscribe(postoId: string, onUpdate: (items: T[]) => void, ...constraints: QueryConstraint[]) {
    if (!auth.currentUser) {
      const items = this.getLocalItems(postoId);
      onUpdate(items);
      return () => {};
    }
    const path = `postos/${postoId}/${this.subcollectionName}`;
    const col = this.getCollection(postoId);
    const q = query(col, ...constraints);
    return onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as T));
        onUpdate(items);
      },
      (err) => {
        console.warn(`Erro no listener da coleção ${this.subcollectionName}:`, err);
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
  }
}
