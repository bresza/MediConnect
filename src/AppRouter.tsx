import { useState } from "react"
import { Sidebar }        from "./components/layout/Sidebar/Sidebar"
import { ToastContainer } from "./components/ui/ToastContainer/ToastContainer"
import { Dashboard }      from "./pages/Dashboard/Dashboard"
import { Patients }       from "./pages/Patients/Patients"
import { Registration }   from "./pages/Registration/Registration"
import { Appointments }   from "./pages/Appointments/Appointments"
import { Records }        from "./pages/Records/Records"
import { Reports }        from "./pages/Reports/Reports"
import { PatientProfile } from "./pages/PatientProfile/PatientProfile"
import { Messages }       from "./pages/Messages/Messages"
import { Financial }      from "./pages/Financial/Financial"
import { Settings }       from "./pages/Settings/Settings"
import { Team }           from "./pages/Team/Team"
import { canAccess, canDo, getDefaultPage } from "./utils/permissions"
import { useAuth }          from "./contexts/AuthContext"
import { usePatients }      from "./hooks/usePatients"
import { useAppointments }  from "./hooks/useAppointments"
import { useMedicalData }   from "./hooks/useMedicalData"
import { useStaff }         from "./hooks/useStaff"
import { useToast }         from "./hooks/useToast"
import type { PageId, Patient } from "./types"
import styles from "./App.module.css"

interface AppRouterProps { darkMode: boolean; onToggleDark: () => void }

