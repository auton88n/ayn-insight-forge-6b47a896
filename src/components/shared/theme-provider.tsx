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

/** All pages use light (white) theme. */
function resolveTheme(): Theme {
  return "light"
}

const ThemeProviderContext = createContext<ThemeProviderState>({
  theme: "light",
  setTheme: () => null,
})

export function ThemeProvider({
  children,
  storageKey = "ayn-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(resolveTheme)

  useEffect(() => {
    // Apply the fixed theme once, independently of navigation.
    const resolved = resolveTheme()
    setThemeState(resolved)

    const root = window.document.documentElement
    root.classList.remove("light", "dark")
    root.classList.add(resolved)

    // Keep background in sync so no white/black flash during route changes
    root.style.backgroundColor = resolved === "light" ? "#ffffff" : "hsl(0 0% 4%)"
    document.body.style.backgroundColor = resolved === "light" ? "#ffffff" : "hsl(0 0% 4%)"
  }, [])

  // All routes use the same light theme. Do not wrap the router's history
  // methods or synchronously update React during a navigation transition.

  const value = {
    theme,
    setTheme: () => null, // toggling disabled — all routes use light
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
