"use client";

import { IconMoon, IconSun } from "@tabler/icons-react";

import { Button } from "@/ui/Button";

import { useTheme } from "./useTheme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  const Icon = isDark ? IconSun : IconMoon;
  const label = isDark ? "Light" : "Dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="md"
      onClick={toggle}
      aria-pressed={isDark}
      className="min-h-10 gap-2 px-4"
      disabled={theme == null}
    >
      <Icon aria-hidden className="h-5 w-5" />
      <span>{theme == null ? "Theme" : `${label} mode`}</span>
    </Button>
  );
}
