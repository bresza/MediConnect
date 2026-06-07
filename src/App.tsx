import { useState, useLayoutEffect, useEffect } from "react"
import { AuthProvider } from "./contexts/AuthContext"
import { useAuth }      from "./contexts/authStore"
import { AppRouter } from "./AppRouter"
import { Login } from "./pages/Login/Login"
import { Landing } from "./pages/Landing/Landing"
import { ToastContainer } from "./components/ui/ToastContainer/ToastContainer"
import { useToast } from "./hooks/useToast"
import { useAppPath } from "./hooks/useAppPath"
import { isAppPath, isPublicPath, pageFromPath, pathForPage, readLoginRedirect } from "./utils/appRoutes"
import { canAccess, getDefaultPage } from "./utils/permissions"
import type { LoginResponse } from "./services/auth"
import type { UserRole } from "./types"

function resolvePathAfterAuth(role: UserRole): string {
  const redirect = readLoginRedirect()
  if (redirect) {
    const page = pageFromPath(redirect)
    if (page && canAccess(role, page)) return redirect
  }
  return pathForPage(getDefaultPage(role))
}

function AppInner() {
  const { user, login } = useAuth()
  const { toasts, toast, dismiss } = useToast()
  const { isLoginPath, goHome, goLogin, navigate, pathname } = useAppPath()

  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark")

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode)
    localStorage.setItem("theme", darkMode ? "dark" : "light")
  }, [darkMode])

  // Sem sessão: rotas internas (/agenda etc.) → login; demais URLs → home pública
  useLayoutEffect(() => {
    if (user) return
    if (isLoginPath) return

    if (isAppPath(pathname)) {
      goLogin(pathname)
      return
    }

    if (!isPublicPath(pathname)) {
      goHome()
    }
  }, [user, isLoginPath, pathname, goLogin, goHome])

  function handleLogin(res: LoginResponse) {
    login({
      user:         res.user,
      token:        res.token,
      refreshToken: res.refreshToken,
      expiresAt:    res.expiresAt,
      clinicId:     res.clinicId,
      clinicName:   res.clinicName,
    })
    toast(`Bem-vindo(a), ${res.user.name}!`, "success")
    navigate(resolvePathAfterAuth(res.user.role), true)
  }

  if (!user) {
    if (isLoginPath) {
      return (
        <>
          <Login
            onLogin={handleLogin}
            darkMode={darkMode}
            onToggleDark={() => setDarkMode((d) => !d)}
            onBackToLanding={goHome}
          />
          <ToastContainer toasts={toasts} onDismiss={dismiss} />
        </>
      )
    }
    if (isAppPath(pathname)) return null
    return <Landing />
  }

  return <AppRouter darkMode={darkMode} onToggleDark={() => setDarkMode((d) => !d)} />
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
