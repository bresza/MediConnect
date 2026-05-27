import { Suspense, useMemo, useState } from "react"
import { Sidebar }        from "./components/layout/Sidebar/Sidebar"
import { AIAssistant }    from "./components/ui/AIAssistant/AIAssistant"
import { ToastContainer } from "./components/ui/ToastContainer/ToastContainer"
import { PageLoader }     from "./components/ui/PageLoader/PageLoader"
import { PageSkeleton }   from "./components/ui/PageSkeleton/PageSkeleton"
import {
  Dashboard,
  Patients,
  Registration,
  Appointments,
  Availability,
  Reports,
  PatientProfile,
  PatientPortal,
  Messages,
  Financial,
  Settings,
  Team,
} from "./pages/lazyPages"
import type { PortalSection } from "./pages/PatientPortal/patientPortalSections"
import {
  cancelPatientAppointment,
  createPatientAppointment,
  updatePatientAppointment,
} from "./services/appointments"
import {
  canAccess,
  canDo,
  canManageMedicalRecords,
  canViewClinicalData,
  getDefaultPage,
} from "./utils/permissions"
import { buildAIApiContextFromAppState } from "./services/aiContext"
import { createAppAIActions } from "./services/aiActions"
import { useAuth }          from "./contexts/authStore"
import { usePatients }      from "./hooks/usePatients"
import { useAppointments }  from "./hooks/useAppointments"
import { useMedicalData }   from "./hooks/useMedicalData"
import { useFinancial }     from "./hooks/useFinancial"
import { useStaff }         from "./hooks/useStaff"
import { usePatientAIData } from "./hooks/usePatientAIData"
import { useToast }                 from "./hooks/useToast"
import { useDelayedLoading }        from "./hooks/useDelayedLoading"
import { useMessagingAutomation }   from "./hooks/useMessagingAutomation"
import type { Appointment, PageId, Patient } from "./types"
import styles from "./App.module.css"

interface AppRouterProps { darkMode: boolean; onToggleDark: () => void }

