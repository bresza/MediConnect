import { useEffect, useState } from "react"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Section } from "../../components/ui/Section/Section"
import { Input } from "../../components/ui/Input/Input"
import { Button } from "../../components/ui/Button/Button"
import { getProfileSettings, updateProfileSettings } from "../../services/settings"
import type { ProfileSettings } from "../../services/settings"
import type { User } from "../../types"
import styles from "./Settings.module.css"

interface SettingsProps {
  currentUser: User
}

type SettingsTab = "profile" | "clinic" | "integrations"

const EMPTY: ProfileSettings = {
  id: "",
  fullName: "",
  email: "",
  phone: "",
  role: "",
}

export function Settings({ currentUser }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile")
  const [form, setForm] = useState<ProfileSettings>(EMPTY)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setIsLoading(true)
    setError(null)
    getProfileSettings(currentUser)
      .then((settings) => { if (alive) setForm(settings) })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : "Erro ao carregar configurações") })
      .finally(() => { if (alive) setIsLoading(false) })
    return () => { alive = false }
  }, [currentUser])

  function setField(field: keyof ProfileSettings, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError(null)
    setMessage(null)
  }

  async function handleSave() {
    if (!form.fullName.trim()) { setError("Nome obrigatório"); return }
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      const saved = await updateProfileSettings(form)
      setForm(saved)
      setMessage("Configurações salvas.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar configurações")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div>
      <Topbar title="Configurações" subtitle="Preferências e dados do gestor" />

      <div className={styles.layout}>
        <Card className={styles.menuCard}>
          <button
            className={`${styles.menuBtn} ${activeTab === "profile" ? styles.menuBtnActive : ""}`}
            onClick={() => setActiveTab("profile")}
          >
            Perfil
          </button>
          <button
            className={`${styles.menuBtn} ${activeTab === "clinic" ? styles.menuBtnActive : ""}`}
            onClick={() => setActiveTab("clinic")}
          >
            Clínica
          </button>
          <button
            className={`${styles.menuBtn} ${activeTab === "integrations" ? styles.menuBtnActive : ""}`}
            onClick={() => setActiveTab("integrations")}
          >
            Integrações
          </button>
        </Card>

        <Card className={styles.contentCard}>
          {activeTab === "profile" && isLoading ? (
            <p className={styles.stateText}>Carregando configurações...</p>
          ) : activeTab === "profile" ? (
            <>
              <Section title="Perfil do gestor">
                <div className={styles.grid2}>
                  <Input
                    label="Nome"
                    required
                    value={form.fullName}
                    onChange={(e) => setField("fullName", e.target.value)}
                  />
                  <Input
                    label="E-mail"
                    type="email"
                    value={form.email}
                    disabled
                  />
                  <Input
                    label="Telefone"
                    value={form.phone}
                    onChange={(e) => setField("phone", e.target.value)}
                    placeholder="(00) 00000-0000"
                  />
                  <Input label="Perfil" value={form.role} disabled />
                </div>
              </Section>

              {(error || message) && (
                <p className={error ? styles.errorText : styles.successText}>
                  {error ?? message}
                </p>
              )}

              <div className={styles.saveRow}>
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Salvando..." : "Salvar configurações"}
                </Button>
              </div>
            </>
          ) : activeTab === "clinic" ? (
            <Section title="Clínica Mediconnect">
              <div className={styles.infoGrid}>
                <div className={styles.infoItem}>
                  <span>Nome da clínica</span>
                  <strong>Mediconnect</strong>
                </div>
                <div className={styles.infoItem}>
                  <span>Unidade</span>
                  <strong>Clínica Central</strong>
                </div>
                <div className={styles.infoItem}>
                  <span>Perfil operacional</span>
                  <strong>Gestão integrada de atendimento médico</strong>
                </div>
                <div className={styles.infoItem}>
                  <span>Status do sistema</span>
                  <strong>Ativo e conectado à API</strong>
                </div>
              </div>

              <div className={styles.textBlock}>
                <p>
                  A Mediconnect centraliza o fluxo da clínica com cadastro de pacientes,
                  agenda, prontuários, laudos, receitas, equipe, financeiro, comunicação
                  e relatórios gerenciais.
                </p>
                <p>
                  O perfil Gestão possui acesso completo aos módulos administrativos e
                  acompanha os dados reais persistidos pela API integrada.
                </p>
              </div>
            </Section>
          ) : (
            <Section title="Integrações da API">
              <div className={styles.integrationBox}>
                <div>
                  <span className={styles.integrationLabel}>API principal</span>
                  <strong>Supabase REST API</strong>
                </div>
                <span className={styles.integrationStatus}>Integrada</span>
              </div>

              <div className={styles.infoGrid}>
                <div className={styles.infoItem}>
                  <span>Documentação</span>
                  <strong>do5wegrct3.apidog.io</strong>
                </div>
                <div className={styles.infoItem}>
                  <span>Autenticação</span>
                  <strong>Bearer token</strong>
                </div>
                <div className={styles.infoItem}>
                  <span>Banco de dados</span>
                  <strong>Supabase</strong>
                </div>
                <div className={styles.infoItem}>
                  <span>Módulos conectados</span>
                  <strong>Pacientes, agenda, laudos, prontuários, equipe e financeiro</strong>
                </div>
              </div>

              <div className={styles.textBlock}>
                <p>
                  O front-end consome a API por endpoints REST usando as tabelas expostas
                  pelo backend, incluindo profiles, doctors, patients, appointments e reports.
                </p>
                <p>
                  Dados sensíveis de ambiente, como chaves e tokens, permanecem fora da
                  interface e são usados somente pela camada de serviços.
                </p>
              </div>
            </Section>
          )}
        </Card>
      </div>
    </div>
  )
}