export function AppRouter({ darkMode, onToggleDark }: AppRouterProps) {
  const { user, logout } = useAuth()

  const { patients,     addPatient,    updatePatient,  deletePatient }                 = usePatients()
  const { appointments, addAppointment, updateAppointment }                             = useAppointments()
  const { records,      prescriptions, addRecord,      updateRecord, addPrescription } = useMedicalData()
  const { staff,        addStaff,      updateStaff,    deleteStaff }                  = useStaff()
  const { toasts,       toast,         dismiss }                                       = useToast()

  const [activePage,       setActivePage]       = useState<PageId>(() => getDefaultPage(user?.role ?? "secretary"))
  const [sidebarOpen,      setSidebarOpen]      = useState(false)
  const [editingPatient,   setEditingPatient]   = useState<Patient | null>(null)
  const [viewingPatient,   setViewingPatient]   = useState<Patient | null>(null)
  const [recordsPatientId, setRecordsPatientId] = useState<string | null>(null)

  if (!user) return null
  const currentUser = user

  const isDoctor    = currentUser.role === "doctor"
  const isSecretary = currentUser.role === "secretary"
  const isCurrentDoctor = (doctorId?: string, doctorName?: string) =>
    doctorId === currentUser.id ||
    doctorName === currentUser.name ||
    doctorName?.toLowerCase().trim() === currentUser.name.toLowerCase().trim()

  // ── Filtros de dados por perfil ──────────────────────────────────
  // Médico vê apenas seus próprios agendamentos e pacientes vinculados
  const doctorAppts      = isDoctor
    ? appointments.filter((a) => isCurrentDoctor(a.doctorId, a.doctorName))
    : appointments
  const doctorPatientIds = isDoctor
    ? new Set(doctorAppts.map((a) => a.patientId))
    : null

  const visiblePatients      = isDoctor ? patients.filter((p) => doctorPatientIds!.has(p.id)) : patients
  const visibleAppointments  = doctorAppts
  const visibleRecords       = isDoctor ? records.filter((r) => doctorPatientIds!.has(r.patientId)) : records
  const visiblePrescriptions = isDoctor ? prescriptions.filter((p) => doctorPatientIds!.has(p.patientId)) : prescriptions

  // ── Navegação ────────────────────────────────────────────────────
  function handleNavigate(page: PageId) {
    if (!canAccess(currentUser.role, page)) return
    if (page !== "register")        setEditingPatient(null)
    if (page !== "records")         setRecordsPatientId(null)
    if (page !== "patient-profile") setViewingPatient(null)
    setActivePage(page)
    setSidebarOpen(false)
  }

  function handleViewProfile(patient: Patient) {
    setViewingPatient(patient)
    setActivePage("patient-profile")
    setSidebarOpen(false)
  }

  function handleEditPatient(patient: Patient) {
    setEditingPatient(patient)
    setActivePage("register")
    setSidebarOpen(false)
  }

  function handleViewRecords(patient: Patient) {
    if (!canAccess(currentUser.role, "records")) return  // secretária nunca acessa
    setRecordsPatientId(patient.id)
    setActivePage("records")
    setSidebarOpen(false)
  }

  // ── Handlers com feedback de toast ───────────────────────────────
  async function handleAddPatient(p: Omit<Patient, "id">) {
    const created = await addPatient(p)
    toast(`Paciente ${created.name} cadastrado com sucesso.`, "success")
    return created
  }
  async function handleUpdatePatient(p: Patient) {
    await updatePatient(p)
    toast(`Dados de ${p.name} atualizados.`, "success")
  }
  async function handleDeletePatient(id: string) {
    const target = patients.find((p) => p.id === id)
    await deletePatient(id)
    if (target) toast(`Paciente ${target.name} removido.`, "info")
  }

  // ── Renderização por página ──────────────────────────────────────
  function renderPage() {
    // Bloqueia acesso a páginas não permitidas
    if (!canAccess(currentUser.role, activePage)) {
      return (
        <div style={{ padding: 48, textAlign: "center", color: "var(--muted-foreground)" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "var(--foreground)" }}>
            Acesso restrito
          </p>
          <p style={{ fontSize: 13 }}>
            Seu perfil ({currentUser.role}) não tem permissão para acessar este módulo.
          </p>
        </div>
      )
    }

    switch (activePage) {

      // ── Dashboard (adaptado por perfil) ─────────────────────────
      case "dashboard":
        return (
          <Dashboard
            patients={visiblePatients}
            appointments={visibleAppointments}
            currentUser={currentUser}
            onNavigate={handleNavigate}
          />
        )

      // ── Pacientes ───────────────────────────────────────────────
      case "patients":
        return (
          <Patients
            patients={visiblePatients}
            onNavigate={handleNavigate}
            onEditPatient={handleEditPatient}
            // Secretária NÃO vê botão de prontuário
            onViewRecords={canAccess(currentUser.role, "records") ? handleViewRecords : undefined}
            onViewProfile={handleViewProfile}
            // Somente gestão pode excluir pacientes
            onDeletePatient={canDo(currentUser.role, "delete_patients") ? handleDeletePatient : undefined}
            canCreatePatient={canAccess(currentUser.role, "register")}
            toast={toast}
          />
        )

      // ── Perfil do paciente ──────────────────────────────────────
      case "patient-profile":
        return viewingPatient ? (
          <PatientProfile
            patient={viewingPatient}
            records={visibleRecords}
            appointments={visibleAppointments}
            prescriptions={visiblePrescriptions}
            currentUser={currentUser}
            onNavigate={handleNavigate}
            onEditPatient={handleEditPatient}
            // Secretária NÃO acessa prontuário dentro do perfil
            onViewRecords={canAccess(currentUser.role, "records") ? handleViewRecords : undefined}
            onAddPrescription={canDo(currentUser.role, "create_records") ? addPrescription : async () => {}}
          />
        ) : (
          <Patients
            patients={visiblePatients}
            onNavigate={handleNavigate}
            onEditPatient={handleEditPatient}
            onViewRecords={canAccess(currentUser.role, "records") ? handleViewRecords : undefined}
            onViewProfile={handleViewProfile}
            onDeletePatient={canDo(currentUser.role, "delete_patients") ? handleDeletePatient : undefined}
            canCreatePatient={canAccess(currentUser.role, "register")}
            toast={toast}
          />
        )

      // ── Cadastro de paciente ─────────────────────────────────────
      // Secretária acessa mas apenas campos básicos (Registration controla internamente)
      case "register":
        return (
          <Registration
            patients={patients}
            editingPatient={editingPatient}
            onAddPatient={handleAddPatient}
            onUpdatePatient={handleUpdatePatient}
            onNavigate={handleNavigate}
            // Secretária não vê campos clínicos (step 5)
            isSecretary={isSecretary}
          />
        )

      // ── Agenda ──────────────────────────────────────────────────
      // Médico vê apenas seus próprios agendamentos
      case "appointments":
        return (
          <Appointments
            appointments={visibleAppointments}
            patients={visiblePatients}
            currentUser={currentUser}
            onAddAppointment={addAppointment}
            onUpdateAppointment={updateAppointment}
          />
        )

      // ── Prontuários — bloqueado para secretária ──────────────────
      case "records":
        return (
          <Records
            key={recordsPatientId ?? 0}
            records={visibleRecords}
            patients={visiblePatients}
            filterPatientId={recordsPatientId}
            currentUser={currentUser}
            onAddRecord={canDo(currentUser.role, "create_records") ? addRecord : async () => {}}
            onUpdateRecord={canDo(currentUser.role, "update_records") ? updateRecord : async () => {}}
            onNavigate={handleNavigate}
          />
        )

      // ── Relatórios / Laudos ──────────────────────────────────────
      case "reports":
        return <Reports currentUser={currentUser} patients={visiblePatients} />

      // ── Mensagens ────────────────────────────────────────────────
      case "messages":
        return <Messages />

      // ── Financeiro — somente gestor e financeiro ─────────────────
      case "financial":
        return <Financial patients={patients} />

      // ── Equipe — somente gestão ──────────────────────────────────
      case "team":
        return (
          <Team
            staff={staff}
            onAdd={addStaff}
            onUpdate={updateStaff}
            onDelete={deleteStaff}
            toast={toast}
          />
        )

      // ── Configurações — somente gestão ──────────────────────────
      case "settings":
        return <Settings currentUser={currentUser} />

      default:
        return (
          <Dashboard
            patients={visiblePatients}
            appointments={visibleAppointments}
            currentUser={currentUser}
            onNavigate={handleNavigate}
          />
        )
    }
  }

  return (
    <div className={styles.layout}>
      {sidebarOpen && <div className={styles.backdrop} onClick={() => setSidebarOpen(false)} />}
      <Sidebar
        activePage={activePage}
        onNavigate={handleNavigate}
        currentUser={currentUser}
        onLogout={logout}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        darkMode={darkMode}
        onToggleDark={onToggleDark}
      />
      <main className={styles.main}>
        <div className={styles.mobileTopbar}>
          <button className={styles.hamburgerBtn} onClick={() => setSidebarOpen(true)} aria-label="Abrir menu">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"
              viewBox="0 0 24 24" strokeLinecap="round">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <div className={styles.mobileLogo}>
            <div className={styles.mobileLogoIcon}>
              <svg width="12" height="12" fill="none" stroke="white" strokeWidth="2"
                viewBox="0 0 24 24" strokeLinecap="round">
                <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z" />
                <path d="M12 8v8M8 12h8" />
              </svg>
            </div>
            <p className={styles.mobileLogoName}>Mediconnect</p>
          </div>
        </div>
        <div className={styles.content}>{renderPage()}</div>
      </main>
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
