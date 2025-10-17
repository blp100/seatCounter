"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/ui/ThemeToggle";

export function AppHeader() {
  const pathname = usePathname();
  const showBack = pathname.startsWith("/t/");

  return (
    <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--card)] px-6 py-4 text-[var(--card-foreground)] shadow-sm">
      <div className="flex items-center justify-between gap-4 max-w-3xl w-full mx-auto">
        <div className="flex items-center gap-3">
          {showBack ? (
            <Link
              href="/"
              className="px-3 py-2 rounded-md bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:bg-[var(--muted)]"
            >
              返回
            </Link>
          ) : null}
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
