import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  BarChart3,
  Download,
  FileText,
  Gavel,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Newspaper,
  Scale,
  SlidersHorizontal,
  Trophy,
  Users,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

/**
 * CommandPalette — global ⌘K / Ctrl+K launcher.
 *
 * Role-aware. Admins see navigation + report exports + sign out. Reviewers
 * see the subset of nav that applies to them. Applicants and clubs see a
 * lightweight set centered around their own dashboard.
 *
 * Mounted once at the AppShell level so the shortcut works on every
 * protected page. Hooked into the same `api.*` helpers used by the
 * Reports page so triggering "Download approved participants (ZIP)" here
 * runs the Phase 4 bulk endpoint end-to-end.
 */

const NAV_BY_ROLE = {
  admin: [
    { label: "Overview", href: "/admin/overview", icon: LayoutDashboard },
    { label: "Review Queue", href: "/admin/queue", icon: ListChecks },
    { label: "Workbench", href: "/admin/review", icon: Inbox },
    { label: "Settings", href: "/admin/settings", icon: SlidersHorizontal },
    { label: "Weigh-In", href: "/admin/weighin", icon: Scale },
    { label: "Users", href: "/admin/users", icon: Users },
    { label: "Brackets", href: "/admin/brackets", icon: Trophy },
    { label: "Appeals", href: "/admin/appeals", icon: Gavel },
    { label: "Reports", href: "/admin/reports", icon: BarChart3 },
    { label: "Circulars", href: "/admin/circulars", icon: Newspaper },
  ],
  reviewer: [
    { label: "Review Queue", href: "/admin/queue", icon: ListChecks },
    { label: "Workbench", href: "/admin/review", icon: Inbox },
    { label: "Appeals", href: "/admin/appeals", icon: Gavel },
  ],
  club: [
    { label: "Club Dashboard", href: "/club", icon: LayoutDashboard },
  ],
  applicant: [
    { label: "My Application", href: "/applicant", icon: LayoutDashboard },
  ],
};

const ADMIN_EXPORTS = [
  { label: "Download approved applications (Excel)", run: () => api.downloadApprovedXlsx() },
  { label: "Download approved participants (Excel)", run: () => api.downloadApprovedParticipantsXlsx() },
  { label: "Download approved participants (ZIP of PDFs)", run: () => api.downloadApprovedParticipantsZip() },
  { label: "Download application analytics (PDF)", run: () => api.downloadApplicationAnalyticsPdf() },
  { label: "Download application analytics (Excel)", run: () => api.downloadApplicationAnalyticsXlsx() },
  { label: "Download audit trail (Excel)", run: () => api.downloadAuditXlsx() },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { user, logout } = useAuth();

  useEffect(() => {
    function handleKey(event) {
      if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  if (!user) return null;

  const navItems = NAV_BY_ROLE[user.role] || [];
  const isAdmin = user.role === "admin";

  function navigate(href) {
    setOpen(false);
    router.push(href);
  }

  async function runExport(fn) {
    setOpen(false);
    try { await fn(); } catch (_err) { /* downloadFile handles error toasts */ }
  }

  function handleLogout() {
    setOpen(false);
    logout();
    router.push("/login");
  }

  const platformKey = typeof navigator !== "undefined" && /mac/i.test(navigator.platform) ? "⌘" : "Ctrl";

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={`Search commands, pages, exports — ${platformKey} K`} />
      <CommandList>
        <CommandEmpty>No commands match.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {navItems.map((item) => (
            <CommandItem key={item.href} onSelect={() => navigate(item.href)} value={`nav ${item.label}`}>
              <item.icon />
              <span>{item.label}</span>
              <CommandShortcut>{item.href}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        {isAdmin && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Exports">
              {ADMIN_EXPORTS.map((entry) => (
                <CommandItem key={entry.label} onSelect={() => runExport(entry.run)} value={`export ${entry.label}`}>
                  <Download />
                  <span>{entry.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Session">
          <CommandItem onSelect={handleLogout} value="logout sign out">
            <LogOut />
            <span>Sign out</span>
            <CommandShortcut>{user.email}</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => navigate("/")} value="home landing">
            <FileText />
            <span>Go to landing page</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
