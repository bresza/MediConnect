import { useCallback, useEffect, useState } from "react"

const LOGIN_PATH = "/login"

export function useAppPath() {
  const [path, setPath] = useState(() => window.location.pathname)

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname)
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  const navigate = useCallback((next: string) => {
    const target = next.startsWith("/") ? next : `/${next}`
    window.history.pushState({}, "", target)
    setPath(target)
  }, [])

  const isLoginPath = path === LOGIN_PATH || path.startsWith(`${LOGIN_PATH}/`)

  return { path, navigate, isLoginPath, goHome: () => navigate("/"), goLogin: () => navigate(LOGIN_PATH) }
}
