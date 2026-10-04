'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}

/** Small sun/moon toggle for the header. Mounted client-side only to avoid hydration mismatch. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="text-stone-500 hover:text-amber-700 hover:bg-amber-50 dark:text-stone-400 dark:hover:text-amber-400 dark:hover:bg-amber-950/40"
      aria-label={isDark ? 'حول للوضع النهاري' : 'حول للوضع الليلي'}
      title={isDark ? 'الوضع النهاري ☀️' : 'الوضع الليلي 🌙'}
    >
      {mounted ? (
        isDark ? (
          <Sun className="size-5" />
        ) : (
          <Moon className="size-5" />
        )
      ) : (
        <Moon className="size-5 opacity-0" aria-hidden />
      )}
    </Button>
  );
}
