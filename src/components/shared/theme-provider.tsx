import { createContext, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: "dark",
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  storageKey = "ayn-theme",
  ...props
}: ThemeProviderProps) {
  // Always use "dark" theme
  const theme = "dark" as Theme

  useEffect(() => {
    const root = window.document.documentElement
    
    // Always clear light, ensure dark is fully persistent
    root.classList.remove("light")
    root.classList.add("dark")
  }, [])

  const value = {
    theme,
    setTheme: () => null, // Disable toggling
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}
export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")

  return context
}