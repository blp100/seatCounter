export const colors = {
  primary: "var(--primary)",
  primaryForeground: "var(--primary-foreground)",
  secondary: "var(--secondary)",
  secondaryForeground: "var(--secondary-foreground)",
  muted: "var(--muted)",
  mutedForeground: "var(--muted-foreground)",
  accent: "var(--accent)",
  accentForeground: "var(--accent-foreground)",
  bg: "var(--background)",
  bgMuted: "var(--muted)",
  text: "var(--foreground)",
  border: "var(--border)",
  card: "var(--card)",
  cardForeground: "var(--card-foreground)",
  danger: "var(--destructive)",
  focus: "var(--ring)",
};

export const radius = "var(--radius)";
export const shadow = "shadow-md";
export const spacing = { x: "px-4", y: "py-2" } as const;
export const font = {
  h1: "text-2xl font-bold",
  h2: "text-lg font-semibold",
  body: "text-sm text-slate-700",
} as const;

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";
