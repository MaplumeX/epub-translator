import { Moon, Sun } from "lucide-react";
import type { ThemeMode } from "../hooks/useTheme.js";

interface ThemeToggleProps {
  theme: ThemeMode;
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <button
      type="button"
      className="btn btn-tertiary btn-sm icon-btn"
      onClick={onToggle}
      aria-label={theme === "dark" ? "切换为浅色纸面模式" : "切换为深色炭黑模式"}
      title={theme === "dark" ? "切换为浅色模式" : "切换为深色模式"}
    >
      {theme === "dark" ? <Sun size={16} strokeWidth={1.8} /> : <Moon size={16} strokeWidth={1.8} />}
    </button>
  );
}
