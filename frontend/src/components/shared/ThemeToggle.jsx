import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

export function ThemeToggle({ compact = false }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggle}
      data-testid="theme-toggle"
      aria-label="Toggle color theme"
      className={`relative inline-flex items-center gap-2 rounded-full border border-border bg-surface hover:bg-surface-muted transition-all duration-200 ease-ios focus-ring ${
        compact ? "size-9 justify-center" : "h-9 px-3"
      }`}
    >
      <span className="relative size-4">
        <Sun className={`absolute inset-0 size-4 transition-all duration-300 ease-ios ${isDark ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"}`} />
        <Moon className={`absolute inset-0 size-4 transition-all duration-300 ease-ios ${isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"}`} />
      </span>
      {!compact && <span className="text-xs font-medium capitalize">{theme}</span>}
    </button>
  );
}

export default ThemeToggle;
