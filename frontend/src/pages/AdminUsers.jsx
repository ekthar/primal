import { useEffect, useMemo, useState } from "react";
import { UserPlus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/context/LocaleContext";
import api from "@/lib/api";
import { toast } from "sonner";

const ROLE_OPTIONS = ["reviewer", "state_coordinator", "club", "applicant", "admin"];

export default function AdminUsers() {
  const { user } = useAuth();
  const locale = useLocale();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roleFilter, setRoleFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [stateOptions, setStateOptions] = useState([]);
  const [draft, setDraft] = useState({
    name: "",
    email: "",
    password: "",
    role: "reviewer",
    stateCode: "",
  });

  useEffect(() => {
    loadUsers();
  }, [roleFilter]);

  useEffect(() => {
    api.publicIndiaStates().then(({ data }) => {
      setStateOptions(data?.states || []);
    }).catch(() => setStateOptions([]));
  }, []);

  async function loadUsers() {
    setLoading(true);
    const { data, error } = await api.adminListUsers({
      role: roleFilter === "all" ? undefined : roleFilter,
      q: query || undefined,
      limit: 200,
      offset: 0,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message || "Failed to load users");
      return;
    }
    setUsers(data?.users || []);
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.email.trim() || !draft.password.trim()) {
      toast.error("Name, email, and password are required");
      return;
    }

    setSaving(true);
    const { error } = await api.adminCreateUser({
      name: draft.name.trim(),
      email: draft.email.trim().toLowerCase(),
      password: draft.password,
      role: draft.role,
      stateCode: draft.role === "state_coordinator" ? draft.stateCode : undefined,
      locale: "en",
    });
    setSaving(false);

    if (error) {
      toast.error(error.message || "Failed to create user");
      return;
    }

    toast.success(`${draft.role} account created`);
    setDraft({ name: "", email: "", password: "", role: "reviewer", stateCode: "" });
    loadUsers();
  }

  const filteredUsers = useMemo(() => {
    if (!query.trim()) return users;
    const q = query.toLowerCase();
    return users.filter((entry) =>
      entry.name?.toLowerCase().includes(q) || entry.email?.toLowerCase().includes(q)
    );
  }, [query, users]);

  if (user?.role !== "admin") {
    return <div className="p-10 text-sm text-secondary-muted">{locale?.t("adminUsers.adminOnly", "Only admin can manage users.") ?? "Only admin can manage users."}</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">{locale?.t("roles.admin", "Admin") ?? "Admin"}</div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-1">{locale?.t("pages.adminUsers.title", "Users") ?? "Users"}</h1>
        <p className="text-sm text-secondary-muted mt-2">{locale?.t("pages.adminUsers.subtitle", "Manage admins, reviewers, clubs, and fighters") ?? "Manage admins, reviewers, clubs, and fighters"}</p>
      </div>

      <section className="rounded-3xl border border-border bg-surface elev-card p-6">
        <h2 className="font-display text-2xl font-semibold tracking-tight">{locale?.t("adminUsers.createAccount", "Create account") ?? "Create account"}</h2>
        <form className="mt-4 grid md:grid-cols-2 gap-4" onSubmit={handleCreate}>
          <div>
            <Label className="text-[11px] uppercase tracking-wider font-semibold text-secondary-muted">{locale?.t("fields.name", "Name") ?? "Name"}</Label>
            <Input
              className="mt-1.5 h-11 bg-background"
              value={draft.name}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
            />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider font-semibold text-secondary-muted">{locale?.t("fields.email", "Email") ?? "Email"}</Label>
            <Input
              type="email"
              className="mt-1.5 h-11 bg-background"
              value={draft.email}
              onChange={(event) => setDraft((prev) => ({ ...prev, email: event.target.value }))}
            />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider font-semibold text-secondary-muted">{locale?.t("common.password", "Password") ?? "Password"}</Label>
            <Input
              type="password"
              className="mt-1.5 h-11 bg-background"
              value={draft.password}
              onChange={(event) => setDraft((prev) => ({ ...prev, password: event.target.value }))}
            />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider font-semibold text-secondary-muted">{locale?.t("fields.role", "Role") ?? "Role"}</Label>
            <Select value={draft.role} onValueChange={(value) => setDraft((prev) => ({ ...prev, role: value }))}>
              <SelectTrigger className="mt-1.5 h-11 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role} value={role}>{locale?.t(`roles.${role}`, role) ?? role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {draft.role === "state_coordinator" ? (
            <div>
              <Label className="text-[11px] uppercase tracking-wider font-semibold text-secondary-muted">{locale?.t("fields.state", "State") ?? "State"}</Label>
              <Select value={draft.stateCode} onValueChange={(value) => setDraft((prev) => ({ ...prev, stateCode: value }))}>
                <SelectTrigger className="mt-1.5 h-11 bg-background">
                  <SelectValue placeholder={locale?.t("adminUsers.selectState", "Select state") ?? "Select state"} />
                </SelectTrigger>
                <SelectContent>
                  {stateOptions.map((state) => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="md:col-span-2">
            <Button type="submit" className="h-11" disabled={saving}>
              <UserPlus className="size-4 mr-1.5" /> {saving ? (locale?.t("adminUsers.creating", "Creating...") ?? "Creating...") : (locale?.t("adminUsers.createUser", "Create user") ?? "Create user")}
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-3xl border border-border bg-surface elev-card p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-display text-2xl font-semibold tracking-tight">{locale?.t("adminUsers.accounts", "Accounts") ?? "Accounts"}</h2>
          <div className="flex items-center gap-2">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-10 min-w-36 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{locale?.t("adminUsers.allRoles", "all roles") ?? "all roles"}</SelectItem>
                {ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role} value={role}>{locale?.t(`roles.${role}`, role) ?? role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="size-4 text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                className="h-10 pl-9 bg-background"
                placeholder={locale?.t("adminUsers.searchPlaceholder", "Search name/email") ?? "Search name/email"}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Button variant="outline" className="h-10" onClick={loadUsers}>{locale?.t("actions.refresh", "Refresh") ?? "Refresh"}</Button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          {loading ? (
            <div className="py-6 text-sm text-secondary-muted">{locale?.t("adminUsers.loading", "Loading users...") ?? "Loading users..."}</div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-tertiary font-semibold border-b border-border">
                  <th className="py-3">{locale?.t("fields.name", "Name") ?? "Name"}</th>
                  <th className="py-3">{locale?.t("fields.email", "Email") ?? "Email"}</th>
                  <th className="py-3">{locale?.t("fields.role", "Role") ?? "Role"}</th>
                  <th className="py-3">{locale?.t("fields.state", "State") ?? "State"}</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-b-0">
                    <td className="py-3 text-sm">{entry.name}</td>
                    <td className="py-3 text-sm">{entry.email}</td>
                    <td className="py-3 text-sm">{locale?.t(`roles.${entry.role}`, entry.role) ?? entry.role}</td>
                    <td className="py-3 text-sm">{entry.stateCode || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && filteredUsers.length === 0 && (
            <div className="py-6 text-sm text-secondary-muted">{locale?.t("adminUsers.noUsers", "No users found.") ?? "No users found."}</div>
          )}
        </div>
      </section>
    </div>
  );
}
