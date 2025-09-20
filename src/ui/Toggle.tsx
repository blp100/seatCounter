"use client";

import { ButtonHTMLAttributes } from "react";

import { cn } from "./cn";

export interface ToggleProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  className,
  ...props
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center justify-between gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-left shadow-sm transition hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
        className
      )}
      {...props}
    >
      <span className="flex flex-col">
        <span className="text-sm font-semibold text-[var(--foreground)]">
          {label}
        </span>
        {description ? (
          <span className="text-xs text-[var(--muted-foreground)]">
            {description}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "relative inline-flex h-6 w-11 items-center rounded-full transition",
          checked ? "bg-[var(--primary)]" : "bg-[var(--border)]"
        )}
        aria-hidden
      >
        <span
          className={cn(
            "inline-block h-5 w-5 translate-x-1 rounded-full bg-[var(--background)] text-[var(--foreground)] transition",
            checked ? "translate-x-5" : ""
          )}
        />
      </span>
    </button>
  );
}
