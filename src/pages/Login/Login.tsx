import { useState } from "react"
import { MOCK_USERS } from "../../data/mock"
import { ROLE_LABELS } from "../../utils/permissions"
import { getInitials } from "../../utils"
import type { User } from "../../types"
import styles from "./Login.module.css"

interface LoginProps {
  onLogin: (user: User) => void
  darkMode: boolean
  onToggleDark: () => void
}

const FEATURE_LIST = [
  "Agendamento inteligente com detecção de conflitos",
  "Prontuário eletrônico completo",
  "Gestão financeira e faturamento",
  "Comunicação integrada com pacientes",
  "Relatórios e laudos médicos",
]

export function Login({ onLogin, darkMode, onToggleDark }: LoginProps) {
  const [email, setEmail]               = useState("")
  const [password, setPassword]         = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError]               = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const found = MOCK_USERS.find((u) => u.email === email && u.password === password)
    if (!found) { setError("E-mail ou senha inválidos"); return }
    onLogin({ id: found.id, name: found.name, role: found.role, email: found.email, crm: found.crm, specialty: found.specialty })
  }

  function quickLogin(mu: typeof MOCK_USERS[0]) {
    onLogin({ id: mu.id, name: mu.name, role: mu.role, email: mu.email, crm: mu.crm, specialty: mu.specialty })
  }

  return (
    <div className={styles.root}>

      {/* Left – branding */}
      <div className={styles.brand}>
        <div className={styles.brandLogoRow}>
          <div className={styles.brandLogoIcon}>
            <svg width="22" height="22" fill="none" stroke="white" strokeWidth="2.2"
              viewBox="0 0 24 24" strokeLinecap="round">
              <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z" />
              <path d="M12 8v8M8 12h8" />
            </svg>
          </div>
          <div>
            <p className={styles.brandName}>Mediconnect</p>
            <p className={styles.brandClinic}>Clínica Central</p>
          </div>
        </div>

        <p className={styles.brandHeadline}>Gestão clínica moderna e eficiente</p>
        <p className={styles.brandSub}>
          Uma plataforma completa para médicos, gestores e equipe administrativa gerenciarem pacientes, agendamentos e muito mais.
        </p>

        <div className={styles.features}>
          {FEATURE_LIST.map((f) => (
            <div key={f} className={styles.featureItem}>
              <div className={styles.featureDot} />
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* Right – form */}
      <div className={styles.formPanel}>
        <div className={styles.formCard}>

          {/* Mobile logo */}
          <div className={styles.mobileLogo}>
            <div className={styles.mobileLogoIcon}>
              <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2.2"
                viewBox="0 0 24 24" strokeLinecap="round">
                <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z" />
                <path d="M12 8v8M8 12h8" />
              </svg>
            </div>
            <span className={styles.mobileLogoName}>Mediconnect</span>
          </div>

          <div className={styles.formHeader}>
            <p className={styles.formTitle}>Bem-vindo de volta</p>
            <p className={styles.formSub}>Faça login para acessar o sistema</p>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>E-mail</label>
              <input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null) }}
                className={styles.input}
                autoComplete="username"
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>Senha</label>
              <div className={styles.passwordWrapper}>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null) }}
                  className={styles.input}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className={styles.showPasswordBtn}
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"
                      viewBox="0 0 24 24" strokeLinecap="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                      <path d="M1 1l22 22" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"
                      viewBox="0 0 24 24" strokeLinecap="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && <p className={styles.errorMsg}>{error}</p>}

            <button type="submit" className={styles.submitBtn}>Entrar</button>
          </form>

          {/* Demo accounts */}
          <div className={styles.demoSection}>
            <p className={styles.demoTitle}>Perfis de demonstração — clique para entrar</p>
            <div className={styles.demoGrid}>
              {MOCK_USERS.map((mu) => (
                <button key={mu.id} className={styles.demoCard} onClick={() => quickLogin(mu)}>
                  <div className={styles.demoAvatar}>{getInitials(mu.name)}</div>
                  <div className={styles.demoInfo}>
                    <p className={styles.demoName}>{mu.name}</p>
                    <p className={styles.demoRole}>{ROLE_LABELS[mu.role]}</p>
                  </div>
                  <span className={styles.demoCred}>{mu.password}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Theme toggle */}
      <button className={styles.themeBtn} onClick={onToggleDark} aria-label="Alternar tema">
        {darkMode ? (
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"
            viewBox="0 0 24 24" strokeLinecap="round">
            <circle cx="12" cy="12" r="5" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        ) : (
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"
            viewBox="0 0 24 24" strokeLinecap="round">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        )}
      </button>
    </div>
  )
}
