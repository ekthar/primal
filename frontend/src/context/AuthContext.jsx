import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

const STORAGE_KEY = "tos-auth";

const MOCK_USERS = {
  admin: { id: "u-admin", name: "Mei Tanaka", email: "mei@tournamentos.io", role: "admin", avatar: "MT" },
  reviewer: { id: "u-rev", name: "Luca Moretti", email: "luca@tournamentos.io", role: "reviewer", avatar: "LM" },
  club: { id: "u-club", name: "Sakura Gym", email: "ops@sakuragym.jp", role: "club", avatar: "SG" },
  applicant: { id: "u-app", name: "Diego Ruiz", email: "diego.ruiz@mail.com", role: "applicant", avatar: "DR" },
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY);
  }, [user]);

  const login = (role = "admin") => {
    const u = MOCK_USERS[role] || MOCK_USERS.admin;
    setUser({ ...u, token: "mock-jwt." + btoa(u.email) + ".sig" });
    return u;
  };
  const logout = () => setUser(null);
  const switchRole = (role) => login(role);

  return (
    <AuthContext.Provider value={{ user, login, logout, switchRole, MOCK_USERS }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
