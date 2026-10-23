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
import { collection, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../config/firebase';
import { UserProfile, UserRole } from '../types';

export const BOOTSTRAP_ADMIN_EMAIL = 'ubirajaraaux@gmail.com';

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
}

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  authError: string | null;
  usuariosCadastrados: ContaCadastradaLocal[];
  signInWithGoogle: () => Promise<void>;
  signInWithCredentials: (email: string, senha: string) => Promise<void>;
  registerAccess: (params: RegisterAccessParams) => Promise<void>;
  signOut: () => Promise<void>;
  setPostoAtivo: (postoId: string) => void;
  postoId: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [postoId, setPostoId] = useState<string>('posto-matriz-01');
  const [loading, setLoading] = useState<boolean>(true);
  const [contasNuvem, setContasNuvem] = useState<ContaCadastradaLocal[]>([]);

  // Sincronização em tempo real da equipe do posto (somente com perfil ativo e autenticado)
  useEffect(() => {
    if (!currentUser || !userProfile || !userProfile.ativo) {
      setContasNuvem([]);
      return;
    }

    const unsubUsuarios = onSnapshot(
      collection(db, 'usuarios'),
      (snap) => {
        const lista: ContaCadastradaLocal[] = snap.docs
          .map((d) => {
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
          })
          // Filtra usuários para manter isolamento de posto (a menos que seja gestor)
          .filter((u) => {
            if (userProfile.role === 'GERENTE' || userProfile.role === 'ADMINISTRADOR') return true;
            return u.postoId === userProfile.postoId;
          });

        setContasNuvem(lista);
      },
      (err) => {
        console.warn('[Segurança] Listener de usuários restrito pelas regras:', err);
      }
    );

    return () => unsubUsuarios();
  }, [currentUser, userProfile]);

  // Autenticação Central Firebase Auth Oficial com Zero Confiança em LocalStorage
  useEffect(() => {
    // Elimina qualquer resquício de sessão antiga baseada em localStorage
    try {
      localStorage.removeItem('meuposto_sessao_ativa_v1');
    } catch {
      // ignore
    }

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setCurrentUser(fbUser);
      setAuthError(null);

      if (fbUser) {
        try {
          const userDocRef = doc(db, 'usuarios', fbUser.uid);
          const snap = await getDoc(userDocRef);

          if (snap.exists()) {
            const data = snap.data() as UserProfile;

            // Verificação de Status Ativo (Regra de Bloqueio Imediato de Contas Inativas)
            if (!data.ativo) {
              console.warn(`[Segurança] Usuário ${fbUser.uid} autenticado, mas inativo no sistema.`);
              setUserProfile(null);
              setAuthError('Sua conta está desativada no sistema. Entre em contato com o gerente do seu posto.');
            } else {
              setUserProfile(data);
              if (data.postoId) setPostoId(data.postoId);
              setAuthError(null);
            }
          } else {
            // Documento de perfil inexistente:
            // Se for o administrador legítimo pré-autorizado (Bootstrap Admin), provisiona o perfil inicial de GERENTE
            if (fbUser.email && fbUser.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
              const agora = new Date().toISOString();
              const adminPerfil: UserProfile = {
                uid: fbUser.uid,
                nome: fbUser.displayName || 'Administrador Geral',
                email: fbUser.email.toLowerCase(),
                role: 'GERENTE',
                postoId: 'posto-matriz-01',
                ativo: true,
                criadoEm: agora,
                atualizadoEm: agora,
              };

              await setDoc(userDocRef, adminPerfil, { merge: true });
              setUserProfile(adminPerfil);
              setPostoId(adminPerfil.postoId);
              setAuthError(null);
            } else {
              // Usuário sem perfil cadastrado na nuvem: não autoriza acesso
              console.warn(`[Segurança] Usuário ${fbUser.uid} sem perfil em /usuarios.`);
              setUserProfile(null);
              setAuthError('Perfil não localizado no sistema. Solicite ao gestor do posto para cadastrar seu acesso.');
            }
          }
        } catch (err) {
          console.error('[Segurança] Falha de leitura do perfil no Firestore:', err);
          setUserProfile(null);
          setAuthError('Falha ao validar seu perfil de acesso na nuvem. Verifique a conexão com o servidor.');
        }
      } else {
        // Desconectado do Firebase Auth -> Estado limpo e sem autorização
        setUserProfile(null);
        setAuthError(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error('Erro no login Google:', err);
      setAuthError(err?.message || 'Falha na autenticação via Google.');
      throw err;
    }
  };

  /**
   * Cadastro seguro de novo operador no Firebase Authentication oficial.
   * Não grava senhas em Base64 e impede autoproclamação de privilégios.
   * Todo novo cadastro recebe compulsoriamente a função OPERADOR,
   * a menos que seja o administrador bootstrap verificado.
   */
  const registerAccess = async ({ nome, email, senha }: RegisterAccessParams) => {
    setAuthError(null);
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

    // Regra Segura de Papéis: Somente o e-mail bootstrap oficial pode iniciar como GERENTE.
    // Qualquer outro cadastro recebe obrigatoriamente a função OPERADOR.
    const roleDefinida: UserRole =
      emailLimpo === BOOTSTRAP_ADMIN_EMAIL.toLowerCase() ? 'GERENTE' : 'OPERADOR';

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

    // Grava perfil no Firestore sem senhas (sob custódia do Firebase Auth)
    await setDoc(doc(db, 'usuarios', fbUser.uid), novoPerfil, { merge: true });
    setUserProfile(novoPerfil);
    setPostoId(novoPerfil.postoId);
  };

  /**
   * Login com E-mail e Senha exigindo autenticação Firebase válida.
   */
  const signInWithCredentials = async (email: string, senha: string) => {
    setAuthError(null);
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
    setAuthError(null);
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
        authError,
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
