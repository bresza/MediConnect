import { useState, useEffect } from "react"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import { AppRouter } from "./AppRouter"
import { Login } from "./pages/Login/Login"
import { ToastContainer } from "./components/ui/ToastContainer/ToastContainer"
import { useToast } from "./hooks/useToast"
import type { LoginResponse } from "./services/auth"

function AppInner() {
  const { user, login } = useAuth()
  const { toasts, toast, dismiss } = useToast()

  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark")

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode)
    localStorage.setItem("theme", darkMode ? "dark" : "light")
  }, [darkMode])

  function handleLogin(res: LoginResponse) {
    login({
      user:       res.user,
      token:      res.token,
      clinicId:   res.clinicId,
      clinicName: res.clinicName,
    })
    toast(`Bem-vindo(a), ${res.user.name}!`, "success")
  }

  if (!user) {
    return (
      <>
        <Login onLogin={handleLogin} darkMode={darkMode} onToggleDark={() => setDarkMode((d) => !d)} />
        <ToastContainer toasts={toasts} onDismiss={dismiss} />
      </>
    )
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
