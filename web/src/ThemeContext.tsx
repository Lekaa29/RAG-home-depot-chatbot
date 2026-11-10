import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { lightTheme, darkTheme, type Theme } from "./theme";

interface ThemeContextValue {
  theme: Theme;
  dark: boolean;
  toggleDark: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);

  // mirrors the toggle onto the document root so plain CSS (the sidebar/chat
  // panel) can react too, alongside the React-driven Three.js scene colors
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  const value: ThemeContextValue = {
    theme: dark ? darkTheme : lightTheme,
    dark,
    toggleDark: () => setDark((d) => !d),
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
