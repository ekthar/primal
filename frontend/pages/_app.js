import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import "@/index.css";
import "@/App.css";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import AppShell from "@/components/layout/AppShell";
import { FullPageLoader, RouteProgressBar } from "@/components/shared/PrimalLoader";

function RouteFrame({ Component, pageProps }) {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [routeLoading, setRouteLoading] = useState(false);

  const isProtected =
    router.pathname === "/applicant" ||
    router.pathname === "/club" ||
    router.pathname.startsWith("/admin");

  useEffect(() => {
    const handleStart = () => setRouteLoading(true);
    const handleDone = () => setRouteLoading(false);

    router.events.on("routeChangeStart", handleStart);
    router.events.on("routeChangeComplete", handleDone);
    router.events.on("routeChangeError", handleDone);

    return () => {
      router.events.off("routeChangeStart", handleStart);
      router.events.off("routeChangeComplete", handleDone);
      router.events.off("routeChangeError", handleDone);
    };
  }, [router.events]);

  useEffect(() => {
    if (ready && isProtected && !user) {
      router.replace("/login");
    }
  }, [isProtected, ready, router, user]);

  if (!ready) {
    return <FullPageLoader message="Preparing your fight desk..." />;
  }

  if (isProtected && !user) {
    return <FullPageLoader message="Routing you to secure sign-in..." />;
  }

  const page = <Component {...pageProps} />;

  if (routeLoading) {
    return (
      <>
        <RouteProgressBar active />
        {isProtected ? <AppShell>{page}</AppShell> : page}
      </>
    );
  }

  return (
    <>
      <RouteProgressBar active={false} />
      {isProtected ? <AppShell>{page}</AppShell> : page}
    </>
  );
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
