import { useCallback, useEffect, useState } from "react"
import { LOGIN_PATH, normalizePathname } from "../utils/appRoutes"

export function useAppPath() {
  const [path, setPath] = useState(() => window.location.pathname + window.location.search)

  useEffect(() => {
    const sync = () => setPath(window.location.pathname + window.location.search)
    window.addEventListener("popstate", sync)
    return () => window.removeEventListener("popstate", sync)
  }, [])

  const navigate = useCallback((next: string, replace = false) => {
    const target = next.startsWith("/") ? next : `/${next}`
    if (replace) window.history.replaceState({}, "", target)
    else window.history.pushState({}, "", target)
    setPath(target)
  }, [])

  const pathname = normalizePathname(path.split("?")[0] ?? path)
  const isLoginPath = pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`)

  return {
    path,
    pathname,
    navigate,
    isLoginPath,
    goHome: () => navigate("/", true),
    goLogin: (nextPath?: string) => {
      const query = nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""
      navigate(`${LOGIN_PATH}${query}`, true)
    },
  }
}
