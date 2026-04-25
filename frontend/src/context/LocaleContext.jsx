import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";

const STORAGE_KEY = "tos-ui-locale";

const LOCALE_LABELS = {
  en: "English",
  hi: "हिंदी",
};

const TRANSLATIONS = {
  en: {
    common: {
      language: "Language",
      english: "English",
      hindi: "Hindi",
      signIn: "Sign in",
      register: "Register",
      backToLogin: "Back to login",
      email: "Email",
      password: "Password",
      search: "Search",
      refresh: "Refresh",
    },
    landing: {
      nav: {
        whoFor: "Who it's for",
        workflow: "Workflow",
        admin: "Admin",
        numbers: "Numbers",
      },
      ctaSignIn: "Sign in",
      ctaRegister: "Register",
      ctaSoon: "Opens soon",
    },
    login: {
      title: "Welcome back.",
      subtitle: "Choose your account type, then sign in with your own email and password.",
      forgot: "Forgot password?",
      registerInstead: "Register instead",
      signingIn: "Signing in...",
      roleLabels: {
        admin: "Admin",
        reviewer: "Reviewer",
        state_coordinator: "State coordinator",
        club: "Club",
        applicant: "Fighter",
      },
      roleSubs: {
        admin: "Operations lead",
        reviewer: "Evaluates applicants",
        state_coordinator: "State-level operations",
        club: "Gym/team coordinator",
        applicant: "Individual applicant",
      },
    },
    auth: {
      recovery: "Account recovery",
      resetPassword: "Reset your password",
      setPassword: "Set a new password",
      newPassword: "New password",
      confirmPassword: "Confirm password",
      sendReset: "Send reset link",
      reset: "Reset password",
    },
  },
  hi: {
    common: {
      language: "भाषा",
      english: "अंग्रेज़ी",
      hindi: "हिंदी",
      signIn: "साइन इन",
      register: "रजिस्टर",
      backToLogin: "लॉगिन पर वापस जाएं",
      email: "ईमेल",
      password: "पासवर्ड",
      search: "खोजें",
      refresh: "रिफ्रेश",
    },
    landing: {
      nav: {
        whoFor: "यह किसके लिए है",
        workflow: "वर्कफ़्लो",
        admin: "एडमिन",
        numbers: "आंकड़े",
      },
      ctaSignIn: "साइन इन",
      ctaRegister: "रजिस्टर",
      ctaSoon: "जल्द खुलेगा",
    },
    login: {
      title: "वापस स्वागत है।",
      subtitle: "अपना अकाउंट टाइप चुनें, फिर अपने ईमेल और पासवर्ड से साइन इन करें।",
      forgot: "पासवर्ड भूल गए?",
      registerInstead: "इसके बजाय रजिस्टर करें",
      signingIn: "साइन इन हो रहा है...",
      roleLabels: {
        admin: "एडमिन",
        reviewer: "रिव्यूअर",
        state_coordinator: "स्टेट कोऑर्डिनेटर",
        club: "क्लब",
        applicant: "फाइटर",
      },
      roleSubs: {
        admin: "ऑपरेशंस लीड",
        reviewer: "आवेदनों का मूल्यांकन",
        state_coordinator: "राज्य-स्तरीय संचालन",
        club: "जिम/टीम कोऑर्डिनेटर",
        applicant: "व्यक्तिगत आवेदक",
      },
    },
    auth: {
      recovery: "अकाउंट रिकवरी",
      resetPassword: "पासवर्ड रीसेट करें",
      setPassword: "नया पासवर्ड सेट करें",
      newPassword: "नया पासवर्ड",
      confirmPassword: "पासवर्ड की पुष्टि करें",
      sendReset: "रीसेट लिंक भेजें",
      reset: "पासवर्ड रीसेट करें",
    },
  },
};

const LocaleContext = createContext(null);

function readStoredLocale() {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "hi") return stored;
  return null;
}

function resolveInitialLocale(userLocale) {
  const stored = readStoredLocale();
  if (stored) return stored;
  if (userLocale === "hi") return "hi";
  return "en";
}

function getNested(source, path) {
  return String(path || "")
    .split(".")
    .reduce((accumulator, key) => (accumulator && typeof accumulator === "object" ? accumulator[key] : undefined), source);
}

export function LocaleProvider({ children }) {
  const { user, ready } = useAuth();
  const [locale, setLocaleState] = useState("en");

  useEffect(() => {
    if (!ready) return;
    setLocaleState((current) => {
      const stored = readStoredLocale();
      if (stored) return stored;
      return user?.locale === "hi" ? "hi" : current || resolveInitialLocale(user?.locale);
    });
  }, [ready, user?.locale]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const value = useMemo(() => {
    const active = TRANSLATIONS[locale] ? locale : "en";
    return {
      locale: active,
      localeLabel: LOCALE_LABELS[active],
      setLocale: setLocaleState,
      availableLocales: ["en", "hi"],
      t: (path, fallback = "") => getNested(TRANSLATIONS[active], path) ?? getNested(TRANSLATIONS.en, path) ?? fallback ?? path,
    };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
