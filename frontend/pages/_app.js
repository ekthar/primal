import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { AnimatePresence, motion } from "framer-motion";
import "@/index.css";
import "@/App.css";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import AppShell from "@/components/layout/AppShell";
import { FullPageLoader, RouteProgressBar } from "@/components/shared/PrimalLoader";

/* Phase 7 · Subtle route fade. framer-motion's opacity+translate pair
   respects the global `prefers-reduced-motion` CSS reset because the
   user's media-query override drops transitions to 0.01ms. */
const routeVariants = {
  initial: { opacity: 0, y: 6 },
  enter:   { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.25, 1, 0.5, 1] } },
  exit:    { opacity: 0, y: -4, transition: { duration: 0.14, ease: "easeIn" } },
};

function AnimatedPage({ children, routeKey }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={routeKey}
        variants={routeVariants}
        initial="initial"
        animate="enter"
        exit="exit"
        className="flex-1 min-w-0"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

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

  const page = (
    <AnimatedPage routeKey={router.asPath}>
      <Component {...pageProps} />
    </AnimatedPage>
  );

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
