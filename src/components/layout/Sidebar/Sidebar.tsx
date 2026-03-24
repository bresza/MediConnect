import type { PageId } from "../../../types"
import styles from "./Sidebar.module.css"

interface NavItem { id: PageId; label: string; icon: string }

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard",    label: "Início",        icon: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" },
  { id: "patients",     label: "Pacientes",     icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" },
  { id: "register",     label: "Cadastro",      icon: "M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" },
  { id: "appointments", label: "Agenda",        icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { id: "records",      label: "Prontuários",   icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { id: "reports",      label: "Laudos",        icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { id: "messages",     label: "Mensagens",     icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" },
  { id: "financial",    label: "Financeiro",    icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { id: "settings",     label: "Configurações", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
]

function NavIcon({ path }: { path: string }) {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75"
      viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      {path.split("M").filter(Boolean).map((d, i) => (
        <path key={i} d={"M" + d} />
      ))}
    </svg>
  )
}

interface SidebarProps {
  activePage: PageId
  onNavigate: (page: PageId) => void
  isOpen?: boolean
  onClose?: () => void
  darkMode?: boolean
  onToggleDark?: () => void
}

export function Sidebar({ activePage, onNavigate, isOpen = false, onClose, darkMode, onToggleDark }: SidebarProps) {
  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ""}`}>

      {/* Logo */}
      <div className={styles.logo}>
        <div className={styles.logoIcon}>
          <svg width="15" height="15" fill="none" stroke="white" strokeWidth="2.2"
            viewBox="0 0 24 24" strokeLinecap="round">
            <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z" />
            <path d="M12 8v8M8 12h8" />
          </svg>
        </div>
        <div>
          <p className={styles.logoName}>Mediconnect</p>
          <p className={styles.logoClinic}>Clínica Central</p>
        </div>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Fechar menu">
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"
            viewBox="0 0 24 24" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className={styles.nav}>
        <span className={styles.navLabel}>Menu</span>
        <ul className={styles.navList}>
          {NAV_ITEMS.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onNavigate(item.id)}
                className={`${styles.navBtn} ${activePage === item.id ? styles.navBtnActive : ""}`}
              >
                <NavIcon path={item.icon} />
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Theme toggle */}
      <div className={styles.themeRow}>
        <span className={styles.themeLabel}>{darkMode ? "Modo noturno" : "Modo claro"}</span>
        <button
          onClick={onToggleDark}
          className={styles.themeBtn}
          aria-label="Alternar tema"
        >
          {darkMode ? (
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"
              viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          ) : (
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"
              viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
          )}
        </button>
      </div>

      {/* User */}
      <div className={styles.user}>
        <div className={styles.userCard}>
          <div className={styles.userAvatar}>DA</div>
          <div className={styles.userInfo}>
            <p className={styles.userName}>Dr. Admin</p>
            <p className={styles.userRole}>Gestão</p>
          </div>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"
            viewBox="0 0 24 24" strokeLinecap="round" className={styles.userChevron}>
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>
      </div>

    </aside>
  )
}
