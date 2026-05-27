import type { PageId, User } from "../../../types"
import type { PortalSection } from "../../../pages/PatientPortal/patientPortalSections"
import { ROLE_PAGES, ROLE_LABELS, ROLE_COLORS } from "../../../utils/permissions"
import { getInitials } from "../../../utils"
import { prefetchPageChunk } from "../../../utils/routePrefetch"
import { PatientPortalSidebarNav } from "./PatientPortalSidebarNav"
import styles from "./Sidebar.module.css"

interface NavItem { id: PageId; label: string; icon: string }
interface NavGroup { section?: string; items: NavItem[] }

const ALL_NAV_GROUPS: NavGroup[] = [
  {
    section: "Principal",
    items: [
      { id: "dashboard",    label: "Início",        icon: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" },
      { id: "patient-portal", label: "Minha saúde", icon: "M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z" },
      { id: "patients",     label: "Pacientes",     icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" },
      { id: "appointments", label: "Agenda",        icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
      { id: "availability", label: "Disponibilidade", icon: "M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
    ],
  },
  {
    section: "Clínica",
    items: [
      { id: "reports",  label: "Relatórios",  icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
      { id: "messages", label: "Mensagens",   icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" },
    ],
  },
  {
    section: "Gestão",
    items: [
      { id: "financial", label: "Financeiro",    icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
      { id: "team",      label: "Equipe",        icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
      { id: "settings",  label: "Configurações", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
    ],
  },
]

function NavIcon({ path }: { path: string }) {
  return (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8"
      viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {path.split("M").filter(Boolean).map((d, i) => <path key={i} d={"M" + d} />)}
    </svg>
  )
}

interface SidebarProps {
  activePage:   PageId
  onNavigate:   (page: PageId) => void
  currentUser:  User
  onLogout:     () => void
  isOpen?:      boolean
  onClose?:     () => void
  darkMode?:    boolean
  onToggleDark?: () => void
  patientPortalSection?: PortalSection
  onPatientPortalSectionChange?: (section: PortalSection) => void
  patientPortalCounts?: Partial<Record<PortalSection, number>>
}

export function Sidebar({
  activePage,
  onNavigate,
  currentUser,
  onLogout,
  isOpen = false,
  onClose,
  darkMode,
  onToggleDark,
  patientPortalSection = "overview",
  onPatientPortalSectionChange,
  patientPortalCounts,
}: SidebarProps) {
  const isPatient = currentUser.role === "patient"
  const allowedPages = ROLE_PAGES[currentUser.role] ?? []

  const visibleGroups = ALL_NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((item) => allowedPages.includes(item.id)) }))
    .filter((g) => g.items.length > 0)

  const roleColor = ROLE_COLORS[currentUser.role] ?? "#6366f1"

  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ""}`}>

      {/* Logo */}
      <div className={styles.logo}>
        <div className={styles.logoIcon}>
          <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.2"
            viewBox="0 0 24 24" strokeLinecap="round">
            <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z" />
            <path d="M12 8v8M8 12h8" />
          </svg>
        </div>
        <div style={{ minWidth: 0 }}>
          <p className={styles.logoName}>Mediconnect</p>
          <p className={styles.logoClinic}>Clínica Central</p>
        </div>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Fechar menu">
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"
            viewBox="0 0 24 24" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Badge de perfil */}
      <div style={{
        margin: "0 12px 16px",
        padding: "8px 12px",
        borderRadius: 8,
        background: `${roleColor}18`,
        border: `1px solid ${roleColor}35`,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: roleColor, flexShrink: 0,
        }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: roleColor, fontFamily: "var(--font-sans)", margin: 0 }}>
            {ROLE_LABELS[currentUser.role]}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className={styles.nav}>
        {isPatient && onPatientPortalSectionChange ? (
          <div>
            <span className={styles.navSection}>Minha saúde</span>
            <PatientPortalSidebarNav
              active={patientPortalSection}
              counts={patientPortalCounts}
              onChange={(section) => {
                onPatientPortalSectionChange(section)
                onNavigate("patient-portal")
                onClose?.()
              }}
            />
          </div>
        ) : (
          visibleGroups.map((group, gi) => (
            <div key={gi}>
              {group.section && <span className={styles.navSection}>{group.section}</span>}
              <ul className={styles.navList}>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => onNavigate(item.id)}
                      onMouseEnter={() => prefetchPageChunk(item.id)}
                      onFocus={() => prefetchPageChunk(item.id)}
                      className={`${styles.navBtn} ${activePage === item.id ? styles.navBtnActive : ""}`}
                    >
                      <NavIcon path={item.icon} />
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </nav>

      {/* Theme toggle */}
      <div className={styles.themeRow}>
        <span className={styles.themeLabel}>{darkMode ? "Modo noturno" : "Modo claro"}</span>
        <button onClick={onToggleDark} className={styles.themeBtn} aria-label="Alternar tema">
          {darkMode ? (
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"
              viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          ) : (
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"
              viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
          )}
        </button>
      </div>

      {/* User */}
      <div className={styles.user}>
        <div className={styles.userCard}>
          <div className={styles.userAvatar} style={{ background: roleColor }}>
            {getInitials(currentUser.name)}
          </div>
          <div className={styles.userInfo}>
            <p className={styles.userName}>{currentUser.name}</p>
            <p className={styles.userRole}>{ROLE_LABELS[currentUser.role]}</p>
          </div>
          <button onClick={onLogout} className={styles.logoutBtn} title="Sair" aria-label="Sair">
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"
              viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  )
}
