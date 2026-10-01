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
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../config/firebase';
import { UserProfile, UserRole } from '../types';

export interface ContaCadastradaLocal {
  uid: string;
  nome: string;
  email: string;
  senhaHash: string;
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
  const [contasLocais, setContasLocais] = useState<ContaCadastradaLocal[]>(() => carregarContasLocais());

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
            const contaLocal = contas.find(
              (c) => c.email.toLowerCase() === (fbUser.email || '').toLowerCase()
            );

            const novoPerfil: UserProfile = {
              uid: fbUser.uid,
              nome: contaLocal?.nome || fbUser.displayName || fbUser.email?.split('@')[0] || 'Usuário Operacional',
              email: fbUser.email || '',
              role: contaLocal?.role || 'GERENTE',
              postoId: contaLocal?.postoId || 'posto-matriz-01',
              ativo: true,
              criadoEm: new Date().toISOString(),
              atualizadoEm: new Date().toISOString(),
            };
            await setDoc(userDocRef, novoPerfil);
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
   * Cadastro de novo acesso (tenta Firebase Auth + Firestore e garante persistência local imediata)
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

    const contasAtuais = carregarContasLocais();
    if (contasAtuais.some((c) => c.email.toLowerCase() === emailLimpo)) {
      throw new Error('Este e-mail já possui cadastro. Use a aba "Entrar".');
    }

    const agora = new Date().toISOString();
    let uidGerado = `user-${Date.now()}`;

    // Tenta criar também no Firebase Auth caso Email/Password esteja habilitado no projeto
    try {
      const cred = await createUserWithEmailAndPassword(auth, emailLimpo, senha);
      uidGerado = cred.user.uid;
      await updateProfile(cred.user, { displayName: nomeLimpo });

      const novoPerfilFb: UserProfile = {
        uid: uidGerado,
        nome: nomeLimpo,
        email: emailLimpo,
        role,
        postoId: 'posto-matriz-01',
        ativo: true,
        criadoEm: agora,
        atualizadoEm: agora,
      };
      await setDoc(doc(db, 'usuarios', uidGerado), novoPerfilFb);
    } catch {
      // Se Email/Password não estiver habilitado no console Firebase, prossegue com o registro local seguro
    }

    const novaConta: ContaCadastradaLocal = {
      uid: uidGerado,
      nome: nomeLimpo,
      email: emailLimpo,
      senhaHash: btoa(unescape(encodeURIComponent(senha))),
      role,
      postoId: 'posto-matriz-01',
      ativo: true,
      criadoEm: agora,
      atualizadoEm: agora,
    };

    const atualizadas = [novaConta, ...contasAtuais];
    salvarContasLocais(atualizadas);
    setContasLocais(atualizadas);

    const perfilAtivo: UserProfile = {
      uid: novaConta.uid,
      nome: novaConta.nome,
      email: novaConta.email,
      role: novaConta.role,
      postoId: novaConta.postoId,
      ativo: true,
      criadoEm: novaConta.criadoEm,
      atualizadoEm: novaConta.atualizadoEm,
    };

    persistirSessao(perfilAtivo);
    setPostoId(perfilAtivo.postoId);
  };

  /**
   * Login com E-mail e Senha cadastrados
   */
  const signInWithCredentials = async (email: string, senha: string) => {
    const emailLimpo = email.trim().toLowerCase();
    if (!emailLimpo || !senha) {
      throw new Error('Preencha o e-mail e a senha para entrar.');
    }

    // 1. Verifica nas contas cadastradas localmente
    const contas = carregarContasLocais();
    const senhaCodificada = btoa(unescape(encodeURIComponent(senha)));
    const contaEncontrada = contas.find(
      (c) => c.email.toLowerCase() === emailLimpo && c.senhaHash === senhaCodificada
    );

    if (contaEncontrada) {
      const perfil: UserProfile = {
        uid: contaEncontrada.uid,
        nome: contaEncontrada.nome,
        email: contaEncontrada.email,
        role: contaEncontrada.role,
        postoId: contaEncontrada.postoId,
        ativo: true,
        criadoEm: contaEncontrada.criadoEm,
        atualizadoEm: new Date().toISOString(),
      };
      persistirSessao(perfil);
      setPostoId(perfil.postoId);
      return;
    }

    // Se o e-mail existe localmente mas a senha está incorreta
    if (contas.some((c) => c.email.toLowerCase() === emailLimpo)) {
      throw new Error('Senha incorreta para este e-mail.');
    }

    // 2. Tenta autenticar no Firebase Auth caso seja conta externa
    try {
      await signInWithEmailAndPassword(auth, emailLimpo, senha);
    } catch {
      throw new Error('Conta não encontrada ou senha incorreta. Clique em "Cadastrar Acesso" para criar sua conta.');
    }
  };

  /**
   * Modo rápido para alternância de perfis operacionais no pátio ou testes
   */
  const signInDemo = async (role: UserRole) => {
    const nomesPadrao: Record<UserRole, string> = {
      GERENTE: 'Gerente Operacional',
      SUPERVISOR: 'Supervisor de Pista',
      OPERADOR: 'Operador de Caixa',
      MASTER: 'Administrador Master',
    };
    const demoProfile: UserProfile = {
      uid: `demo-${role.toLowerCase()}`,
      nome: nomesPadrao[role] || `Operador (${role})`,
      email: `${role.toLowerCase()}@meuposto.com`,
      role,
      postoId: 'posto-matriz-01',
      ativo: true,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };
    persistirSessao(demoProfile);
    setPostoId(demoProfile.postoId);
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

  const usuariosCadastrados = contasLocais.map(({ senhaHash: _, ...rest }) => rest);

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
