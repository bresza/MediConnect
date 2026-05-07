import { useState } from "react"
import { Sidebar }        from "./components/layout/Sidebar/Sidebar"
import { ToastContainer } from "./components/ui/ToastContainer/ToastContainer"
import { Dashboard }      from "./pages/Dashboard/Dashboard"
import { Patients }       from "./pages/Patients/Patients"
import { Registration }   from "./pages/Registration/Registration"
import { Appointments }   from "./pages/Appointments/Appointments"
import { Availability }   from "./pages/Availability/Availability"
import { Reports }        from "./pages/Reports/Reports"
import { PatientProfile } from "./pages/PatientProfile/PatientProfile"
import { PatientPortal }  from "./pages/PatientPortal/PatientPortal"
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

  const { patients,     addPatient, addPatientWithPassword, createPatientAccess, updatePatient,  deletePatient, reload: reloadPatients } = usePatients()
  const { appointments, addAppointment, updateAppointment, deleteAppointment }           = useAppointments()
  const { records,      prescriptions, addPrescription } = useMedicalData()
  const { staff,        addStaff,      updateStaff,    deleteStaff, reload: reloadStaff } = useStaff()
  const { toasts,       toast,         dismiss }                                       = useToast()

  const [activePage,       setActivePage]       = useState<PageId>(() => getDefaultPage(user?.role ?? "secretary"))
  const [sidebarOpen,      setSidebarOpen]      = useState(false)
  const [editingPatient,   setEditingPatient]   = useState<Patient | null>(null)
  const [viewingPatient,   setViewingPatient]   = useState<Patient | null>(null)

  if (!user) return null
  const currentUser = user

  const isDoctor    = currentUser.role === "doctor"
  const isPatient   = currentUser.role === "patient"
  const isSecretary = currentUser.role === "secretary"
  const canCreatePatient = canDo(currentUser.role, "register_patients") || canDo(currentUser.role, "manage_patients")
  const currentDoctorId = currentUser.doctorId ?? currentUser.id
  const onlyDigits = (value?: string) => value?.replace(/\D/g, "") ?? ""
  const isCurrentDoctor = (doctorId?: string, doctorName?: string) =>
    doctorId === currentDoctorId ||
    doctorId === currentUser.id ||
    doctorName === currentUser.name ||
    doctorName?.toLowerCase().trim() === currentUser.name.toLowerCase().trim()

  // ── Filtros de dados por perfil ──────────────────────────────────
  // Médico vê apenas seus próprios agendamentos e pacientes vinculados
  const linkedPatient = isPatient
    ? patients.find((p) =>
      (currentUser.patientId && p.id === currentUser.patientId) ||
      p.userId === currentUser.id ||
      (!!currentUser.patientCpf && onlyDigits(p.cpf) === currentUser.patientCpf) ||
      (!!currentUser.email && p.email?.toLowerCase().trim() === currentUser.email.toLowerCase().trim())) ?? null
    : null
  const fallbackPatient: Patient | null = isPatient && !linkedPatient
    ? {
      id: currentUser.patientId ?? currentUser.id,
      name: currentUser.name,
      cpf: currentUser.patientCpf ?? "",
      email: currentUser.email,
      phone: currentUser.phone ?? "",
      dob: currentUser.dob ?? "",
      gender: "Other",
      status: "Active",
    }
    : null
  const portalPatient = linkedPatient ?? fallbackPatient
  const linkedPatientId = portalPatient?.id ?? currentUser.patientId ?? ""

  const doctorAppts      = isDoctor
    ? appointments.filter((a) => isCurrentDoctor(a.doctorId, a.doctorName))
    : appointments
  const doctorPatientIds = isDoctor
    ? new Set(doctorAppts.map((a) => a.patientId))
    : null

  const visiblePatients      = isPatient
    ? (portalPatient ? [portalPatient] : [])
    : isDoctor ? patients.filter((p) => doctorPatientIds!.has(p.id)) : patients
  const visibleAppointments  = isPatient
    ? appointments.filter((a) => a.patientId === linkedPatientId)
    : doctorAppts
  const visibleRecords       = isPatient
    ? records.filter((r) => r.patientId === linkedPatientId)
    : isDoctor ? records.filter((r) => doctorPatientIds!.has(r.patientId)) : records
  const visiblePrescriptions = isPatient
    ? prescriptions.filter((p) => p.patientId === linkedPatientId)
    : isDoctor ? prescriptions.filter((p) => doctorPatientIds!.has(p.patientId)) : prescriptions

  // ── Navegação ────────────────────────────────────────────────────
  function handleNavigate(page: PageId) {
    if (!canAccess(currentUser.role, page)) return
    if (page !== "register")        setEditingPatient(null)
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

  // ── Handlers com feedback de toast ───────────────────────────────
  async function handleAddPatient(p: Omit<Patient, "id">) {
    const created = await addPatient(p)
    toast(`Paciente ${created.name} cadastrado com sucesso.`, "success")
    return created
  }
  async function handleAddPatientWithPassword(p: Omit<Patient, "id">, password: string) {
    const created = await addPatientWithPassword(p, password)
    toast(`Paciente ${created.name} cadastrado com acesso ao portal.`, "success")
    return created
  }
  async function handleCreatePatientAccess(p: Patient, password: string) {
    const saved = await createPatientAccess(p, password)
    toast(`Acesso ao portal criado para ${saved.name}.`, "success")
    return saved
  }
  async function handleUpdatePatient(p: Patient) {
    await updatePatient(p)
    toast(`Dados de ${p.name} atualizados.`, "success")
  }
  async function handleDeletePatient(id: string) {
    const target = patients.find((p) => p.id === id)
    try {
      await deletePatient(id)
      if (target) toast(`Paciente ${target.name} removido.`, "info")
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao remover paciente.", "error")
    }
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
      // ── Portal do paciente ──────────────────────────────────────
      case "patient-portal":
        return (
          <PatientPortal
            currentUser={currentUser}
            patient={portalPatient}
            appointments={visibleAppointments}
            records={visibleRecords}
            prescriptions={visiblePrescriptions}
          />
        )

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
            onViewProfile={handleViewProfile}
            // Somente gestão pode excluir pacientes
            onDeletePatient={canDo(currentUser.role, "delete_patients") ? handleDeletePatient : undefined}
            canCreatePatient={canCreatePatient}
            onRefresh={reloadPatients}
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
            onAddPrescription={currentUser.role === "doctor" ? addPrescription : async () => {}}
          />
        ) : (
          <Patients
            patients={visiblePatients}
            onNavigate={handleNavigate}
            onEditPatient={handleEditPatient}
            onViewProfile={handleViewProfile}
            onDeletePatient={canDo(currentUser.role, "delete_patients") ? handleDeletePatient : undefined}
            canCreatePatient={canCreatePatient}
            onRefresh={reloadPatients}
            toast={toast}
          />
        )

      // ── Cadastro de paciente ─────────────────────────────────────
      // Secretária acessa mas apenas campos básicos (Registration controla internamente)
      case "register":
        if (isDoctor && !editingPatient) {
          return (
            <Patients
              patients={visiblePatients}
              onNavigate={handleNavigate}
              onEditPatient={handleEditPatient}
              onViewProfile={handleViewProfile}
              canCreatePatient={false}
              onRefresh={reloadPatients}
              toast={toast}
            />
          )
        }
        return (
          <Registration
            patients={patients}
            editingPatient={editingPatient}
            onAddPatient={handleAddPatient}
            onAddPatientWithPassword={handleAddPatientWithPassword}
            onCreatePatientAccess={handleCreatePatientAccess}
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
            onDeleteAppointment={canDo(currentUser.role, "delete_appointments") ? deleteAppointment : undefined}
          />
        )

      case "availability":
        return <Availability currentUser={currentUser} />

      // ── Relatórios / Laudos ──────────────────────────────────────
      case "reports":
        return <Reports currentUser={currentUser} patients={isDoctor ? patients : visiblePatients} staff={staff} />

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
            onRefresh={reloadStaff}
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
