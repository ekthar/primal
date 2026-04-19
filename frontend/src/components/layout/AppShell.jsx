import { Outlet, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Inbox,
  ListChecks,
  Gavel,
  BarChart3,
  Settings,
  LogOut,
  ChevronDown,
  CircleDot,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import ThemeToggle from "@/components/shared/ThemeToggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";

const NAV = {
  admin: [
    { to: "/admin/queue", icon: ListChecks, label: "Review Queue", testid: "nav-queue" },
    { to: "/admin/review", icon: Inbox, label: "Workbench", testid: "nav-workbench" },
    { to: "/admin/appeals", icon: Gavel, label: "Appeals", testid: "nav-appeals" },
    { to: "/admin/reports", icon: BarChart3, label: "Reports", testid: "nav-reports" },
  ],
  reviewer: [
    { to: "/admin/queue", icon: ListChecks, label: "Review Queue", testid: "nav-queue" },
    { to: "/admin/review", icon: Inbox, label: "Workbench", testid: "nav-workbench" },
    { to: "/admin/appeals", icon: Gavel, label: "Appeals", testid: "nav-appeals" },
  ],
  club: [
    { to: "/club", icon: LayoutDashboard, label: "Club Dashboard", testid: "nav-club" },
    { to: "/admin/reports", icon: BarChart3, label: "Reports", testid: "nav-reports-club" },
  ],
  applicant: [
    { to: "/applicant", icon: LayoutDashboard, label: "My Application", testid: "nav-applicant" },
  ],
};

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="size-8 rounded-lg bg-foreground text-background flex items-center justify-center font-display font-bold text-sm">
        T
      </div>
      <div className="leading-tight">
        <div className="font-display font-semibold tracking-tight text-[15px]">TournamentOS</div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-tertiary">MMA · Sanctioning</div>
      </div>
    </div>
  );
}

function RoleSwitcher() {
  const { user, switchRole, logout, MOCK_USERS } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  const go = (role) => {
    switchRole(role);
    const routes = { admin: "/admin/queue", reviewer: "/admin/queue", club: "/club", applicant: "/applicant" };
    navigate(routes[role] || "/");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid="user-menu-trigger"
          className="flex items-center gap-2.5 w-full rounded-xl border border-border bg-surface hover:bg-surface-muted px-2.5 py-2 transition-colors focus-ring"
        >
          <Avatar className="size-8 border border-border">
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
          Switch role (demo)
        </DropdownMenuLabel>
        {Object.keys(MOCK_USERS).map((r) => (
          <DropdownMenuItem key={r} onClick={() => go(r)} data-testid={`switch-role-${r}`} className="capitalize">
            <CircleDot className={`size-3.5 ${user.role === r ? "text-primary" : "text-tertiary"}`} />
            {r}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Settings className="size-3.5" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { logout(); navigate("/login"); }} data-testid="logout-btn">
          <LogOut className="size-3.5" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Sidebar() {
  const { user } = useAuth();
  const nav = NAV[user?.role] || [];
  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-surface/40 backdrop-blur-xl">
      <div className="px-5 py-5 border-b border-border">
        <Brand />
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-tertiary">
          Workspace
        </div>
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end
            data-testid={n.testid}
            className={({ isActive }) =>
              `group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 ease-ios ${
                isActive
                  ? "bg-surface-muted text-foreground font-medium shadow-inner-top"
                  : "text-secondary-muted hover:text-foreground hover:bg-surface-muted/60"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <n.icon className={`size-[17px] ${isActive ? "text-primary" : ""}`} strokeWidth={1.75} />
                <span>{n.label}</span>
              </>
            )}
          </NavLink>
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

function MobileTopbar() {
  const { user } = useAuth();
  const loc = useLocation();
  const pageName = loc.pathname.split("/").pop() || "Dashboard";
  return (
    <div data-testid="mobile-topbar" className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 border-b border-border bg-background/80 backdrop-blur-xl">
      <Brand />
      <div className="flex items-center gap-2">
        <ThemeToggle compact />
        <Avatar className="size-8 border border-border">
          <AvatarFallback className="bg-surface-muted text-[11px] font-semibold">
            {user?.avatar || "?"}
          </AvatarFallback>
        </Avatar>
      </div>
    </div>
  );
}

export default function AppShell() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <MobileTopbar />
        <div className="flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
