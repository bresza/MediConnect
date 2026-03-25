import { useState } from "react"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Badge } from "../../components/ui/Badge/Badge"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Button } from "../../components/ui/Button/Button"
import { formatDate } from "../../utils"
import type { PageId, Patient } from "../../types"
import styles from "./Patients.module.css"

interface PatientsProps {
  patients: Patient[]
  onNavigate: (page: PageId) => void
  onEditPatient: (p: Patient) => void
  onViewRecords?: (p: Patient) => void
  onViewProfile?: (p: Patient) => void
}

const SearchIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
  </svg>
)

const PlusIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"
    viewBox="0 0 24 24" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export function Patients({ patients, onNavigate, onEditPatient, onViewRecords, onViewProfile }: PatientsProps) {
  const [search, setSearch]             = useState("")
  const [filterStatus, setFilterStatus] = useState<"All" | "Active" | "Inactive">("All")

  const filtered = patients.filter((p) =>
    (filterStatus === "All" || p.status === filterStatus) &&
    (p.name.toLowerCase().includes(search.toLowerCase()) || p.cpf.includes(search))
  )

  const FILTER_LABELS = { All: "Todos", Active: "Ativo", Inactive: "Inativo" } as const

  return (
    <div>
      <Topbar
        title="Pacientes"
        subtitle={`${patients.length} pacientes cadastrados`}
        action={
          <Button onClick={() => onNavigate("register")} icon={<PlusIcon />}>
            Novo paciente
          </Button>
        }
      />

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.searchWrapper}>
          <span className={styles.searchIcon}><SearchIcon /></span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou CPF..."
            className={styles.searchInput}
          />
        </div>
        {(["All", "Active", "Inactive"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`${styles.filterBtn} ${filterStatus === s ? styles.filterBtnActive : ""}`}
          >
            {FILTER_LABELS[s]}
          </button>
        ))}
      </div>

      <Card>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                {["Paciente", "CPF", "Convênio", "Última visita", "Status", "Ações"].map((h) => (
                  <th key={h} className={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const isLast = i === filtered.length - 1
                return (
                  <tr
                    key={p.id}
                    className={styles.clickableRow}
                    onClick={() => onViewProfile?.(p)}
                  >
                    <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>
                      <div className={styles.patientCell}>
                        {p.photoUrl
                          ? <img src={p.photoUrl} alt={p.name} className={styles.patientPhoto} />
                          : <Avatar name={p.name} size="sm" />
                        }
                        <div>
                          <p className={styles.patientName}>{p.name}</p>
                          <p className={styles.patientEmail}>{p.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>{p.cpf}</td>
                    <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>{p.healthInsurance ?? "—"}</td>
                    <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>{p.lastVisit ? formatDate(p.lastVisit) : "—"}</td>
                    <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}><Badge>{p.status}</Badge></td>
                    <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>
                      <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" onClick={() => onEditPatient(p)}>Editar</Button>
                        <Button size="sm" variant="ghost" onClick={() => onViewRecords?.(p)}>Prontuário</Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
