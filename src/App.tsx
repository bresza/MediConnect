import { useState, useEffect } from "react"
import { Sidebar } from "./components/layout/Sidebar/Sidebar"
import { Login } from "./pages/Login/Login"
import { Dashboard } from "./pages/Dashboard/Dashboard"
import { Patients } from "./pages/Patients/Patients"
import { Registration } from "./pages/Registration/Registration"
import { Appointments } from "./pages/Appointments/Appointments"
import { Records } from "./pages/Records/Records"
import { Reports } from "./pages/Reports/Reports"
import { PatientProfile } from "./pages/PatientProfile/PatientProfile"
import { Messages } from "./pages/Messages/Messages"
import { Financial } from "./pages/Financial/Financial"
import { Settings } from "./pages/Settings/Settings"
import { PATIENTS, APPOINTMENTS, MEDICAL_RECORDS, PRESCRIPTIONS } from "./data/mock"
import { canAccess, getDefaultPage } from "./utils/permissions"
import type { PageId, Patient, Appointment, MedicalRecord, Prescription, User } from "./types"
import styles from "./App.module.css"

export default function App() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark")

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode)
    localStorage.setItem("theme", darkMode ? "dark" : "light")
  }, [darkMode])

  const [currentUser, setCurrentUser]   = useState<User | null>(null)
  const [activePage, setActivePage]     = useState<PageId>("dashboard")
  const [sidebarOpen, setSidebarOpen]   = useState(false)

  const [patients, setPatients]         = useState<Patient[]>(PATIENTS)
  const [appointments, setAppointments] = useState<Appointment[]>(APPOINTMENTS)
  const [records, setRecords]           = useState<MedicalRecord[]>(MEDICAL_RECORDS)
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(PRESCRIPTIONS)
  const [editingPatient, setEditingPatient]         = useState<Patient | null>(null)
  const [recordsPatientId, setRecordsPatientId]     = useState<number | null>(null)
  const [viewingPatient, setViewingPatient]         = useState<Patient | null>(null)

  function handleLogin(user: User) {
    setCurrentUser(user)
    setActivePage(getDefaultPage(user.role))
  }

  function handleLogout() {
    setCurrentUser(null)
    setActivePage("dashboard")
  }

  function addPatient(p: Patient)       { setPatients((prev) => [...prev, p]) }
  function updatePatient(u: Patient)    { setPatients((prev) => prev.map((p) => p.id === u.id ? u : p)) }
  function addAppointment(a: Appointment) { setAppointments((prev) => [...prev, a]) }
  function addRecord(r: MedicalRecord)  { setRecords((prev) => [...prev, r]) }
  function updateRecord(u: MedicalRecord) { setRecords((prev) => prev.map((r) => r.id === u.id ? u : r)) }
  function addPrescription(p: Prescription) { setPrescriptions((prev) => [...prev, p]) }

  function handleNavigate(page: PageId) {
    if (!currentUser) return
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
    setRecordsPatientId(patient.id)
    setActivePage("records")
    setSidebarOpen(false)
  }

  // ── Render ─────────────────────────────────────────────────────
  if (!currentUser) {
    return <Login onLogin={handleLogin} darkMode={darkMode} onToggleDark={() => setDarkMode((d) => !d)} />
  }

  function renderPage() {
    if (!currentUser || !canAccess(currentUser.role, activePage)) {
      return (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
          <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Acesso restrito</p>
          <p style={{ fontSize: 13 }}>Você não tem permissão para acessar este módulo.</p>
        </div>
      )
    }
    // Para médicos: filtrar dados pelos seus próprios registros
    const isDoctor = currentUser.role === "doctor"
    const doctorPatientIds = isDoctor
      ? new Set(appointments.filter(a => a.doctorName === currentUser.name).map(a => a.patientId))
      : null
    const visiblePatients = isDoctor ? patients.filter(p => doctorPatientIds!.has(p.id)) : patients
    // Doctors see ALL records for their patients (cross-doctor access for continuity of care)
    const visibleRecords  = isDoctor ? records.filter(r => doctorPatientIds!.has(r.patientId)) : records
    const visiblePrescriptions = isDoctor ? prescriptions.filter(p => doctorPatientIds!.has(p.patientId)) : prescriptions

    switch (activePage) {
      case "dashboard":    return <Dashboard    patients={visiblePatients} appointments={appointments} currentUser={currentUser} onNavigate={setActivePage} />
      case "patients":     return <Patients     patients={visiblePatients} onNavigate={setActivePage} onEditPatient={handleEditPatient} onViewRecords={handleViewRecords} onViewProfile={handleViewProfile} />
      case "patient-profile": return viewingPatient
        ? <PatientProfile patient={viewingPatient} records={visibleRecords} appointments={appointments} prescriptions={visiblePrescriptions} currentUser={currentUser} onNavigate={handleNavigate} onEditPatient={handleEditPatient} onViewRecords={handleViewRecords} onAddPrescription={addPrescription} />
        : <Patients patients={visiblePatients} onNavigate={setActivePage} onEditPatient={handleEditPatient} onViewRecords={handleViewRecords} onViewProfile={handleViewProfile} />
      case "register":     return <Registration patients={patients} editingPatient={editingPatient} onAddPatient={addPatient} onUpdatePatient={updatePatient} onNavigate={setActivePage} />
      case "appointments": return <Appointments appointments={appointments} patients={visiblePatients} currentUser={currentUser} onAddAppointment={addAppointment} />
      case "records":      return <Records key={recordsPatientId ?? 0} records={visibleRecords} patients={visiblePatients} filterPatientId={recordsPatientId} currentUser={currentUser} onAddRecord={addRecord} onUpdateRecord={updateRecord} onNavigate={handleNavigate} />
      case "reports":      return <Reports currentUser={currentUser} />
      case "messages":     return <Messages />
      case "financial":    return <Financial />
      case "settings":     return <Settings />
      default:             return <Dashboard    patients={visiblePatients} appointments={appointments} currentUser={currentUser} onNavigate={setActivePage} />
    }
  }

  return (
    <div className={styles.layout}>
      {sidebarOpen && (
        <div className={styles.backdrop} onClick={() => setSidebarOpen(false)} />
      )}

      <Sidebar
        activePage={activePage}
        onNavigate={handleNavigate}
        currentUser={currentUser}
        onLogout={handleLogout}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((d) => !d)}
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
          {renderPage()}
        </div>
      </main>
    </div>
  )
}
