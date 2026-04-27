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
      required: "required",
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
      eyebrow: "Sign in",
      title: "Welcome back.",
      subtitle: "Choose your account type, then sign in with your own email and password.",
      forgot: "Forgot password?",
      registerInstead: "Register instead",
      signingIn: "Signing in...",
      invalidCredentials: "Invalid email or password",
      networkError: "Cannot reach server. Check connection and try again",
      signInFailed: "Sign in failed",
      requiredEmailPassword: "Email and password are required",
      passwordPlaceholder: "Enter your password",
      welcomeBackRolePrefix: "Welcome back - signed in as",
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
      emailRequired: "Email is required",
      resetEmailHelp: "Enter your account email and we will send a password reset link.",
      resetEmailSent: "If the email exists, a reset link has been sent",
      resetLinkLabel: "Development reset link",
      resetTokenMissing: "Reset token is missing",
      passwordMin8: "Password must be at least 8 characters",
      passwordsDoNotMatch: "Passwords do not match",
      unableToProcess: "Unable to process request",
      unableToReset: "Unable to reset password",
      resetSuccess: "Password reset successful. Please sign in.",
      chooseNewPassword: "Choose a new password for your account.",
      min8Placeholder: "Minimum 8 characters",
      repeatNewPasswordPlaceholder: "Repeat your new password",
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
      required: "आवश्यक है",
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
      eyebrow: "साइन इन",
      title: "वापस स्वागत है।",
      subtitle: "अपना अकाउंट टाइप चुनें, फिर अपने ईमेल और पासवर्ड से साइन इन करें।",
      forgot: "पासवर्ड भूल गए?",
      registerInstead: "इसके बजाय रजिस्टर करें",
      signingIn: "साइन इन हो रहा है...",
      invalidCredentials: "ईमेल या पासवर्ड गलत है",
      networkError: "सर्वर से कनेक्ट नहीं हो पा रहा। कनेक्शन जांचकर फिर प्रयास करें",
      signInFailed: "साइन इन विफल रहा",
      requiredEmailPassword: "ईमेल और पासवर्ड आवश्यक हैं",
      passwordPlaceholder: "अपना पासवर्ड दर्ज करें",
      welcomeBackRolePrefix: "वापसी पर स्वागत है - इस भूमिका में साइन इन हुआ",
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
      emailRequired: "ईमेल आवश्यक है",
      resetEmailHelp: "अपना अकाउंट ईमेल दर्ज करें, हम पासवर्ड रीसेट लिंक भेजेंगे।",
      resetEmailSent: "यदि ईमेल मौजूद है, तो रीसेट लिंक भेज दिया गया है",
      resetLinkLabel: "डेवलपमेंट रीसेट लिंक",
      resetTokenMissing: "रीसेट टोकन नहीं मिला",
      passwordMin8: "पासवर्ड कम से कम 8 अक्षरों का होना चाहिए",
      passwordsDoNotMatch: "पासवर्ड मेल नहीं खाते",
      unableToProcess: "अनुरोध प्रोसेस नहीं हो सका",
      unableToReset: "पासवर्ड रीसेट नहीं हो सका",
      resetSuccess: "पासवर्ड सफलतापूर्वक रीसेट हुआ। कृपया साइन इन करें।",
      chooseNewPassword: "अपने अकाउंट के लिए नया पासवर्ड चुनें।",
      min8Placeholder: "कम से कम 8 अक्षर",
      repeatNewPasswordPlaceholder: "नया पासवर्ड दोबारा दर्ज करें",
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