export function AppRouter({ darkMode, onToggleDark }: AppRouterProps) {
  const { user, logout, clinicName } = useAuth()

  const [activePage,       setActivePage]       = useState<PageId>(() => getDefaultPage(user?.role ?? "secretary"))
  const [sidebarOpen,      setSidebarOpen]      = useState(false)
  const [patientPortalSection, setPatientPortalSection] = useState<PortalSection>("overview")
  const [patientPortalCounts, setPatientPortalCounts] = useState<Partial<Record<PortalSection, number>>>({})
  const [editingPatient,   setEditingPatient]   = useState<Patient | null>(null)
  const [viewingPatient,   setViewingPatient]   = useState<Patient | null>(null)

  const userRole = user?.role
  const loadStaffRole = Boolean(
    userRole && (canAccess(userRole, "team") || userRole === "manager" || userRole === "admin"),
  )
  const loadFinancialRole = Boolean(
    userRole && (canAccess(userRole, "financial") || canAccess(userRole, "appointments")),
  )
  const loadMedicalRole = Boolean(
    userRole &&
    userRole !== "patient" &&
    canViewClinicalData(userRole) &&
    (canAccess(userRole, "reports") ||
      canAccess(userRole, "patient-profile") ||
      canAccess(userRole, "appointments")),
  )

  const loadMedical = loadMedicalRole && (
    activePage === "patient-profile" ||
    activePage === "appointments" ||
    activePage === "reports"
  )
  const loadFinancial = loadFinancialRole && activePage === "financial"
  const loadStaff = loadStaffRole && (activePage === "team" || activePage === "availability")

  const {
    patients, addPatient, addPatientWithPassword, createPatientAccess, updatePatient, deletePatient,
    error: patientsError, isLoading: patientsLoading, reload: reloadPatients,
  } = usePatients()
  const {
    appointments, addAppointment, updateAppointment,
    error: appointmentsError, isLoading: appointmentsLoading, reload: reloadAppointments,
  } = useAppointments()
  const {
    prescriptions, addPrescription, addMedicalRecord,
    error: medicalDataError, reload: reloadMedicalData,
  } = useMedicalData({ enabled: loadMedical })
  const {
    records: financialRecords,
    addRecord: addFinancialRecord,
    updateRecord: updateFinancialRecord,
    deleteRecord: deleteFinancialRecord,
    reload: reloadFinancial,
  } = useFinancial({ enabled: loadFinancial })
  const {
    staff, addStaff, updateStaff, deleteStaff,
    error: staffError, reload: reloadStaff,
  } = useStaff({ enabled: loadStaff })
  const { toasts,       toast,         dismiss }                                       = useToast()
  const patientAIData = usePatientAIData(user)

  const automationAppointments = useMemo(() => {
    if (!user || user.role === "patient") return []
    if (user.role === "doctor") {
      return appointments.filter(
        (a) =>
          a.doctorId === user.id ||
          a.doctorName === user.name ||
          a.doctorName?.toLowerCase().trim() === user.name.toLowerCase().trim(),
      )
    }
    return appointments
  }, [user, appointments])

  const automationPatients = useMemo(() => {
    if (!user || user.role === "patient") return []
    if (user.role === "doctor") {
      const ids = new Set(automationAppointments.map((a) => a.patientId))
      return patients.filter((p) => ids.has(p.id))
    }
    return patients
  }, [user, patients, automationAppointments])

  useMessagingAutomation({
    enabled: Boolean(user && user.role !== "patient" && canAccess(user.role, "messages")),
    appointments: automationAppointments,
    patients: automationPatients,
    clinicName: clinicName ?? undefined,
    onActivity: (summary) => toast(summary, "info"),
  })

  const reloadAll = async () => {
    await Promise.all([
      reloadPatients(),
      reloadAppointments(),
      reloadMedicalData(),
      reloadFinancial(),
      reloadStaff(),
    ])
  }

  const showCoreSkeleton = useDelayedLoading(patientsLoading || appointmentsLoading)

  const isDoctor    = user?.role === "doctor"
  const isPatient   = user?.role === "patient"
  const isSecretary = user?.role === "secretary"
  const onlyDigits = (value?: string) => value?.replace(/\D/g, "") ?? ""
  const isCurrentDoctor = (doctorId?: string, doctorName?: string) =>
    Boolean(user) && (
      doctorId === user!.id ||
      doctorName === user!.name ||
      doctorName?.toLowerCase().trim() === user!.name.toLowerCase().trim()
    )

  const linkedPatient = isPatient && user
    ? patients.find((p) =>
      (user.patientId && p.id === user.patientId) ||
      p.userId === user.id ||
      (!!user.patientCpf && onlyDigits(p.cpf) === user.patientCpf) ||
      (!!user.email && p.email?.toLowerCase().trim() === user.email.toLowerCase().trim())) ?? null
    : null
  const fallbackPatient: Patient | null = isPatient && user && !linkedPatient
    ? {
      id: user.patientId ?? user.id,
      name: user.name,
      cpf: user.patientCpf ?? "",
      email: user.email,
      phone: user.phone ?? "",
      dob: user.dob ?? "",
      status: "Active",
    }
    : null
  const portalPatient = linkedPatient ?? fallbackPatient
  const linkedPatientId = portalPatient?.id ?? user?.patientId ?? ""

  const doctorAppts = isDoctor
    ? appointments.filter((a) => isCurrentDoctor(a.doctorId, a.doctorName))
    : appointments
  const doctorPatientIds = useMemo(
    () => (isDoctor ? new Set(doctorAppts.map((a) => a.patientId)) : null),
    [isDoctor, doctorAppts],
  )

  const visiblePatients = useMemo(() => {
    if (isPatient) return portalPatient ? [portalPatient] : []
    if (isDoctor && doctorPatientIds) return patients.filter((p) => doctorPatientIds.has(p.id))
    return patients
  }, [isPatient, isDoctor, portalPatient, patients, doctorPatientIds])

  const visibleAppointments = useMemo(() => {
    if (isPatient) return appointments.filter((a) => a.patientId === linkedPatientId)
    return doctorAppts
  }, [isPatient, appointments, linkedPatientId, doctorAppts])

  const visiblePrescriptions = useMemo(() => {
    if (isPatient) return prescriptions.filter((p) => p.patientId === linkedPatientId)
    if (isDoctor && doctorPatientIds) return prescriptions.filter((p) => doctorPatientIds.has(p.patientId))
    return prescriptions
  }, [isPatient, isDoctor, prescriptions, linkedPatientId, doctorPatientIds])

  if (!user) return null
  const currentUser = user

  const aiPatients = isPatient
    ? (patientAIData.patient ? [patientAIData.patient] : visiblePatients)
    : visiblePatients
  const aiAppointments = isPatient ? patientAIData.appointments : visibleAppointments
  const aiPrescriptions = isPatient ? patientAIData.prescriptions : visiblePrescriptions

  const aiApiContextSnapshot = buildAIApiContextFromAppState({
    role:          currentUser.role,
    activePage,
    patients:      aiPatients,
    appointments:  aiAppointments,
    prescriptions: aiPrescriptions,
    staff:         isPatient ? [] : staff,
    reports:       isPatient ? patientAIData.reports : undefined,
  })

  const dataErrors = [
    patientsError && `Pacientes: ${patientsError}`,
    appointmentsError && `Agenda: ${appointmentsError}`,
    medicalDataError && `Laudos/receitas: ${medicalDataError}`,
    staffError && `Equipe: ${staffError}`,
  ].filter(Boolean)

  const patientIdentity = {
    patientId: linkedPatientId || currentUser.patientId,
    userId: currentUser.id,
    email: currentUser.email,
    cpf: currentUser.patientCpf,
    name: currentUser.name,
  }

  async function handlePatientBookAppointment(appointment: Omit<Appointment, "id">) {
    await createPatientAppointment(appointment, patientIdentity)
    await reloadAppointments()
    toast("Consulta agendada com sucesso.", "success")
  }

  async function handlePatientCancelAppointment(appointment: Appointment, reason: string) {
    await cancelPatientAppointment(appointment, patientIdentity, reason)
    await reloadAppointments()
    toast("Consulta cancelada com sucesso.", "success")
  }

  async function handlePatientUpdateAppointment(appointment: Appointment) {
    try {
      await updatePatientAppointment(appointment, patientIdentity)
      await reloadAppointments()
      toast("Consulta atualizada com sucesso.", "success")
    } catch (err) {
      toast(err instanceof Error ? err.message : "Não foi possível atualizar a consulta.", "error")
      throw err
    }
  }

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
    try {
      await updatePatient(p)
      toast(`Dados de ${p.name} atualizados.`, "success")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível atualizar o paciente."
      toast(message, "error")
      throw err
    }
  }
  async function handleDeletePatient(id: string) {
    const target = patients.find((p) => p.id === id)
    await deletePatient(id)
    if (target) toast(`Paciente ${target.name} removido.`, "info")
  }

  const appAIActions = createAppAIActions({
    role: currentUser.role,
    currentUser,
    activePage,
    clinicName: clinicName ?? undefined,
    patients: visiblePatients,
    appointments: visibleAppointments,
    staff: isPatient ? [] : staff,
    prescriptions: visiblePrescriptions,
    portalPatient,
    navigate: handleNavigate,
    setPortalSection: setPatientPortalSection,
    reloadAll,
    addAppointment,
    updateAppointment,
    bookPatientAppointment: isPatient ? handlePatientBookAppointment : undefined,
    cancelPatientAppointment: isPatient ? handlePatientCancelAppointment : undefined,
    addMedicalRecord,
  })

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
      case "patient-portal":
        return (
          <PatientPortal
            currentUser={currentUser}
            patient={portalPatient}
            appointments={visibleAppointments}
            prescriptions={visiblePrescriptions}
            activeSection={patientPortalSection}
            onSectionChange={setPatientPortalSection}
            onNavCountsChange={setPatientPortalCounts}
            onBookAppointment={handlePatientBookAppointment}
            onCancelAppointment={handlePatientCancelAppointment}
            onUpdateAppointment={handlePatientUpdateAppointment}
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
            onRefresh={reloadAll}
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
            canCreatePatient={canAccess(currentUser.role, "register")}
            toast={toast}
            onRefresh={reloadPatients}
            loadError={patientsError}
          />
        )

      // ── Perfil do paciente ──────────────────────────────────────
      case "patient-profile":
        return viewingPatient ? (
          <PatientProfile
            patient={viewingPatient}
            appointments={visibleAppointments}
            prescriptions={visiblePrescriptions}
            currentUser={currentUser}
            onNavigate={handleNavigate}
            onEditPatient={handleEditPatient}
            onAddPrescription={canDo(currentUser.role, "create_reports")
              ? (async (p) => { await addPrescription(p) })
              : async () => {}}
          />
        ) : (
          <Patients
            patients={visiblePatients}
            onNavigate={handleNavigate}
            onEditPatient={handleEditPatient}
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
            onRefresh={reloadAppointments}
            onAddMedicalRecord={canManageMedicalRecords(currentUser.role) ? addMedicalRecord : undefined}
            onAddPrescription={canDo(currentUser.role, "create_reports") ? addPrescription : undefined}
            onAddFinancialRecord={
              canDo(currentUser.role, "manage_financial") || canDo(currentUser.role, "view_financial")
                ? addFinancialRecord
                : undefined
            }
          />
        )

      case "availability":
        return <Availability currentUser={currentUser} />

      // ── Relatórios / Laudos ──────────────────────────────────────
      case "reports":
        return <Reports currentUser={currentUser} patients={visiblePatients} />

      // ── Mensagens ────────────────────────────────────────────────
      case "messages":
        return (
          <Messages
            appointments={visibleAppointments}
            patients={visiblePatients}
            clinicName={clinicName ?? undefined}
          />
        )

      // ── Financeiro — somente gestor e financeiro ─────────────────
      case "financial":
        return (
          <Financial
            patients={visiblePatients}
            records={financialRecords}
            onAddRecord={addFinancialRecord}
            onUpdateRecord={updateFinancialRecord}
            onDeleteRecord={deleteFinancialRecord}
            onReload={reloadFinancial}
          />
        )

      // ── Equipe — somente gestão ──────────────────────────────────
      case "team":
        return (
          <Team
            staff={staff}
            onAdd={addStaff}
            onUpdate={updateStaff}
            onDelete={deleteStaff}
            toast={toast}
            onRefresh={reloadStaff}
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
            onRefresh={reloadAll}
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
        patientPortalSection={patientPortalSection}
        onPatientPortalSectionChange={setPatientPortalSection}
        patientPortalCounts={patientPortalCounts}
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
        <div className={styles.content}>
          {dataErrors.length > 0 && (
            <div className={styles.dataAlert} role="alert">
              <strong>Falha ao carregar dados da API.</strong>
              <span>{dataErrors.join(" | ")}</span>
            </div>
          )}
          <Suspense fallback={<PageLoader />}>
            {showCoreSkeleton ? <PageSkeleton /> : renderPage()}
          </Suspense>
        </div>
      </main>
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      <AIAssistant
        currentUser={currentUser}
        clinicName={clinicName}
        apiContextSnapshot={aiApiContextSnapshot}
        appActions={appAIActions}
      />
    </div>
  )
}
