import { useMemo, useState } from "react"
import { Badge } from "../../components/ui/Badge/Badge"
import { Button } from "../../components/ui/Button/Button"
import { Drawer } from "../../components/ui/Drawer/Drawer"
import { formatAppointmentType, formatDate } from "../../utils"
import {
  canPatientManageAppointment,
  getPatientDisplayStatus,
  showInPatientScheduledTab,
} from "../../utils/patientAppointments"
import type { Appointment } from "../../types"
import styles from "./PatientConsultationsView.module.css"

interface PatientConsultationsViewProps {
  appointments: Appointment[]
  loading?: boolean
  statusLabels: Record<string, string>
  embedded?: boolean
  onBack?: () => void
  onBook?: () => void
  onReschedule?: (appointment: Appointment) => void
  onCancel?: (appointment: Appointment, reason: string) => Promise<void>
}

type TabId = "scheduled" | "cancelled"
type DrawerStep = "actions" | "cancel-reason"

function appointmentTs(appointment: Appointment): number {
  return new Date(`${appointment.date}T${appointment.time}:00`).getTime()
}

function isConsultationType(type: string): boolean {
  return type === "consultation" || type === "return"
}

function isCancelled(status: string): boolean {
  return status === "cancelled"
}

function displayStatus(appointment: Appointment): string {
  return getPatientDisplayStatus(appointment)
}

function AppointmentRow({
  appointment,
  muted = false,
  action,
}: {
  appointment: Appointment
  muted?: boolean
  action?: React.ReactNode
}) {
  return (
    <li className={`${styles.listRow} ${muted ? styles.listRowMuted : ""}`}>
      <div className={styles.listMain}>
        <div className={styles.listWhen}>
          <strong>{formatDate(appointment.date)}</strong>
          <span>{appointment.time}</span>
        </div>
        <div className={styles.listInfo}>
          <p>{formatAppointmentType(appointment.type)}</p>
          <span>Dr(a). {appointment.doctorName}</span>
        </div>
        <Badge>{displayStatus(appointment)}</Badge>
      </div>
      {action}
    </li>
  )
}

