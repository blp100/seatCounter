import type { Metadata } from "next";
import "./globals.css";
import { ThemeToggle } from "@/ui/ThemeToggle";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_TITLE || "SeatCounter",
  description: "Simple table headcount and ticket timing",
};

const themeInitScript = `
  (function(){
    try {
      var stored = localStorage.getItem('theme');
      var isDark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
      var classList = document.documentElement.classList;
      if (isDark) {
        classList.add('dark');
      } else {
        classList.remove('dark');
      }
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-[var(--background)] text-[var(--foreground)] transition-colors">
        <script
          dangerouslySetInnerHTML={{
            __html: themeInitScript,
          }}
        />
        <header className="flex items-center justify-end gap-4 border-b border-[var(--border)] bg-[var(--card)] px-6 py-4 text-[var(--card-foreground)] shadow-sm">
          <ThemeToggle />
        </header>
        {children}
      </body>
    </html>
  );
}
