"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Laptop, RotateCcw, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

const STORAGE_KEY = "querywise.theme";
type Theme = "light" | "dark" | "system";

export function SettingsView() {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (saved) setTheme(saved);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (theme === "system") {
        document.documentElement.classList.toggle("dark", e.matches);
      }
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [theme]);

  function changeTheme(newTheme: Theme) {
    let isDark = newTheme === "dark";
    if (newTheme === "system") {
      isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    document.documentElement.classList.toggle("dark", isDark);
    window.localStorage.setItem(STORAGE_KEY, newTheme);
    setTheme(newTheme);
  }

  // Prevent hydration mismatch on initial render for the active state
  if (!mounted) {
    return <div className="space-y-6 animate-pulse-accent opacity-50" />;
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <PageHeader 
        eyebrow="Preferences" 
        title="Appearance" 
        description="Choose how QueryWise looks and feels for you." 
        actions={
          <button 
            type="button" 
            onClick={() => changeTheme("system")} 
            className="flex items-center gap-2 text-sm font-medium text-faint hover:text-text transition-colors"
          >
            <RotateCcw className="size-4" />
            Reset to default
          </button>
        }
      />
      
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Light */}
        <button 
          type="button" 
          onClick={() => changeTheme("light")} 
          className={`group relative flex items-center justify-start gap-4 rounded-xl border p-4 text-left transition-all duration-200 hover:border-accent-line hover:bg-surface-2 ${theme === 'light' ? 'border-accent bg-accent-soft/30 ring-1 ring-accent' : 'border-border bg-surface'}`}
        >
          <div className="rounded-full bg-green-100/50 p-3 text-green-600 dark:bg-green-900/30 dark:text-green-400">
            <Sun className="h-6 w-6" />
          </div>
          <div className="flex flex-col">
            <span className={`font-semibold ${theme === 'light' ? 'text-accent-strong' : 'text-text'}`}>Light</span>
            <span className="text-xs text-muted">Clean and bright</span>
          </div>
          {theme === 'light' && (
            <div className="absolute right-3 top-3 text-accent">
              <CheckCircle2 className="size-5 fill-accent text-white dark:text-black" />
            </div>
          )}
        </button>

        {/* Dark */}
        <button 
          type="button" 
          onClick={() => changeTheme("dark")} 
          className={`group relative flex items-center justify-start gap-4 rounded-xl border p-4 text-left transition-all duration-200 hover:border-accent-line hover:bg-surface-2 ${theme === 'dark' ? 'border-accent bg-accent-soft/30 ring-1 ring-accent' : 'border-border bg-surface'}`}
        >
          <div className="rounded-full bg-indigo-100/50 p-3 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
            <Moon className="h-6 w-6" />
          </div>
          <div className="flex flex-col">
            <span className={`font-semibold ${theme === 'dark' ? 'text-accent-strong' : 'text-text'}`}>Dark</span>
            <span className="text-xs text-muted">Sleek and calm</span>
          </div>
          {theme === 'dark' && (
            <div className="absolute right-3 top-3 text-accent">
              <CheckCircle2 className="size-5 fill-accent text-white dark:text-black" />
            </div>
          )}
        </button>

        {/* System */}
        <button 
          type="button" 
          onClick={() => changeTheme("system")} 
          className={`group relative flex items-center justify-start gap-4 rounded-xl border p-4 text-left transition-all duration-200 hover:border-accent-line hover:bg-surface-2 ${theme === 'system' ? 'border-accent bg-accent-soft/30 ring-1 ring-accent' : 'border-border bg-surface'}`}
        >
          <div className="rounded-full bg-blue-100/50 p-3 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
            <Laptop className="h-6 w-6" />
          </div>
          <div className="flex flex-col">
            <span className={`font-semibold ${theme === 'system' ? 'text-accent-strong' : 'text-text'}`}>System</span>
            <span className="text-xs text-muted">Match your system</span>
          </div>
          {theme === 'system' && (
            <div className="absolute right-3 top-3 text-accent">
              <CheckCircle2 className="size-5 fill-accent text-white dark:text-black" />
            </div>
          )}
        </button>
      </div>
    </div>
  );
}
