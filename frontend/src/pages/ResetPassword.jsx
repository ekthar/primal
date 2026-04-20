import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ThemeToggle from "@/components/shared/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";

export default function ResetPassword() {
  const router = useRouter();
  const token = useMemo(() => {
    const raw = Array.isArray(router.query.token) ? router.query.token[0] : router.query.token;
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (typeof window === "undefined") return "";

    try {
      const parsed = new URL(window.location.href);
      const fromSearch = parsed.searchParams.get("token");
      if (fromSearch && fromSearch.trim()) return fromSearch.trim();

      const hashRaw = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
      const fromHash = new URLSearchParams(hashRaw).get("token");
      if (fromHash && fromHash.trim()) return fromHash.trim();
    } catch {
      // Ignore malformed URL parsing and fall through to empty token.
    }

    return "";
  }, [router.asPath, router.query.token]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!token) {
      toast.error("Reset token is missing");
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    const { error } = await api.resetPassword({ token, newPassword });
    setLoading(false);

    if (error) {
      toast.error(error.message || "Unable to reset password");
      return;
    }

    toast.success("Password reset successful. Please sign in.");
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between">
          <Link href="/login" className="text-sm text-secondary-muted hover:text-foreground">Back to login</Link>
          <ThemeToggle compact />
        </div>

        <div className="rounded-3xl border border-border bg-surface elev-card p-7 mt-6">
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Account recovery</div>
          <h1 className="font-display text-3xl font-semibold tracking-tight mt-2">Set a new password</h1>
          <p className="text-sm text-secondary-muted mt-2">Choose a new password for your account.</p>

          <form onSubmit={submit} className="space-y-4 mt-6">
            <div>
              <Label className="text-[11px] uppercase tracking-wider font-semibold text-secondary-muted">New password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-1.5 h-11 bg-surface"
                placeholder="Minimum 8 characters"
              />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider font-semibold text-secondary-muted">Confirm password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-1.5 h-11 bg-surface"
                placeholder="Repeat your new password"
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full h-11 bg-primary hover:bg-primary-hover text-primary-foreground">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <>Reset password <ArrowRight className="size-4 ml-1" /></>}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
