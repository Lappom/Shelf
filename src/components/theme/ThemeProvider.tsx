"use client";

import * as React from "react";

export type ThemePreference = "light" | "dark" | "system";

type Props = {
  initialTheme: ThemePreference;
  children: React.ReactNode;
};

function getSystemTheme(): Exclude<ThemePreference, "system"> {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemeToDocument(theme: ThemePreference) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolved = theme === "system" ? getSystemTheme() : theme;
  root.classList.toggle("dark", resolved === "dark");
}

export function ThemeProvider({ initialTheme, children }: Props) {
  const [theme, setTheme] = React.useState<ThemePreference>(initialTheme);

  React.useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  React.useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mql) return;

    const onChange = () => applyThemeToDocument("system");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

type ThemeContextValue = {
  theme: ThemePreference;
  setTheme: (t: ThemePreference) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
