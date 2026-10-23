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
  role?: UserRole;
}

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  usuariosCadastrados: ContaCadastradaLocal[];
  signInWithGoogle: () => Promise<void>;
  signInWithCredentials: (email: string, senha: string) => Promise<void>;
  registerAccess: (params: RegisterAccessParams) => Promise<void>;
  signOut: () => Promise<void>;
  setPostoAtivo: (postoId: string) => void;
  postoId: string;
}

const STORAGE_SESSAO_KEY = 'meuposto_sessao_ativa_v1';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [postoId, setPostoId] = useState<string>('posto-matriz-01');
  const [loading, setLoading] = useState<boolean>(true);
  const [contasNuvem, setContasNuvem] = useState<ContaCadastradaLocal[]>([]);

  // Sincronização em tempo real da equipe/usuários cadastrados
  useEffect(() => {
    // Somente escuta usuários se houver alguém autenticado
    if (!currentUser) {
      setContasNuvem([]);
      return;
    }

    const unsubUsuarios = onSnapshot(
      collection(db, 'usuarios'),
      (snap) => {
        const lista: ContaCadastradaLocal[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            uid: d.id,
            nome: data.nome || 'Usuário',
            email: data.email || '',
            role: data.role || 'OPERADOR',
            postoId: data.postoId || 'posto-matriz-01',
            ativo: data.ativo ?? true,
            criadoEm: data.criadoEm || new Date().toISOString(),
            atualizadoEm: data.atualizadoEm || new Date().toISOString(),
          };
        });
        setContasNuvem(lista);
      },
      (err) => {
        console.warn('Listener de usuários do posto:', err);
      }
    );

    return () => unsubUsuarios();
  }, [currentUser]);

  // Autenticação Central Firebase Auth Oficial (JWT Criptográfico)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setCurrentUser(fbUser);
      if (fbUser) {
        try {
          const userDocRef = doc(db, 'usuarios', fbUser.uid);
          const snap = await getDoc(userDocRef);

          if (snap.exists()) {
            const data = snap.data() as UserProfile;
            setUserProfile(data);
            if (data.postoId) setPostoId(data.postoId);
            try {
              localStorage.setItem(STORAGE_SESSAO_KEY, JSON.stringify(data));
            } catch {
              // ignore
            }
          } else {
            // Se o documento ainda não existe (ex: primeiro login via Google ou conta recém-criada),
            // verifica se é o primeiro usuário do posto. Se for, atribui GERENTE; caso contrário, OPERADOR.
            let roleAtribuida: UserRole = 'OPERADOR';
            try {
              const allSnap = await getDocs(collection(db, 'usuarios'));
              if (allSnap.empty) {
                roleAtribuida = 'GERENTE';
              }
            } catch {
              roleAtribuida = 'OPERADOR';
            }

            const novoPerfil: UserProfile = {
              uid: fbUser.uid,
              nome: fbUser.displayName || fbUser.email?.split('@')[0] || 'Usuário Operacional',
              email: fbUser.email || '',
              role: roleAtribuida,
              postoId: 'posto-matriz-01',
              ativo: true,
              criadoEm: new Date().toISOString(),
              atualizadoEm: new Date().toISOString(),
            };

            await setDoc(userDocRef, novoPerfil, { merge: true });
            setUserProfile(novoPerfil);
            setPostoId(novoPerfil.postoId);
            try {
              localStorage.setItem(STORAGE_SESSAO_KEY, JSON.stringify(novoPerfil));
            } catch {
              // ignore
            }
          }
        } catch (err) {
          console.error('Erro ao sincronizar perfil do Firestore com Firebase Auth:', err);
        }
      } else {
        // Sessão encerrada no Firebase Auth -> Negação de acesso imediata
        setUserProfile(null);
        try {
          localStorage.removeItem(STORAGE_SESSAO_KEY);
        } catch {
          // ignore
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
   * Cadastro seguro de novo acesso no Firebase Authentication oficial.
   * Não grava senhas em Base64 e impede auto-elevação para Gerente/Supervisor.
   */
  const registerAccess = async ({ nome, email, senha }: RegisterAccessParams) => {
    const emailLimpo = email.trim().toLowerCase();
    const nomeLimpo = nome.trim();

    if (!nomeLimpo || nomeLimpo.length < 2) {
      throw new Error('Informe seu nome completo (mínimo de 2 caracteres).');
    }
    if (!emailLimpo || !emailLimpo.includes('@')) {
      throw new Error('Informe um e-mail válido.');
    }
    if (!senha || senha.length < 6) {
      throw new Error('A senha de acesso deve ter pelo menos 6 caracteres.');
    }

    // Regra de Integridade e Proteção contra Elevação de Privilégios:
    // O primeiro usuário da base de dados torna-se GERENTE para configuração do posto.
    // Todos os cadastros subsequentes entram como OPERADOR e só podem ser promovidos
    // pelo Gerente através da aba de controle de Funcionários.
    let roleDefinida: UserRole = 'OPERADOR';
    try {
      const snapExistentes = await getDocs(collection(db, 'usuarios'));
      if (snapExistentes.empty) {
        roleDefinida = 'GERENTE';
      }
    } catch {
      roleDefinida = 'OPERADOR';
    }

    // Criação da credencial oficial e segura no Firebase Auth
    let cred;
    try {
      cred = await createUserWithEmailAndPassword(auth, emailLimpo, senha);
    } catch (err: any) {
      const code = err?.code;
      if (code === 'auth/email-already-in-use') {
        throw new Error('Este e-mail já possui cadastro. Acesse a aba "Entrar" com suas credenciais.');
      } else if (code === 'auth/weak-password') {
        throw new Error('Senha muito fraca. Utilize pelo menos 6 caracteres com números ou símbolos.');
      } else if (code === 'auth/invalid-email') {
        throw new Error('Formato de e-mail inválido.');
      } else {
        throw new Error(err?.message || 'Falha ao registrar conta no Firebase Authentication.');
      }
    }

    const fbUser = cred.user;
    await updateProfile(fbUser, { displayName: nomeLimpo });

    const agora = new Date().toISOString();
    const novoPerfil: UserProfile = {
      uid: fbUser.uid,
      nome: nomeLimpo,
      email: emailLimpo,
      role: roleDefinida,
      postoId: 'posto-matriz-01',
      ativo: true,
      criadoEm: agora,
      atualizadoEm: agora,
    };

    // Grava perfil no Firestore sem qualquer senha (a senha fica sob guarda do Firebase Auth)
    await setDoc(doc(db, 'usuarios', fbUser.uid), novoPerfil, { merge: true });
    setUserProfile(novoPerfil);
    setPostoId(novoPerfil.postoId);
  };

  /**
   * Login com E-mail e Senha exigindo autenticação Firebase válida.
   * Não utiliza Base64 e emite token criptográfico oficial do Firebase.
   */
  const signInWithCredentials = async (email: string, senha: string) => {
    const emailLimpo = email.trim().toLowerCase();
    if (!emailLimpo || !senha) {
      throw new Error('Preencha o e-mail e a senha para entrar.');
    }

    try {
      await signInWithEmailAndPassword(auth, emailLimpo, senha);
    } catch (err: any) {
      const code = err?.code;
      if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
        throw new Error('E-mail ou senha incorretos.');
      } else if (code === 'auth/wrong-password') {
        throw new Error('Senha incorreta.');
      } else if (code === 'auth/invalid-email') {
        throw new Error('Formato de e-mail inválido.');
      } else if (code === 'auth/too-many-requests') {
        throw new Error('Muitas tentativas sem sucesso. Aguarde alguns instantes e tente novamente.');
      } else {
        throw new Error(err?.message || 'Falha na autenticação. Verifique suas credenciais.');
      }
    }
  };

  const signOut = async () => {
    try {
      await fbSignOut(auth);
    } catch (e) {
      console.warn('Erro ao deslogar:', e);
    }
    setUserProfile(null);
    setCurrentUser(null);
    try {
      localStorage.removeItem(STORAGE_SESSAO_KEY);
    } catch {
      // ignore
    }
  };

  const setPostoAtivo = (novoPostoId: string) => {
    setPostoId(novoPostoId);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        usuariosCadastrados: contasNuvem,
        signInWithGoogle,
        signInWithCredentials,
        registerAccess,
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
