import type { Metadata } from "next";
import "./globals.css";
import { AppHeader } from "@/ui/AppHeader";

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
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
