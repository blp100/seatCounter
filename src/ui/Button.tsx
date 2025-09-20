"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";

import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 focus-visible:ring-[var(--ring)]",
  secondary:
    "border border-[var(--border)] bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:opacity-90 focus-visible:ring-[var(--ring)]",
  danger:
    "bg-[var(--destructive)] text-[var(--primary-foreground)] hover:opacity-90 focus-visible:ring-[var(--ring)]",
  ghost:
    "bg-transparent text-[var(--primary)] hover:bg-[var(--muted)] focus-visible:ring-[var(--ring)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-2 text-sm min-h-10",
  md: "px-4 py-3 text-base min-h-12",
  lg: "px-5 py-4 text-lg min-h-14",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      fullWidth,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:cursor-not-allowed disabled:opacity-60",
          variantClasses[variant],
          sizeClasses[size],
          fullWidth ? "w-full" : "",
          variant === "ghost" ? "border border-transparent" : "",
          className
        )}
        disabled={isDisabled}
        aria-busy={loading}
        {...props}
      >
        {loading ? (
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden
          />
        ) : null}
        <span>{children}</span>
      </button>
    );
  }
);

Button.displayName = "Button";
