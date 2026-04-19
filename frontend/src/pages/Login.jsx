import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import ThemeToggle from "@/components/shared/ThemeToggle";
import { toast } from "sonner";
import { HERO_IMAGE } from "@/lib/mockData";

const ROLES = [
  { id: "admin", label: "Admin", sub: "Federation reviewer lead", email: "mei@tournamentos.io" },
  { id: "reviewer", label: "Reviewer", sub: "Evaluates applicants", email: "luca@tournamentos.io" },
  { id: "club", label: "Club", sub: "Gym/team coordinator", email: "ops@sakuragym.jp" },
  { id: "applicant", label: "Fighter", sub: "Individual applicant", email: "diego.ruiz@mail.com" },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState("admin");
  const [email, setEmail] = useState("mei@tournamentos.io");
  const [password, setPassword] = useState("demo1234");
  const [loading, setLoading] = useState(false);

  const pickRole = (r) => {
    setRole(r.id);
    setEmail(r.email);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter your email and password");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      login(role);
      toast.success(`Welcome back — signed in as ${role}`);
      const routes = { admin: "/admin/queue", reviewer: "/admin/queue", club: "/club", applicant: "/applicant" };
      navigate(routes[role]);
    }, 600);
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left — form */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between px-6 sm:px-10 py-5">
          <Link to="/" className="flex items-center gap-2" data-testid="back-home">
            <div className="size-8 rounded-lg bg-foreground text-background flex items-center justify-center font-display font-bold text-sm">T</div>
            <span className="font-display font-semibold tracking-tight">TournamentOS</span>
          </Link>
          <ThemeToggle compact />
        </div>

        <div className="flex-1 flex items-center justify-center px-6 sm:px-10 pb-10">
          <div className="w-full max-w-md">
            <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Sign in</div>
            <h1 className="font-display mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">Welcome back.</h1>
            <p className="mt-2 text-sm text-secondary-muted">Choose a demo role to preview the platform.</p>

            <div className="grid grid-cols-2 gap-2 mt-7">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => pickRole(r)}
                  data-testid={`role-${r.id}`}
                  className={`text-left rounded-xl border p-3 transition-all duration-200 ease-ios focus-ring ${
                    role === r.id
                      ? "border-foreground bg-surface-muted shadow-soft"
                      : "border-border bg-surface hover:bg-surface-muted"
                  }`}
                >
                  <div className="text-sm font-medium">{r.label}</div>
                  <div className="text-[11px] text-tertiary">{r.sub}</div>
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 mt-6">
              <div>
                <Label className="text-[11px] uppercase tracking-wider font-semibold text-secondary-muted">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="login-email"
                  className="mt-1.5 h-11 bg-surface"
                  placeholder="you@federation.org"
                />
              </div>
              <div>
                <Label className="text-[11px] uppercase tracking-wider font-semibold text-secondary-muted">Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="login-password"
                  className="mt-1.5 h-11 bg-surface"
                  placeholder="••••••••"
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                data-testid="login-submit"
                className="w-full h-11 bg-primary hover:bg-primary-hover text-primary-foreground font-medium"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <>Sign in <ArrowRight className="size-4 ml-1" /></>}
              </Button>
            </form>

            <p className="mt-6 text-xs text-tertiary text-center">
              Demo prototype · Any password works · <Link to="/register" className="text-foreground hover:underline">Register instead</Link>
            </p>
          </div>
        </div>
      </div>

      {/* Right — visual */}
      <div className="hidden lg:block w-[46%] relative overflow-hidden border-l border-border">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${HERO_IMAGE})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "grayscale(0.3) contrast(1.05)",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-background/10" />
        <div className="absolute bottom-10 left-10 right-10">
          <div className="glass rounded-2xl p-6 max-w-md">
            <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Season 2026</div>
            <p className="font-display mt-2 text-2xl font-semibold tracking-tight leading-snug text-balance">
              "We cut review times from 4 days to 4 hours."
            </p>
            <div className="mt-3 text-xs text-secondary-muted">Kenji Ito — Chief Sanctioning Officer, All-Japan Combat League</div>
          </div>
        </div>
      </div>
    </div>
  );
}
