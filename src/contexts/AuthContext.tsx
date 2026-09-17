import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../config/firebase';
import { UserProfile, UserRole } from '../types';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInDemo: (role: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  setPostoAtivo: (postoId: string) => void;
  postoId: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [postoId, setPostoId] = useState<string>('posto-matriz-01');
  const [loading, setLoading] = useState<boolean>(true);

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
          } else {
            // Cria perfil inicial caso seja novo usuário
            const novoPerfil: UserProfile = {
              uid: fbUser.uid,
              nome: fbUser.displayName || fbUser.email?.split('@')[0] || 'Usuário Operacional',
              email: fbUser.email || '',
              role: 'GERENTE', // Padrão inicial com privilégios de gestão
              postoId: 'posto-matriz-01',
              ativo: true,
              criadoEm: new Date().toISOString(),
              atualizadoEm: new Date().toISOString(),
            };
            await setDoc(userDocRef, novoPerfil);
            setUserProfile(novoPerfil);
            setPostoId(novoPerfil.postoId);
          }
        } catch (err) {
          console.error('Erro ao carregar perfil do Firestore:', err);
        }
      } else {
        setUserProfile(null);
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
   * Modo rápido para alternância de perfis operacionais no pátio ou testes
   */
  const signInDemo = async (role: UserRole) => {
    const demoProfile: UserProfile = {
      uid: `demo-${role.toLowerCase()}`,
      nome: `Operador Demo (${role})`,
      email: `${role.toLowerCase()}@meuposto.com`,
      role,
      postoId: 'posto-matriz-01',
      ativo: true,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };
    setUserProfile(demoProfile);
    setPostoId(demoProfile.postoId);
  };

  const signOut = async () => {
    try {
      await fbSignOut(auth);
    } catch (e) {
      console.warn(e);
    }
    setUserProfile(null);
    setCurrentUser(null);
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
        signInWithGoogle,
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
