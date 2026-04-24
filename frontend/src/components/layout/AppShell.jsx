import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  LayoutDashboard,
  Users,
  Inbox,
  ListChecks,
  Gavel,
  BarChart3,
  Newspaper,
  Settings,
  SlidersHorizontal,
  Scale,
  LogOut,
  ChevronDown,
  Menu,
  Trophy,
  ArrowLeft,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import ThemeToggle from "@/components/shared/ThemeToggle";
import CommandPalette from "@/components/shared/CommandPalette";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function isActivePath(pathname, target) {
  if (target === "/admin/review") {
    return pathname === "/admin/review" || pathname === "/admin/review/[id]" || pathname.startsWith("/admin/review/");
  }

  return pathname === target || pathname.startsWith(`${target}/`);
}

const NAV = {
  admin: [
    { to: "/admin/overview", icon: LayoutDashboard, label: "Overview", shortLabel: "Home", testid: "nav-overview" },
    { to: "/admin/queue", icon: ListChecks, label: "Review Queue", shortLabel: "Queue", testid: "nav-queue" },
    { to: "/admin/review", icon: Inbox, label: "Workbench", shortLabel: "Desk", testid: "nav-workbench" },
    { to: "/admin/settings", icon: SlidersHorizontal, label: "Settings", shortLabel: "Settings", testid: "nav-settings" },
    { to: "/admin/weighin", icon: Scale, label: "Weigh-In", shortLabel: "Weigh-in", testid: "nav-weighin" },
    { to: "/admin/users", icon: Users, label: "Users", shortLabel: "Users", testid: "nav-users" },
    { to: "/admin/brackets", icon: Trophy, label: "Brackets", shortLabel: "Brackets", testid: "nav-brackets" },
    { to: "/admin/appeals", icon: Gavel, label: "Appeals", shortLabel: "Appeals", testid: "nav-appeals" },
    { to: "/admin/reports", icon: BarChart3, label: "Reports", shortLabel: "Reports", testid: "nav-reports" },
    { to: "/admin/circulars", icon: Newspaper, label: "Circulars", shortLabel: "Circulars", testid: "nav-circulars" },
  ],
  reviewer: [
    { to: "/admin/queue", icon: ListChecks, label: "Review Queue", shortLabel: "Queue", testid: "nav-queue" },
    { to: "/admin/review", icon: Inbox, label: "Workbench", shortLabel: "Desk", testid: "nav-workbench" },
    { to: "/admin/appeals", icon: Gavel, label: "Appeals", shortLabel: "Appeals", testid: "nav-appeals" },
  ],
  club: [
    { to: "/club", icon: LayoutDashboard, label: "Club Dashboard", shortLabel: "Club", testid: "nav-club" },
  ],
  applicant: [
    { to: "/applicant", icon: LayoutDashboard, label: "My Application", shortLabel: "My app", testid: "nav-applicant" },
  ],
};

const HOME_BY_ROLE = {
  admin: "/admin/overview",
  reviewer: "/admin/queue",
  club: "/club",
  applicant: "/applicant",
};

function Brand({ compact = false }) {
  return (
    <div className="flex items-center gap-2">
      <img src="/primal-logo.png" alt="Primal" className="size-8 rounded-lg object-cover" />
      <div className={`leading-tight ${compact ? "hidden min-[420px]:block" : ""}`}>
        <div className="font-display font-semibold tracking-tight text-[15px]">Primal</div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-tertiary">Fight operations</div>
      </div>
    </div>
  );
}

