import { HTMLAttributes } from "react";

import { cn } from "./cn";

export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-6 text-[var(--card-foreground)] shadow-md",
        className
      )}
      {...props}
    />
  );
}
