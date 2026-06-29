import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const ACCESS_PASSWORD = import.meta.env.VITE_ACCESS_PASSWORD ?? "pudo2026";

const STORAGE_KEY = "pudo_auth";

export async function validateCredentials(email: string, password: string): Promise<boolean> {
  await new Promise((r) => setTimeout(r, 500));
  return password === ACCESS_PASSWORD;
}

type AuthState = {
  isAuthenticated: boolean;
  email: string | null;
  login: (email: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { email?: string };
        if (parsed?.email) setEmail(parsed.email);
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  const login = (em: string) => {
    setEmail(em);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ email: em }));
    } catch {
      // ignore
    }
  };

  const logout = () => {
    setEmail(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  if (!hydrated) return null;

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!email, email, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
