import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import type { BusinessProfile, UserProfile } from '../types/index.ts';

interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
  businessName: string;
  location: string;
  phone: string;
  currency: string;
}

interface BusinessSetupPayload {
  name: string;
  ownerName: string;
  phone: string;
  location: string;
  currency: string;
}

interface AuthContextValue {
  user: UserProfile | null;
  business: BusinessProfile | null;
  loading: boolean;
  authFetch: <T = unknown>(url: string, options?: RequestInit) => Promise<T>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (payload: RegisterPayload) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  setupBusiness: (payload: BusinessSetupPayload) => Promise<void>;
  updateBusinessState: (business: BusinessProfile) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Kept strictly in React memory (never persisted to localStorage/sessionStorage)
  const localTokenRef = useRef<string | null>(null);

  const getActiveToken = useCallback(async (): Promise<string | null> => {
    if (localTokenRef.current) {
      return localTokenRef.current;
    }
    if (auth.currentUser) {
      return await auth.currentUser.getIdToken();
    }
    return null;
  }, []);

  const authFetch = useCallback(
    async <T = unknown>(url: string, options: RequestInit = {}): Promise<T> => {
      const token = await getActiveToken();
      if (!token) {
        throw new Error('Authentication required. Please sign in.');
      }

      const headers = new Headers(options.headers);
      headers.set('Authorization', `Bearer ${token}`);
      if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const response = await fetch(url, {
        ...options,
        headers,
      });

      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? await response.json()
        : null;

      if (!response.ok) {
        if (response.status === 401) {
          localTokenRef.current = null;
          setUser(null);
          setBusiness(null);
        }
        const message =
          data && typeof data.error === 'string'
            ? data.error
            : `Request failed with status ${response.status}`;
        throw new Error(message);
      }

      return data as T;
    },
    [getActiveToken]
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (localTokenRef.current) {
        setLoading(false);
        return;
      }

      if (!fbUser) {
        setUser(null);
        setBusiness(null);
        setLoading(false);
        return;
      }

      try {
        const idToken = await fbUser.getIdToken();
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) {
          throw new Error('Failed to verify session');
        }
        const data = (await res.json()) as {
          user: UserProfile;
          business: BusinessProfile | null;
        };
        setUser(data.user);
        setBusiness(data.business);
      } catch (err) {
        console.error('Auth state sync error:', err);
        setUser(null);
        setBusiness(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to sign in.');
    }
    localTokenRef.current = data.token;
    setUser(data.user);
    setBusiness(data.business ?? null);
  }, []);

  const registerWithEmail = useCallback(async (payload: RegisterPayload) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed.');
    }
    localTokenRef.current = data.token;
    setUser(data.user);
    setBusiness(data.business ?? null);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    localTokenRef.current = null;
    const credential = await signInWithPopup(auth, googleAuthProvider);
    const idToken = await credential.user.getIdToken();
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to authenticate with Google.');
    }
    setUser(data.user);
    setBusiness(data.business ?? null);
  }, []);

  const setupBusiness = useCallback(
    async (payload: BusinessSetupPayload) => {
      const data = await authFetch<{
        user: UserProfile;
        business: BusinessProfile;
      }>('/api/business/setup', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setUser(data.user);
      setBusiness(data.business);
    },
    [authFetch]
  );

  const updateBusinessState = useCallback((updated: BusinessProfile) => {
    setBusiness(updated);
  }, []);

  const logout = useCallback(async () => {
    localTokenRef.current = null;
    if (auth.currentUser) {
      await signOut(auth);
    }
    setUser(null);
    setBusiness(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        business,
        loading,
        authFetch,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        setupBusiness,
        updateBusinessState,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
