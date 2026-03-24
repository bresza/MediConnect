import { useState } from "react"
import { Sidebar } from "./components/layout/Sidebar/Sidebar"
import { Dashboard } from "./pages/Dashboard/Dashboard"
import { Patients } from "./pages/Patients/Patients"
import { Registration } from "./pages/Registration/Registration"
import { Appointments } from "./pages/Appointments/Appointments"
import { Reports } from "./pages/Reports/Reports"
import { Messages } from "./pages/Messages/Messages"
import { Financial } from "./pages/Financial/Financial"
import { Settings } from "./pages/Settings/Settings"
import type { PageId } from "./types"
import styles from "./App.module.css"

export default function App() {
  const [activePage, setActivePage]   = useState<PageId>("dashboard")
  const [sidebarOpen, setSidebarOpen] = useState(false)

  function renderPage() {
    switch (activePage) {
      case "dashboard":    return <Dashboard    onNavigate={setActivePage} />
      case "patients":     return <Patients     onNavigate={setActivePage} />
      case "register":     return <Registration onNavigate={setActivePage} />
      case "appointments": return <Appointments />
      case "records":      return <Patients     onNavigate={setActivePage} />
      case "reports":      return <Reports />
      case "messages":     return <Messages />
      case "financial":    return <Financial />
      case "settings":     return <Settings />
      default:             return <Dashboard    onNavigate={setActivePage} />
    }
  }

  function handleNavigate(page: PageId) {
    setActivePage(page)
    setSidebarOpen(false)
  }

  return (
    <div className={styles.layout}>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className={styles.backdrop} onClick={() => setSidebarOpen(false)} />
      )}

      <Sidebar
        activePage={activePage}
        onNavigate={handleNavigate}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className={styles.main}>

        {/* Mobile top bar */}
        <div className={styles.mobileTopbar}>
          <button
            className={styles.hamburgerBtn}
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
          >
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
