import { useEffect } from "react";
import { useRouter } from "next/router";
import "@/index.css";
import "@/App.css";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import AppShell from "@/components/layout/AppShell";

function RouteFrame({ Component, pageProps }) {
  const router = useRouter();
  const { user, ready } = useAuth();

  const isProtected =
    router.pathname === "/applicant" ||
    router.pathname === "/club" ||
    router.pathname.startsWith("/admin");

  useEffect(() => {
    if (ready && isProtected && !user) {
      router.replace("/login");
    }
  }, [isProtected, ready, router, user]);

  if (!ready) return null;
  if (isProtected && !user) return null;

  const page = <Component {...pageProps} />;
  return isProtected ? <AppShell>{page}</AppShell> : page;
}

export default function App({ Component, pageProps }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RouteFrame Component={Component} pageProps={pageProps} />
        <Toaster position="bottom-right" />
      </AuthProvider>
    </ThemeProvider>
  );
}