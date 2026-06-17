import { useTheme } from "@backstage/theme";

/**
 * Returns the PF6 theme class based on the current Backstage theme.
 * PF6 uses .pf-v6-theme-dark on the root element for dark mode.
 */
export function usePf6ThemeClass(): string {
  const theme = useTheme();
  const isDark = theme?.palette?.mode === "dark";
  return isDark ? "pf-v6-theme-dark" : "";
}
