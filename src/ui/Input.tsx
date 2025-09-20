"use client";

import { forwardRef, InputHTMLAttributes } from "react";

import { cn } from "./cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, description, error, className, id, ...props }, ref) => {
    const inputId = id ?? props.name ?? undefined;

    return (
      <label className="flex w-full flex-col gap-2 text-sm text-[var(--foreground)]">
        {label ? (
          <span className="font-medium text-[var(--foreground)]">{label}</span>
        ) : null}
        <input
          id={inputId}
          ref={ref}
          className={cn(
            "h-12 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-4 text-base text-[var(--foreground)] shadow-sm transition focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]",
            error ? "border-[var(--destructive)]" : "",
            className
          )}
          {...props}
        />
        {description && !error ? (
          <span className="text-xs text-[var(--muted-foreground)]">
            {description}
          </span>
        ) : null}
        {error ? (
          <span className="text-xs text-[var(--destructive)]">{error}</span>
        ) : null}
      </label>
    );
  }
);

Input.displayName = "Input";
