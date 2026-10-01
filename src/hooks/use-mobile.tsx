import * as React from "react"

const MOBILE_BREAKPOINT = 768

// Initialize synchronously to prevent hydration mismatch and extra render
const getInitialMobile = () => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
};

export function useIsMobile() {
  // Initialize with actual value to prevent flash/re-render
  const [isMobile, setIsMobile] = React.useState<boolean>(getInitialMobile)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
