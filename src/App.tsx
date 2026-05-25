import { useState, useEffect } from "react"
import { AuthProvider } from "./contexts/AuthContext"
import { useAuth }      from "./contexts/authStore"
import { AppRouter } from "./AppRouter"
import { Login } from "./pages/Login/Login"
import { Landing } from "./pages/Landing/Landing"
import { ToastContainer } from "./components/ui/ToastContainer/ToastContainer"
import { useToast } from "./hooks/useToast"
import { useAppPath } from "./hooks/useAppPath"
import type { LoginResponse } from "./services/auth"

function AppInner() {
  const { user, login } = useAuth()
  const { toasts, toast, dismiss } = useToast()
  const { isLoginPath, goHome } = useAppPath()

  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark")

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode)
    localStorage.setItem("theme", darkMode ? "dark" : "light")
  }, [darkMode])

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
