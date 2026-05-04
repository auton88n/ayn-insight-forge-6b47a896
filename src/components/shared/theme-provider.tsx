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
    // Re-resolve on mount (handles SPA navigation after hydration)
    const resolved = resolveTheme()
    setThemeState(resolved)

    const root = window.document.documentElement
    root.classList.remove("light", "dark")
    root.classList.add(resolved)

    // Keep background in sync so no white/black flash during route changes
    root.style.backgroundColor = resolved === "light" ? "#ffffff" : "hsl(0 0% 4%)"
    document.body.style.backgroundColor = resolved === "light" ? "#ffffff" : "hsl(0 0% 4%)"
  }, [])

  // Listen for SPA route changes (popstate / pushstate)
  useEffect(() => {
    const sync = () => {
      const resolved = resolveTheme()
      setThemeState(resolved)
      const root = window.document.documentElement
      root.classList.remove("light", "dark")
      root.classList.add(resolved)
      root.style.backgroundColor = resolved === "light" ? "#ffffff" : "hsl(0 0% 4%)"
      document.body.style.backgroundColor = resolved === "light" ? "#ffffff" : "hsl(0 0% 4%)"
    }

    window.addEventListener("popstate", sync)

    // Patch pushState / replaceState so in-app navigation triggers the sync
    const origPush = history.pushState.bind(history)
    const origReplace = history.replaceState.bind(history)
    history.pushState = (...args) => { origPush(...args); sync() }
    history.replaceState = (...args) => { origReplace(...args); sync() }

    return () => {
      window.removeEventListener("popstate", sync)
      history.pushState = origPush
      history.replaceState = origReplace
    }
  }, [])

  const value = {
    theme,
    setTheme: () => null, // toggling disabled — route determines theme
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