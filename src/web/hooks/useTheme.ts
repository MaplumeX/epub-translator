import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "epub-translator-theme";

function resolveInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const param = new URLSearchParams(window.location.search).get("theme");
  if (param === "dark" || param === "light") {
    return param;
  }
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // Ignore storage restriction
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme(): { theme: ThemeMode; toggleTheme: () => void; setTheme: (t: ThemeMode) => void } {
  const [theme, setTheme] = useState<ThemeMode>(resolveInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore storage restriction
    }
  }, [theme]);

  return {
    theme,
    setTheme,
    toggleTheme: () => setTheme((prev) => (prev === "dark" ? "light" : "dark")),
  };
}
