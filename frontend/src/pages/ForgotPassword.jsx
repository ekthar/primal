import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ThemeToggle from "@/components/shared/ThemeToggle";
import LocaleToggle from "@/components/shared/LocaleToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { useLocale } from "@/context/LocaleContext";

export default function ForgotPassword() {
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState("");

  const toCurrentOriginResetUrl = (urlValue) => {
    const raw = String(urlValue || "").trim();
    if (!raw) return "";
    try {
      const parsed = new URL(raw);
      const token = parsed.searchParams.get("token");
      if (!token || typeof window === "undefined") return raw;
      return `${window.location.origin}/reset-password?token=${encodeURIComponent(token)}`;
    } catch {
      return raw;
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim()) {
      toast.error(locale?.t("common.email", "Email") + " required");
      return;
    }

    setLoading(true);
    const { data, error } = await api.forgotPassword({ email: email.trim().toLowerCase() });
    setLoading(false);

    if (error) {
      toast.error(error.message || "Unable to process request");
      return;
    }

    setDevResetUrl(toCurrentOriginResetUrl(data?.resetUrl || ""));
    toast.success("If the email exists, a reset link has been sent");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between">
          <Link href="/login" className="text-sm text-secondary-muted hover:text-foreground">{locale?.t("common.backToLogin", "Back to login")}</Link>
          <div className="flex items-center gap-2">
            <LocaleToggle compact />
            <ThemeToggle compact />
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-surface elev-card p-7 mt-6">
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Account recovery</div>
          <h1 className="font-display text-3xl font-semibold tracking-tight mt-2">{locale?.t("auth.resetPassword", "Reset your password")}</h1>
          <p className="text-sm text-secondary-muted mt-2">Enter your account email and we will send a password reset link.</p>

          <form onSubmit={submit} className="space-y-4 mt-6">
            <div>
              <Label className="text-[11px] uppercase tracking-wider font-semibold text-secondary-muted">{locale?.t("common.email", "Email")}</Label>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1.5 h-11 bg-surface"
                placeholder="you@domain.com"
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full h-11 bg-primary hover:bg-primary-hover text-primary-foreground">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <>{locale?.t("auth.sendReset", "Send reset link")} <ArrowRight className="size-4 ml-1" /></>}
            </Button>
          </form>

          {devResetUrl ? (
            <div className="mt-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/80 dark:bg-emerald-950/20 p-3">
              <div className="text-[11px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300 font-semibold">Development reset link</div>
              <a href={devResetUrl} className="text-xs break-all text-emerald-700 dark:text-emerald-300 hover:underline">{devResetUrl}</a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
