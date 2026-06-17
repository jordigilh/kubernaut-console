import { useState, useEffect } from "react";

/**
 * Returns the PF6 theme class based on the current Backstage theme.
 * Detects dark mode via the Backstage root element's `data-theme` attribute
 * or CSS media query as a fallback.
 */
export function usePf6ThemeClass(): string {
  const [isDark, setIsDark] = useState(() => detectDarkMode());

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const observer = new MutationObserver(() => setIsDark(detectDarkMode()));

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    mql.addEventListener("change", () => setIsDark(detectDarkMode()));

    return () => {
      observer.disconnect();
      mql.removeEventListener("change", () => setIsDark(detectDarkMode()));
    };
  }, []);

  return isDark ? "pf-v6-theme-dark" : "";
}

function detectDarkMode(): boolean {
  const root = document.documentElement;
  if (root.getAttribute("data-theme") === "dark") return true;
  if (root.classList.contains("dark")) return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
