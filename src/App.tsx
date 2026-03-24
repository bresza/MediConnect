import { useState, useEffect } from "react"
import { Sidebar } from "./components/layout/Sidebar/Sidebar"
import { Dashboard } from "./pages/Dashboard/Dashboard"
import { Patients } from "./pages/Patients/Patients"
import { Registration } from "./pages/Registration/Registration"
import { Appointments } from "./pages/Appointments/Appointments"
import { Records } from "./pages/Records/Records"
import { Reports } from "./pages/Reports/Reports"
import { Messages } from "./pages/Messages/Messages"
import { Financial } from "./pages/Financial/Financial"
import { Settings } from "./pages/Settings/Settings"
import { PATIENTS, APPOINTMENTS, MEDICAL_RECORDS } from "./data/mock"
import type { PageId, Patient, Appointment, MedicalRecord } from "./types"
import styles from "./App.module.css"

export default function App() {
  const [activePage, setActivePage]     = useState<PageId>("dashboard")
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [darkMode, setDarkMode]         = useState(() => localStorage.getItem("theme") === "dark")

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode)
    localStorage.setItem("theme", darkMode ? "dark" : "light")
  }, [darkMode])
  const [patients, setPatients]         = useState<Patient[]>(PATIENTS)
  const [appointments, setAppointments] = useState<Appointment[]>(APPOINTMENTS)
  const [records, setRecords]           = useState<MedicalRecord[]>(MEDICAL_RECORDS)
  const [editingPatient, setEditingPatient]   = useState<Patient | null>(null)
  const [recordsPatientId, setRecordsPatientId] = useState<number | null>(null)

  function addPatient(p: Patient) {
    setPatients((prev) => [...prev, p])
  }

  function updatePatient(updated: Patient) {
    setPatients((prev) => prev.map((p) => p.id === updated.id ? updated : p))
  }

  function addAppointment(a: Appointment) {
    setAppointments((prev) => [...prev, a])
  }

  function addRecord(r: MedicalRecord) {
    setRecords((prev) => [...prev, r])
  }

  function updateRecord(updated: MedicalRecord) {
    setRecords((prev) => prev.map((r) => r.id === updated.id ? updated : r))
  }

  function handleNavigate(page: PageId) {
    if (page !== "register") setEditingPatient(null)
    if (page !== "records")  setRecordsPatientId(null)
    setActivePage(page)
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

  function renderPage() {
    switch (activePage) {
      case "dashboard":    return <Dashboard    patients={patients} appointments={appointments} onNavigate={setActivePage} />
      case "patients":     return <Patients     patients={patients} onNavigate={setActivePage} onEditPatient={handleEditPatient} onViewRecords={handleViewRecords} />
      case "register":     return <Registration patients={patients} editingPatient={editingPatient} onAddPatient={addPatient} onUpdatePatient={updatePatient} onNavigate={setActivePage} />
      case "appointments": return <Appointments appointments={appointments} patients={patients} onAddAppointment={addAppointment} />
      case "records":      return <Records key={recordsPatientId ?? 0} records={records} patients={patients} filterPatientId={recordsPatientId} onAddRecord={addRecord} onUpdateRecord={updateRecord} onNavigate={handleNavigate} />
      case "reports":      return <Reports />
      case "messages":     return <Messages />
      case "financial":    return <Financial />
      case "settings":     return <Settings />
      default:             return <Dashboard    patients={patients} appointments={appointments} onNavigate={setActivePage} />
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
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(d => !d)}
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
