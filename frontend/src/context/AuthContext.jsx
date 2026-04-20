import { createContext, useContext, useEffect, useState } from "react";
import api, { clearSession, getAccessToken, setSession } from "@/lib/api";

const AuthContext = createContext(null);
const STORAGE_KEY = "tos-auth-user";

function routeForRole(role) {
  return {
    admin: "/admin/overview",
    reviewer: "/admin/queue",
    club: "/club",
    applicant: "/applicant",
  }[role] || "/";
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function bootstrap() {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) setUser(JSON.parse(stored));
        const token = getAccessToken();
        if (!token) {
          if (!ignore) setUser(null);
          return;
        }
        const { data, error } = await api.me();
        if (!ignore) {
          if (error) {
            clearSession();
            setUser(null);
          } else {
            setUser(data.user);
          }
        }
      } catch {
        if (!ignore) setUser(null);
      } finally {
        if (!ignore) setReady(true);
      }
    }
    bootstrap();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (user) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(STORAGE_KEY);
  }, [ready, user]);

  const login = async ({ email, password }) => {
    const { data, error } = await api.login({ email, password });
    if (error) return { user: null, error };
    setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    setUser(data.user);
    return { user: data.user, error: null, nextRoute: routeForRole(data.user.role) };
  };

  const register = async (payload) => {
    const { data, error } = await api.register(payload);
    if (error) return { user: null, error };
    setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    setUser(data.user);
    return { user: data.user, error: null, nextRoute: routeForRole(data.user.role) };
  };

  const logout = async () => {
    await api.logout();
    clearSession();
    setUser(null);
  };

  const refreshMe = async () => {
    const { data, error } = await api.me();
    if (!error) setUser(data.user);
    return { data, error };
  };

  return (
    <AuthContext.Provider value={{ user, ready, login, logout, refreshMe, register }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
