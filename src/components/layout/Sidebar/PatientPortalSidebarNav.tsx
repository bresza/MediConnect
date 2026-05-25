import { PORTAL_NAV_ITEMS, type PortalSection } from "../../../pages/PatientPortal/patientPortalSections"
import styles from "./PatientPortalSidebarNav.module.css"

function NavIcon({ path }: { path: string }) {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"
      viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {path.split("M").filter(Boolean).map((d, i) => <path key={i} d={`M${d}`} />)}
    </svg>
  )
}

interface PatientPortalSidebarNavProps {
  active: PortalSection
  counts?: Partial<Record<PortalSection, number>>
  onChange: (section: PortalSection) => void
}

export function PatientPortalSidebarNav({ active, counts, onChange }: PatientPortalSidebarNavProps) {
  return (
    <ul className={styles.list}>
      {PORTAL_NAV_ITEMS.map((item) => {
        const count = counts?.[item.id]
        const isActive = active === item.id
        return (
          <li key={item.id}>
            <button
              type="button"
              className={`${styles.item} ${isActive ? styles.itemActive : ""}`}
              onClick={() => onChange(item.id)}
              aria-current={isActive ? "page" : undefined}
            >
              <span className={styles.iconWrap}>
                <NavIcon path={item.icon} />
                {count !== undefined && count > 0 && (
                  <em className={styles.badge}>{count > 99 ? "99+" : count}</em>
                )}
              </span>
              <span className={styles.label}>{item.label}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
