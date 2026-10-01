import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as fbSignOut,
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../config/firebase';
import { UserProfile, UserRole } from '../types';

export interface ContaCadastradaLocal {
  uid: string;
  nome: string;
  email: string;
  senhaHash?: string;
  role: UserRole;
  postoId: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

interface RegisterAccessParams {
  nome: string;
  email: string;
  senha: string;
  role: UserRole;
}

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  usuariosCadastrados: Omit<ContaCadastradaLocal, 'senhaHash'>[];
  signInWithGoogle: () => Promise<void>;
  signInWithCredentials: (email: string, senha: string) => Promise<void>;
  registerAccess: (params: RegisterAccessParams) => Promise<void>;
  signInDemo: (role: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  setPostoAtivo: (postoId: string) => void;
  postoId: string;
}

const STORAGE_CONTAS_KEY = 'meuposto_contas_acesso_v1';
const STORAGE_SESSAO_KEY = 'meuposto_sessao_ativa_v1';

const carregarContasLocais = (): ContaCadastradaLocal[] => {
  try {
    const raw = localStorage.getItem(STORAGE_CONTAS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

const salvarContasLocais = (contas: ContaCadastradaLocal[]) => {
  try {
    localStorage.setItem(STORAGE_CONTAS_KEY, JSON.stringify(contas));
  } catch {
    // ignore storage errors
  }
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SESSAO_KEY);
      return saved ? (JSON.parse(saved) as UserProfile) : null;
    } catch {
      return null;
    }
  });
  const [postoId, setPostoId] = useState<string>('posto-matriz-01');
  const [loading, setLoading] = useState<boolean>(true);
  const [contasNuvem, setContasNuvem] = useState<ContaCadastradaLocal[]>(() => carregarContasLocais());

  const persistirSessao = (perfil: UserProfile | null) => {
    setUserProfile(perfil);
    try {
      if (perfil) {
        localStorage.setItem(STORAGE_SESSAO_KEY, JSON.stringify(perfil));
      } else {
        localStorage.removeItem(STORAGE_SESSAO_KEY);
      }
    } catch {
      // ignore
    }
  };

