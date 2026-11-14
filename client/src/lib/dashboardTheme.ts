import { useLayoutEffect, useState } from "react";

type DashboardTheme = "dark" | "light";
const storageKey = "druto.dashboard.theme";
const attribute = "data-druto-dashboard-theme";

export function useDashboardTheme() {
  const [theme, setTheme] = useState<DashboardTheme>(() => {
    try { return localStorage.getItem(storageKey) === "light" ? "light" : "dark"; }
    catch { return "dark"; }
  });
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute(attribute);
    root.setAttribute(attribute, theme);
    try { localStorage.setItem(storageKey, theme); } catch { /* Theme still works when storage is unavailable. */ }
    return () => {
      if (previous === null) root.removeAttribute(attribute);
      else root.setAttribute(attribute, previous);
    };
  }, [theme]);
  return { theme, toggleTheme: () => setTheme(current => current === "dark" ? "light" : "dark") };
}