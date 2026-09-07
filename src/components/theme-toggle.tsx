"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useSyncExternalStore } from "react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";

const subscribe = () => () => {};
const getMountedSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle() {
  const { messages } = useI18n();
  const { theme, setTheme } = useTheme();
  // Keep the server and first client render identical until the saved preference is available.
  const mounted = useSyncExternalStore(
    subscribe,
    getMountedSnapshot,
    getServerSnapshot,
  );
  useEffect(() => {
    if (mounted && theme !== "light" && theme !== "dark") {
      setTheme("light");
    }
  }, [mounted, setTheme, theme]);
  const isDark = mounted && theme === "dark";
  const Icon = isDark ? Moon : Sun;

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      aria-label={messages.theme.label}
      aria-pressed={isDark}
      title={isDark ? messages.theme.light : messages.theme.dark}
      className="floating-theme-toggle"
      onClick={toggleTheme}
      disabled={!mounted}
    >
      <Icon aria-hidden="true" className="size-5" />
    </Button>
  );
}
