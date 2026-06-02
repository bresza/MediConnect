"use no memo"

import { useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Button } from "../../components/ui/Button/Button"
import { Badge } from "../../components/ui/Badge/Badge"
import { formatCpfBR, formatDateOnly } from "../../utils"
import type { Patient } from "../../types"
import styles from "./Patients.module.css"

const ROW_HEIGHT = 64

const TrashIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
  </svg>
)

interface PatientsVirtualTableProps {
  patients: Patient[]
  onViewProfile?: (p: Patient) => void
  onEditPatient: (p: Patient) => void
  onRequestDelete?: (id: string) => void
}

export function PatientsVirtualTable({
  patients,
  onViewProfile,
  onEditPatient,
  onRequestDelete,
}: PatientsVirtualTableProps) {
  const listParentRef = useRef<HTMLDivElement>(null)

  // eslint-disable-next-line react-hooks/incompatible-library -- @tanstack/react-virtual
  const rowVirtualizer = useVirtualizer({
    count: patients.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  })

  return (
    <div className={styles.tableScroll} ref={listParentRef}>
      <table className={styles.table}>
        <thead className={styles.thead}>
          <tr>
            {["Paciente", "CPF", "Convênio", "Última visita", "Status", "Ações"].map((h) => (
              <th key={h} className={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const p = patients[virtualRow.index]
            const isLast = virtualRow.index === patients.length - 1
            return (
              <tr
                key={p.id}
                className={styles.clickableRow}
                onClick={() => onViewProfile?.(p)}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  display: "table",
                  tableLayout: "fixed",
                  boxSizing: "border-box",
                }}
              >
                <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>
                  <div className={styles.patientCell}>
                    {p.photoUrl ? (
                      <img src={p.photoUrl} alt={p.name} className={styles.patientPhoto} />
                    ) : (
                      <Avatar name={p.name} size="sm" />
                    )}
                    <div>
                      <p className={styles.patientName}>{p.name}</p>
                      <p className={styles.patientEmail}>{p.email}</p>
                    </div>
                  </div>
                </td>
                <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>{formatCpfBR(p.cpf) || "—"}</td>
                <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>{p.healthInsurance ?? "—"}</td>
                <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>
                  {p.lastVisit ? formatDateOnly(p.lastVisit) : "—"}
                </td>
                <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>
                  <Badge>{p.status}</Badge>
                </td>
                <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>
                  <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" onClick={() => onEditPatient(p)}>Editar</Button>
                    {onRequestDelete && (
                      <button
                        className={styles.deleteBtn}
                        onClick={() => onRequestDelete(p.id)}
                        title="Remover paciente"
                        type="button"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
