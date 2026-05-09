import { useState } from "react"
import { createPatientAccount, login as authLogin, requestPasswordReset } from "../../services/auth"
import type { LoginResponse } from "../../services/auth"
import styles from "./Login.module.css"

interface LoginProps {
  onLogin:      (res: LoginResponse) => void
  darkMode:     boolean
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
  const [mode,         setMode]         = useState<"login" | "signup">("login")
  const [email,        setEmail]        = useState("")
  const [password,     setPassword]     = useState("")
  const [name,         setName]         = useState("")
  const [cpf,          setCpf]          = useState("")
  const [phone,        setPhone]        = useState("")
  const [dob,          setDob]          = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [success,      setSuccess]      = useState<string | null>(null)
  const [isLoading,    setIsLoading]    = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) { setError("Preencha seu e-mail."); return }
    if (mode === "login" && !password.trim()) { setError("Preencha sua senha."); return }
    setError(null); setSuccess(null); setIsLoading(true)
    try {
      if (mode === "signup") {
        const response = await createPatientAccount({ name, email, cpf, phone, dob })
        setSuccess(response.message ?? "Cadastro realizado com sucesso. Verifique seu e-mail para acessar a plataforma.")
        setMode("login")
        setPassword("")
        setName("")
        setCpf("")
        setPhone("")
        setDob("")
        return
      }

      onLogin(await authLogin({ email, password }))
    }
    catch (err) { setError(err instanceof Error ? err.message : "E-mail ou senha inválidos.") }
    finally { setIsLoading(false) }
  }

  async function handleGestorClick() {
    setError(null); setSuccess(null); setIsLoading(true)
    setEmail("hugo@popcode.com.br"); setPassword("hdoria")
    try { onLogin(await authLogin({ email: "hugo@popcode.com.br", password: "hdoria" })) }
    catch (err) { setError(err instanceof Error ? err.message : "Erro ao fazer login") }
    finally { setIsLoading(false) }
  }

  async function handlePasswordReset() {
    if (!email.trim()) { setError("Informe seu e-mail para recuperar a senha."); return }
    setError(null); setSuccess(null); setIsLoading(true)
    try {
      const response = await requestPasswordReset(email)
      setSuccess(response.message)
    }
    catch (err) { setError(err instanceof Error ? err.message : "Erro ao solicitar recuperação de senha.") }
    finally { setIsLoading(false) }
  }

  function switchMode(nextMode: "login" | "signup") {
    setMode(nextMode)
    setError(null)
    setSuccess(null)
    setPassword("")
  }

  return (
    <div className={styles.root}>

      {/* Painel esquerdo — branding */}
      <div className={styles.brand}>
        <div className={styles.brandLogoRow}>
          <div className={styles.brandLogoIcon}>
            <svg width="22" height="22" fill="none" stroke="white" strokeWidth="2.2"
              viewBox="0 0 24 24" strokeLinecap="round">
              <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z" /><path d="M12 8v8M8 12h8" />
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
            <div key={f} className={styles.featureItem}><div className={styles.featureDot} />{f}</div>
          ))}
        </div>
      </div>

      {/* Painel direito — formulário */}
      <div className={styles.formPanel}>
        <div className={styles.formCard}>

          {/* Logo mobile */}
          <div className={styles.mobileLogo}>
            <div className={styles.mobileLogoIcon}>
              <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2.2"
                viewBox="0 0 24 24" strokeLinecap="round">
                <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z" /><path d="M12 8v8M8 12h8" />
              </svg>
            </div>
            <span className={styles.mobileLogoName}>Mediconnect</span>
          </div>

          <div className={styles.formHeader}>
            <p className={styles.formTitle}>{mode === "login" ? "Bem-vindo de volta" : "Criar conta de paciente"}</p>
            <p className={styles.formSub}>
              {mode === "login"
                ? "Faça login para acessar o sistema"
                : "Cadastre-se pelo e-mail para receber o acesso ao portal"}
            </p>
          </div>

          <div className={styles.modeTabs} role="tablist" aria-label="Tipo de acesso">
            <button
              type="button"
              className={`${styles.modeTab} ${mode === "login" ? styles.modeTabActive : ""}`}
              onClick={() => switchMode("login")}
            >
              Entrar
            </button>
            <button
              type="button"
              className={`${styles.modeTab} ${mode === "signup" ? styles.modeTabActive : ""}`}
              onClick={() => switchMode("signup")}
            >
              Criar conta
            </button>
          </div>

          {/* Formulário */}
          <form onSubmit={handleSubmit} className={styles.form}>
            {mode === "signup" && (
              <>
                <p className={styles.signupHint}>
                  O cadastro usa o endpoint público da API e cria o perfil do paciente com o e-mail informado.
                </p>
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>Nome completo</label>
                  <input
                    type="text" placeholder="Seu nome" value={name}
                    onChange={(e) => { setName(e.target.value); setError(null); setSuccess(null) }}
                    className={styles.input} autoComplete="name"
                  />
                </div>
                <div className={styles.signupGrid}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>CPF</label>
                    <input
                      type="text" placeholder="000.000.000-00" value={cpf}
                      onChange={(e) => { setCpf(e.target.value); setError(null); setSuccess(null) }}
                      className={styles.input} autoComplete="off"
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>Nascimento</label>
                    <input
                      type="date" value={dob}
                      onChange={(e) => { setDob(e.target.value); setError(null); setSuccess(null) }}
                      className={styles.input}
                    />
                  </div>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>Telefone</label>
                  <input
                    type="tel" placeholder="(00) 00000-0000" value={phone}
                    onChange={(e) => { setPhone(e.target.value); setError(null); setSuccess(null) }}
                    className={styles.input} autoComplete="tel"
                  />
                </div>
              </>
            )}
            <div className={styles.fieldGroup}>
              <label className={styles.label}>E-mail</label>
              <input
                type="email" placeholder="seu@email.com" value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); setSuccess(null) }}
                className={styles.input} autoComplete="username"
              />
            </div>
            {mode === "login" && (
              <div className={styles.fieldGroup}>
                <div className={styles.labelRow}>
                  <label className={styles.label}>Senha</label>
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={handlePasswordReset}
                    disabled={isLoading}
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className={styles.passwordWrapper}>
                  <input
                    type={showPassword ? "text" : "password"} placeholder="••••••••" value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); setSuccess(null) }}
                    className={styles.input} autoComplete="current-password"
                  />
                  <button type="button" className={styles.showPasswordBtn}
                    onClick={() => setShowPassword((v) => !v)} tabIndex={-1}>
                    {showPassword ? (
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                        <path d="M1 1l22 22" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )}

            {error && <p className={styles.errorMsg}>{error}</p>}
            {success && <p className={styles.successMsg}>{success}</p>}

            <button type="submit" className={styles.submitBtn} disabled={isLoading}>
              {isLoading ? (mode === "signup" ? "Criando..." : "Entrando...") : (mode === "signup" ? "Criar conta" : "Entrar")}
            </button>
          </form>

          {/* Card gestor */}
          {mode === "login" && <div className={styles.demoSection}>
            <p className={styles.demoTitle}>Acesso rápido</p>
            <div className={styles.demoGrid}>
              <button
                className={styles.demoCard}
                onClick={handleGestorClick}
                disabled={isLoading}
                title="Entrar como Gestor"
              >
                <div className={styles.demoAvatar} style={{ background: "#6366f1" }}>
                  {isLoading ? (
                    <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5"
                      viewBox="0 0 24 24" strokeLinecap="round"
                      style={{ animation: "spin 0.8s linear infinite" }}>
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  ) : "HD"}
                </div>
                <div className={styles.demoInfo}>
                  <p className={styles.demoName}>Hugo Doria</p>
                  <p className={styles.demoRole}>Gestão — Acesso completo</p>
                </div>
                <span className={styles.demoCred}>hugo@popcode.com.br</span>
              </button>
            </div>
            <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 10, textAlign: "center" }}>
              Pacientes podem criar a própria conta acima. Outros perfis são criados pelo gestor em <strong>Equipe</strong>.
            </p>
          </div>}
        </div>
      </div>

      {/* Botão de tema */}
      <button className={styles.themeBtn} onClick={onToggleDark} aria-label="Alternar tema">
        {darkMode ? (
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
            <circle cx="12" cy="12" r="5" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        ) : (
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        )}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