function RoleSwitcher() {
  const { user, logout } = useAuth();
  const router = useRouter();
  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid="user-menu-trigger"
          className="flex items-center gap-2.5 w-full rounded-xl border border-border bg-surface hover:bg-surface-muted px-2.5 py-2 transition-colors focus-ring"
        >
          <Avatar className="size-8 border border-border">
            <AvatarImage src={user.avatarUrl || ""} alt={user.name || "User"} />
            <AvatarFallback className="bg-surface-muted text-[11px] font-semibold">
              {user.avatar}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 text-left min-w-0">
            <div className="text-sm font-medium truncate">{user.name}</div>
            <div className="text-[11px] text-tertiary capitalize truncate">{user.role}</div>
          </div>
          <ChevronDown className="size-4 text-tertiary" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-60">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-tertiary">
          Signed in
        </DropdownMenuLabel>
        <DropdownMenuItem disabled>
          {user.email}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Settings className="size-3.5" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { logout(); router.push("/login"); }} data-testid="logout-btn">
          <LogOut className="size-3.5" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavLink({ item, compact = false, onNavigate }) {
  const router = useRouter();
  const active = isActivePath(router.pathname, item.to);
  return (
    <Link
      href={item.to}
      onClick={onNavigate}
      data-testid={item.testid}
      className={`group flex items-center gap-3 rounded-lg text-sm transition-all duration-200 ease-ios ${
        compact
          ? `justify-center px-3 py-3 ${active ? "bg-surface-muted text-foreground font-medium shadow-inner-top" : "text-secondary-muted hover:text-foreground hover:bg-surface-muted/60"}`
          : `px-3 py-2 ${active ? "bg-surface-muted text-foreground font-medium shadow-inner-top" : "text-secondary-muted hover:text-foreground hover:bg-surface-muted/60"}`
      }`}
    >
      <item.icon className={`size-[18px] shrink-0 ${active ? "text-primary" : ""}`} strokeWidth={1.75} />
      {!compact ? <span className="truncate">{item.label}</span> : <span className="sr-only">{item.label}</span>}
    </Link>
  );
}

function DesktopSidebar() {
  const { user } = useAuth();
  const nav = NAV[user?.role] || [];
  return (
    <aside className="hidden md:sticky md:top-0 md:flex md:h-screen md:self-start md:w-72 shrink-0 flex-col border-r border-border bg-surface/40 backdrop-blur-xl">
      <div className="px-5 py-5 border-b border-border flex justify-start">
        <Brand />
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-tertiary">
          Workspace
        </div>
        {nav.map((n) => (
          <NavLink key={n.to} item={n} />
        ))}
      </nav>
      <div className="p-3 border-t border-border space-y-2">
        <RoleSwitcher />
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-[10px] uppercase tracking-wider text-tertiary">Theme</span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

function MobileNavSheet({ nav }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="inline-flex size-10 items-center justify-center rounded-xl border border-border bg-surface hover:bg-surface-muted focus-ring">
          <Menu className="size-4" />
          <span className="sr-only">Open navigation</span>
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[88vw] max-w-sm border-r border-border bg-background p-0">
        <SheetHeader className="border-b border-border px-5 py-5">
          <Brand />
          <SheetTitle className="sr-only">Primal navigation</SheetTitle>
          <SheetDescription className="sr-only">Move between workspaces and organizer tools.</SheetDescription>
        </SheetHeader>
        <div className="flex h-full flex-col">
          <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
            {nav.map((n) => (
              <NavLink key={n.to} item={n} onNavigate={() => setOpen(false)} />
            ))}
          </nav>
          <div className="border-t border-border p-4 space-y-3">
            <RoleSwitcher />
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] uppercase tracking-wider text-tertiary">Theme</span>
              <ThemeToggle compact />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BackButton({ fallbackRoute, compact = false }) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackRoute || "/");
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className={`inline-flex items-center justify-center rounded-xl border border-border bg-surface hover:bg-surface-muted focus-ring ${compact ? "size-10" : "h-10 px-3 gap-2 text-sm font-medium"}`}
    >
      <ArrowLeft className="size-4" />
      {!compact ? <span>Back</span> : <span className="sr-only">Back</span>}
    </button>
  );
}

