import { ThemeProvider as NextThemesProvider, type ThemeProviderProps, useTheme } from "next-themes";
import type { PropsWithChildren } from "react";

export type AppThemeProviderProps = PropsWithChildren<
  Omit<ThemeProviderProps, "attribute"> & {
    storageKey?: string;
  }
>;

export function ThemeProvider({
  children,
  defaultTheme = "system",
  enableSystem = true,
  storageKey = "vite-ui-theme",
  ...rest
}: AppThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute='class'
      defaultTheme={defaultTheme}
      enableSystem={enableSystem}
      storageKey={storageKey}
      {...rest}
    >
      {children}
    </NextThemesProvider>
  );
}

export { useTheme };