  // Sincronização 24h em tempo real da coleção de usuários na nuvem Firestore
  useEffect(() => {
    const unsubUsuarios = onSnapshot(
      collection(db, 'usuarios'),
      (snap) => {
        const listaNuvem: ContaCadastradaLocal[] = snap.docs.map((d) => {
          const data = d.data() as ContaCadastradaLocal;
          return {
            ...data,
            uid: d.id,
          };
        });
        if (listaNuvem.length > 0) {
          setContasNuvem(listaNuvem);
          salvarContasLocais(listaNuvem);
        }
      },
      (err) => {
        console.warn('Listener de usuários em nuvem:', err);
      }
    );

    return () => unsubUsuarios();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setCurrentUser(fbUser);
      if (fbUser) {
        try {
          const userDocRef = doc(db, 'usuarios', fbUser.uid);
          const snap = await getDoc(userDocRef);
          if (snap.exists()) {
            const data = snap.data() as UserProfile;
            persistirSessao(data);
            if (data.postoId) setPostoId(data.postoId);
          } else {
            const contas = carregarContasLocais();
            const contaExistente = contas.find(
              (c) => c.email.toLowerCase() === (fbUser.email || '').toLowerCase()
            );

            const novoPerfil: UserProfile = {
              uid: fbUser.uid,
              nome:
                contaExistente?.nome ||
                fbUser.displayName ||
                fbUser.email?.split('@')[0] ||
                'Usuário Operacional',
              email: fbUser.email || '',
              role: contaExistente?.role || 'GERENTE',
              postoId: contaExistente?.postoId || 'posto-matriz-01',
              ativo: true,
              criadoEm: new Date().toISOString(),
              atualizadoEm: new Date().toISOString(),
            };
            await setDoc(userDocRef, novoPerfil, { merge: true });
            persistirSessao(novoPerfil);
            setPostoId(novoPerfil.postoId);
          }
        } catch (err) {
          console.error('Erro ao carregar perfil do Firestore:', err);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Erro no login Google:', err);
      throw err;
    }
  };

  /**
   * Cadastro de novo acesso gravado 100% na nuvem Firestore (coleção usuarios)
   */
  const registerAccess = async ({ nome, email, senha, role }: RegisterAccessParams) => {
    const emailLimpo = email.trim().toLowerCase();
    const nomeLimpo = nome.trim();

    if (!nomeLimpo) {
      throw new Error('Informe seu nome completo.');
    }
    if (!emailLimpo || !emailLimpo.includes('@')) {
      throw new Error('Informe um e-mail válido.');
    }
    if (!senha || senha.length < 4) {
      throw new Error('A senha deve ter pelo menos 4 caracteres.');
    }

    if (contasNuvem.some((c) => c.email.toLowerCase() === emailLimpo)) {
      throw new Error('Este e-mail já possui cadastro na nuvem. Use a aba "Entrar".');
    }

    const agora = new Date().toISOString();
    let uidGerado = `user-${Date.now()}`;
    const senhaHash = btoa(unescape(encodeURIComponent(senha)));

    try {
      const cred = await createUserWithEmailAndPassword(auth, emailLimpo, senha);
      uidGerado = cred.user.uid;
      await updateProfile(cred.user, { displayName: nomeLimpo });
    } catch {
      // Prossegue gravando na coleção usuarios do Cloud Firestore
    }

    const novaContaNuvem: ContaCadastradaLocal = {
      uid: uidGerado,
      nome: nomeLimpo,
      email: emailLimpo,
      senhaHash,
      role,
      postoId: 'posto-matriz-01',
      ativo: true,
      criadoEm: agora,
      atualizadoEm: agora,
    };

    // Grava diretamente no Cloud Firestore 24h
    await setDoc(doc(db, 'usuarios', uidGerado), novaContaNuvem, { merge: true });

    const atualizadas = [novaContaNuvem, ...contasNuvem];
    salvarContasLocais(atualizadas);
    setContasNuvem(atualizadas);

    const perfilAtivo: UserProfile = {
      uid: novaContaNuvem.uid,
      nome: novaContaNuvem.nome,
      email: novaContaNuvem.email,
      role: novaContaNuvem.role,
      postoId: novaContaNuvem.postoId,
      ativo: true,
      criadoEm: novaContaNuvem.criadoEm,
      atualizadoEm: novaContaNuvem.atualizadoEm,
    };

    persistirSessao(perfilAtivo);
    setPostoId(perfilAtivo.postoId);
  };

  /**
   * Login com E-mail e Senha verificando diretamente na nuvem Firestore
   */
  const signInWithCredentials = async (email: string, senha: string) => {
    const emailLimpo = email.trim().toLowerCase();
    if (!emailLimpo || !senha) {
      throw new Error('Preencha o e-mail e a senha para entrar.');
    }

    const senhaCodificada = btoa(unescape(encodeURIComponent(senha)));

    // Busca atualizada na nuvem Firestore
    let listaUsuarios = contasNuvem;
    try {
      const snap = await getDocs(collection(db, 'usuarios'));
      if (!snap.empty) {
        listaUsuarios = snap.docs.map((d) => ({ ...(d.data() as ContaCadastradaLocal), uid: d.id }));
      }
    } catch {
      // Usa cache sincronizado se offline momentaneamente
    }

    const contaEncontrada = listaUsuarios.find(
      (c) =>
        c.email.toLowerCase() === emailLimpo &&
        (!c.senhaHash || c.senhaHash === senhaCodificada)
    );

    if (contaEncontrada) {
      const perfil: UserProfile = {
        uid: contaEncontrada.uid,
        nome: contaEncontrada.nome,
        email: contaEncontrada.email,
        role: contaEncontrada.role,
        postoId: contaEncontrada.postoId || 'posto-matriz-01',
        ativo: true,
        criadoEm: contaEncontrada.criadoEm,
        atualizadoEm: new Date().toISOString(),
      };
      persistirSessao(perfil);
      setPostoId(perfil.postoId);
      return;
    }

    if (listaUsuarios.some((c) => c.email.toLowerCase() === emailLimpo)) {
      throw new Error('Senha incorreta para este e-mail.');
    }

    try {
      await signInWithEmailAndPassword(auth, emailLimpo, senha);
    } catch {
      throw new Error(
        'Conta não encontrada ou senha incorreta. Clique em "Cadastrar Acesso" para criar sua conta na nuvem.'
      );
    }
  };

  /**
   * Acesso operacional conectado 24h ao Cloud Firestore
   */
  const signInDemo = async (role: UserRole) => {
    const nomesPadrao: Record<UserRole, string> = {
      GERENTE: 'Gerente Operacional',
      SUPERVISOR: 'Supervisor de Pista',
      OPERADOR: 'Operador de Caixa',
      MASTER: 'Administrador Master',
    };
    const uid = `operador-nuvem-${role.toLowerCase()}`;
    const cloudProfile: UserProfile = {
      uid,
      nome: nomesPadrao[role] || `Operador (${role})`,
      email: `${role.toLowerCase()}@meuposto.com`,
      role,
      postoId: 'posto-matriz-01',
      ativo: true,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, 'usuarios', uid), cloudProfile, { merge: true });
    } catch {
      // ignore
    }
    persistirSessao(cloudProfile);
    setPostoId(cloudProfile.postoId);
  };

  const signOut = async () => {
    try {
      await fbSignOut(auth);
    } catch (e) {
      console.warn(e);
    }
    persistirSessao(null);
    setCurrentUser(null);
  };

  const setPostoAtivo = (novoPostoId: string) => {
    setPostoId(novoPostoId);
  };

  const usuariosCadastrados = contasNuvem.map(({ senhaHash: _, ...rest }) => rest);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        usuariosCadastrados,
        signInWithGoogle,
        signInWithCredentials,
        registerAccess,
        signInDemo,
        signOut,
        setPostoAtivo,
        postoId,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return context;
};