function DesktopTopbar({ nav }) {
  const { user } = useAuth();
  const router = useRouter();
  const current = nav.find((item) => isActivePath(router.pathname, item.to));
  const fallbackRoute = HOME_BY_ROLE[user?.role] || "/";
  const platformKey = typeof navigator !== "undefined" && /mac/i.test(navigator.platform) ? "⌘" : "Ctrl";

  return (
    <div className="hidden md:flex items-center justify-between gap-4 border-b border-border bg-background/80 px-6 py-4 backdrop-blur-xl">
      <div className="flex items-center gap-3 min-w-0">
        <BackButton fallbackRoute={fallbackRoute} />
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-tertiary">Workspace</div>
          <div className="truncate text-sm font-medium text-foreground">{current?.label || "Control panel"}</div>
        </div>
      </div>
      <div
        className="hidden lg:inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-2.5 py-1 text-[11px] text-tertiary"
        aria-hidden
        title="Open the command palette"
      >
        <span>Press</span>
        <kbd className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-foreground shadow-[inset_0_-1px_0_hsl(var(--border))]">{platformKey}</kbd>
        <kbd className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-foreground shadow-[inset_0_-1px_0_hsl(var(--border))]">K</kbd>
        <span>to search</span>
      </div>
    </div>
  );
}

function MobileTopbar({ nav }) {
  const router = useRouter();
  const { user } = useAuth();
  const current = nav.find((item) => isActivePath(router.pathname, item.to));
  const fallbackRoute = HOME_BY_ROLE[user?.role] || "/";
  return (
    <div data-testid="mobile-topbar" className="md:hidden sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b border-border bg-background/90 px-3 py-2 backdrop-blur-xl supports-[padding:max(0px)]:pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="flex items-center gap-3 min-w-0">
        <BackButton fallbackRoute={fallbackRoute} compact />
        <MobileNavSheet nav={nav} />
        <Brand compact />
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle compact />
        <Avatar className="size-8 border border-border">
          <AvatarImage src={user?.avatarUrl || ""} alt={user?.name || "User"} />
          <AvatarFallback className="bg-surface-muted text-[11px] font-semibold">
            {user?.avatar || "?"}
          </AvatarFallback>
        </Avatar>
      </div>
    </div>
  );
}

function MobileBottomNav({ nav }) {
  const router = useRouter();
  const primary = useMemo(() => nav.slice(0, Math.min(5, nav.length)), [nav]);
  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-xl px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2">
      <div className="grid grid-cols-5 gap-1">
        {primary.map((item) => {
          const active = isActivePath(router.pathname, item.to);
          return (
            <Link
              key={item.to}
              href={item.to}
              className={`flex min-h-14 flex-col items-center justify-center rounded-xl px-2 text-[10px] font-medium transition-colors ${
                active ? "bg-surface-muted text-foreground" : "text-tertiary hover:bg-surface-muted/60 hover:text-foreground"
              }`}
            >
              <item.icon className={`size-[18px] ${active ? "text-primary" : ""}`} strokeWidth={1.75} />
              <span className="mt-1 truncate max-w-full">{item.shortLabel || item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default function AppShell({ children }) {
  const { user } = useAuth();
  const nav = NAV[user?.role] || [];

  return (
    <div className="flex min-h-[100dvh] items-start overflow-x-clip bg-[radial-gradient(circle_at_top,hsla(var(--surface-muted),0.9),transparent_48%),hsl(var(--background))]">
      <a href="#main-content" className="skip-to-main">Skip to main content</a>
      <DesktopSidebar />
      <main id="main-content" className="flex min-w-0 flex-1 flex-col" tabIndex={-1}>
        <MobileTopbar nav={nav} />
        <DesktopTopbar nav={nav} />
        <div className="flex-1 min-w-0 app-shell-safe-bottom md:pb-0">{children}</div>
        <MobileBottomNav nav={nav} />
      </main>
      <CommandPalette />
    </div>
  );
}
