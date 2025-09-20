"use client";

import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

function applyTheme(theme: Theme) {
  const classList = document.documentElement.classList;
  if (theme === "dark") {
    classList.add("dark");
  } else {
    classList.remove("dark");
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore storage failures (private mode, etc.)
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }, []);

  const set = useCallback((next: Theme) => {
    setTheme(next);
    applyTheme(next);
  }, []);

  return { theme, toggle, setTheme: set };
}
