'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  signOut as firebaseSignOut, 
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth, googleProvider, getDb } from '@/lib/firebase';

export type UserRole = 'teacher' | 'student';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  userRole: UserRole | null;
  setUserRole: (role: UserRole) => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name: string, role?: UserRole) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  authError: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [userRole, setUserRoleState] = useState<UserRole | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Helper to persist and sync role state
  const saveRoleForUser = async (uid: string, role: UserRole) => {
    setUserRoleState(role);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`lumina_user_role_${uid}`, role);
      try {
        const db = await getDb();
        if (db) {
          const { doc, setDoc } = await import('firebase/firestore');
          await setDoc(doc(db, 'users', uid), { role, updatedAt: new Date().toISOString() }, { merge: true });
        }
      } catch {
        // Continue gracefully if Firestore is offline/unreachable
      }
    }
  };

  // Fetch persisted user role
  const loadUserRole = async (uid: string): Promise<UserRole | null> => {
    // Check local storage first
    if (typeof window !== 'undefined') {
      const cachedRole = localStorage.getItem(`lumina_user_role_${uid}`) as UserRole | null;
      if (cachedRole === 'teacher' || cachedRole === 'student') {
        return cachedRole;
      }
      // Try loading from Firestore lazily
      try {
        const db = await getDb();
        if (db) {
          const { doc, getDoc } = await import('firebase/firestore');
          const userDoc = await getDoc(doc(db, 'users', uid));
          if (userDoc.exists() && userDoc.data().role) {
            const role = userDoc.data().role as UserRole;
            localStorage.setItem(`lumina_user_role_${uid}`, role);
            return role;
          }
        }
      } catch {
        // Ignore Firestore read error
      }
    }
    return null;
  };

  useEffect(() => {
    if (typeof window === 'undefined' || !auth || typeof auth.onAuthStateChanged !== 'function') {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const role = await loadUserRole(currentUser.uid);
        setUserRoleState(role);
      } else {
        setUserRoleState(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const clearError = () => setAuthError(null);

  const formatAuthError = (err: any): string => {
    const code = err?.code || '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Invalid email or password. Please try again.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists. Try signing in instead.';
      case 'auth/weak-password':
        return 'Password should be at least 6 characters long.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/popup-closed-by-user':
        return 'Google Sign-In popup was closed before completion.';
      case 'auth/popup-blocked':
        return 'Sign-In popup was blocked by your browser. Please allow popups for this site.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your internet connection.';
      default:
        return err?.message || 'An authentication error occurred. Please try again.';
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    setAuthError(null);
    try {
      const result = await signInWithEmailAndPassword(auth, email, pass);
      const role = await loadUserRole(result.user.uid);
      if (role) setUserRoleState(role);
    } catch (err: any) {
      const msg = formatAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const signUpWithEmail = async (email: string, pass: string, name: string, role?: UserRole) => {
    setAuthError(null);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, pass);
      if (name.trim()) {
        await updateProfile(result.user, { displayName: name });
      }
      if (role) {
        await saveRoleForUser(result.user.uid, role);
      }
    } catch (err: any) {
      const msg = formatAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const loginWithGoogle = async () => {
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const role = await loadUserRole(result.user.uid);
      if (role) setUserRoleState(role);
    } catch (err: any) {
      const msg = formatAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const logout = async () => {
    setAuthError(null);
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setUserRoleState(null);
    } catch (err: any) {
      setAuthError(err?.message || 'Error signing out.');
    }
  };

  const resetPassword = async (email: string) => {
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err: any) {
      const msg = formatAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const setUserRole = async (role: UserRole) => {
    if (user) {
      await saveRoleForUser(user.uid, role);
    } else {
      setUserRoleState(role);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        userRole,
        setUserRole,
        loginWithEmail,
        signUpWithEmail,
        loginWithGoogle,
        logout,
        resetPassword,
        authError,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