export function PatientConsultationsView({
  appointments,
  loading,
  statusLabels,
  embedded = false,
  onBack,
  onBook,
  onReschedule,
  onCancel,
}: PatientConsultationsViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>("scheduled")
  const [drawerAppointment, setDrawerAppointment] = useState<Appointment | null>(null)
  const [drawerStep, setDrawerStep] = useState<DrawerStep>("actions")
  const [cancelReason, setCancelReason] = useState("")
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const consultationList = useMemo(
    () => appointments
      .filter((a) => isConsultationType(a.type))
      .sort((a, b) => appointmentTs(a) - appointmentTs(b)),
    [appointments],
  )

  const scheduledList = useMemo(
    () => consultationList.filter((a) => showInPatientScheduledTab(a)),
    [consultationList],
  )

  const cancelledList = useMemo(
    () => consultationList
      .filter((a) => isCancelled(a.status))
      .sort((a, b) => appointmentTs(b) - appointmentTs(a)),
    [consultationList],
  )

  const visibleList = activeTab === "scheduled" ? scheduledList : cancelledList

  function openDrawer(appointment: Appointment) {
    setDrawerAppointment(appointment)
    setDrawerStep("actions")
    setCancelReason("")
    setCancelError(null)
    setSaving(false)
  }

  function closeDrawer() {
    setDrawerAppointment(null)
    setDrawerStep("actions")
    setCancelReason("")
    setCancelError(null)
  }

  function handleReschedule() {
    if (!drawerAppointment || !onReschedule) return
    const target = drawerAppointment
    closeDrawer()
    onReschedule(target)
  }

  async function handleConfirmCancel() {
    if (!drawerAppointment || !onCancel) return
    const reason = cancelReason.trim()
    if (!reason) {
      setCancelError("Descreva o motivo do cancelamento.")
      return
    }

    setSaving(true)
    setCancelError(null)
    try {
      await onCancel(drawerAppointment, reason)
      closeDrawer()
      setActiveTab("cancelled")
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Não foi possível cancelar a consulta.")
    } finally {
      setSaving(false)
    }
  }

  const drawerOpen = Boolean(drawerAppointment)
  const manageable = drawerAppointment ? canPatientManageAppointment(drawerAppointment) : false

  return (
    <div className={`${styles.wrap} ${embedded ? styles.wrapEmbedded : ""}`}>
      {!embedded && onBack && (
        <header className={styles.hero}>
          <button type="button" className={styles.backBtn} onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Voltar
          </button>
          <div className={styles.heroText}>
            <h1>Minhas consultas</h1>
            <p>Acompanhe agendamentos e cancelamentos</p>
          </div>
          {onBook && (
            <Button onClick={onBook} className={styles.bookBtn}>
              Agendar
            </Button>
          )}
        </header>
      )}

      <div className={styles.tabs} role="tablist" aria-label="Consultas">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "scheduled"}
          className={`${styles.tab} ${activeTab === "scheduled" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("scheduled")}
        >
          Agendadas
          <span className={styles.tabCount}>{scheduledList.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "cancelled"}
          className={`${styles.tab} ${activeTab === "cancelled" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("cancelled")}
        >
          Canceladas
          <span className={styles.tabCount}>{cancelledList.length}</span>
        </button>
      </div>

      <section className={styles.listPanel} role="tabpanel">
        {loading ? (
          <p className={styles.empty}>Carregando consultas...</p>
        ) : visibleList.length === 0 ? (
          <div className={styles.empty}>
            <strong>
              {activeTab === "scheduled"
                ? "Nenhuma consulta agendada"
                : "Nenhuma consulta cancelada"}
            </strong>
            <span>
              {activeTab === "scheduled"
                ? "Quando você agendar, seus horários aparecerão aqui."
                : "Consultas que você cancelar ficarão registradas nesta aba."}
            </span>
            {activeTab === "scheduled" && onBook && (
              <Button onClick={onBook} className={styles.emptyAction}>
                Agendar consulta
              </Button>
            )}
          </div>
        ) : (
          <ul className={styles.appointmentList}>
            {visibleList.map((appt) => (
              <AppointmentRow
                key={appt.id}
                appointment={appt}
                muted={activeTab === "cancelled"}
                action={
                  activeTab === "scheduled" && canPatientManageAppointment(appt) && (onCancel || onReschedule) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openDrawer(appt)}
                    >
                      Gerenciar
                    </Button>
                  ) : undefined
                }
              />
            ))}
          </ul>
        )}
      </section>

      <Drawer
        isOpen={drawerOpen}
        onClose={closeDrawer}
        title={drawerStep === "actions" ? "Gerenciar consulta" : "Motivo do cancelamento"}
        subtitle={
          drawerAppointment
            ? `${formatDate(drawerAppointment.date)} às ${drawerAppointment.time} — Dr(a). ${drawerAppointment.doctorName}`
            : undefined
        }
        footer={
          drawerStep === "actions" ? (
            <div className={styles.drawerFooterCol}>
              {onReschedule && manageable && (
                <Button variant="outline" onClick={handleReschedule} disabled={saving} className={styles.drawerFullBtn}>
                  Remarcar consulta
                </Button>
              )}
              {onCancel && manageable && (
                <Button variant="danger" onClick={() => setDrawerStep("cancel-reason")} disabled={saving} className={styles.drawerFullBtn}>
                  Cancelar consulta
                </Button>
              )}
              <Button variant="ghost" onClick={closeDrawer} disabled={saving} className={styles.drawerFullBtn}>
                Fechar
              </Button>
            </div>
          ) : (
            <div className={styles.drawerFooterCol}>
              <div className={styles.drawerFooterRow}>
                <Button variant="ghost" onClick={() => { setDrawerStep("actions"); setCancelError(null) }} disabled={saving}>
                  Voltar
                </Button>
                <Button variant="danger" onClick={() => void handleConfirmCancel()} disabled={saving}>
                  {saving ? "Cancelando..." : "Confirmar cancelamento"}
                </Button>
              </div>
            </div>
          )
        }
      >
        {drawerAppointment && drawerStep === "actions" && (
          <div className={styles.drawerBody}>
            <div className={styles.drawerSummary}>
              <p><strong>Tipo:</strong> {formatAppointmentType(drawerAppointment.type)}</p>
              <p><strong>Status:</strong> {statusLabels[drawerAppointment.status] ?? drawerAppointment.status}</p>
            </div>
            <p className={styles.drawerHint}>
              Você pode remarcar para outro horário disponível ou cancelar informando o motivo.
            </p>
          </div>
        )}

        {drawerAppointment && drawerStep === "cancel-reason" && (
          <div className={styles.drawerBody}>
            <p className={styles.drawerHint}>
              Conte brevemente por que deseja cancelar. A clínica receberá esta informação junto ao agendamento.
            </p>
            <label className={styles.reasonLabel} htmlFor="cancel-reason">
              Motivo do cancelamento
            </label>
            <textarea
              id="cancel-reason"
              className={styles.reasonInput}
              rows={5}
              value={cancelReason}
              onChange={(e) => {
                setCancelReason(e.target.value)
                setCancelError(null)
              }}
              placeholder="Ex.: não poderei comparecer, conflito de horário, já resolvi em outro lugar..."
              disabled={saving}
            />
            {cancelError && (
              <p className={styles.drawerError} role="alert">{cancelError}</p>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}
