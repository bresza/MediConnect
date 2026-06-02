import { useMemo, useState } from "react"
import { Badge } from "../../components/ui/Badge/Badge"
import { Button } from "../../components/ui/Button/Button"
import { Modal } from "../../components/ui/Modal/Modal"
import { formatAppointmentType, formatDate, isAppointmentFuture, patientAppointmentStatusLabel } from "../../utils"
import {
  canPatientManageAppointment,
  getPatientDisplayStatus,
  showInPatientAbsentTab,
  showInPatientScheduledTab,
} from "../../utils/patientAppointments"
import type { Appointment } from "../../types"
import styles from "./PatientConsultationsView.module.css"

interface PatientConsultationsViewProps {
  appointments: Appointment[]
  loading?: boolean
  embedded?: boolean
  onBack?: () => void
  onBook?: () => void
  onReschedule?: (appointment: Appointment) => void
  onCancel?: (appointment: Appointment, reason: string) => Promise<void>
}

type TabId = "scheduled" | "absent" | "cancelled"
type ModalStep = "actions" | "cancel-reason"

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
  return patientAppointmentStatusLabel(getPatientDisplayStatus(appointment))
}

function CalendarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

function AppointmentRow({
  appointment,
  muted = false,
  onManage,
}: {
  appointment: Appointment
  muted?: boolean
  onManage?: (appointment: Appointment) => void
}) {
  const manageable = canPatientManageAppointment(appointment)

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
        <div className={styles.listAside}>
          <Badge>{displayStatus(appointment)}</Badge>
          {manageable && onManage && (
            <Button
              size="sm"
              className={styles.manageBtn}
              icon={<CalendarIcon />}
              onClick={() => onManage(appointment)}
            >
              Gerenciar
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}

export function PatientConsultationsView({
  appointments,
  loading,
  embedded = false,
  onBack,
  onBook,
  onReschedule,
  onCancel,
}: PatientConsultationsViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>("scheduled")
  const [manageAppointment, setManageAppointment] = useState<Appointment | null>(null)
  const [modalStep, setModalStep] = useState<ModalStep>("actions")
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
    () => consultationList
      .filter((a) => showInPatientScheduledTab(a))
      .sort((a, b) => appointmentTs(a) - appointmentTs(b)),
    [consultationList],
  )

  const upcomingList = useMemo(
    () => scheduledList.filter((a) => isAppointmentFuture(a)),
    [scheduledList],
  )

  const completedList = useMemo(
    () => scheduledList
      .filter((a) => !isAppointmentFuture(a))
      .sort((a, b) => appointmentTs(b) - appointmentTs(a)),
    [scheduledList],
  )

  const absentList = useMemo(
    () => consultationList
      .filter((a) => showInPatientAbsentTab(a))
      .sort((a, b) => appointmentTs(b) - appointmentTs(a)),
    [consultationList],
  )

  const cancelledList = useMemo(
    () => consultationList
      .filter((a) => isCancelled(a.status))
      .sort((a, b) => appointmentTs(b) - appointmentTs(a)),
    [consultationList],
  )

  const visibleList = activeTab === "scheduled"
    ? scheduledList
    : activeTab === "absent"
      ? absentList
      : cancelledList

  const emptyCopy = {
    scheduled: {
      title: "Nenhuma consulta agendada",
      text: "Quando você agendar, seus horários aparecerão aqui.",
    },
    absent: {
      title: "Nenhuma consulta ausente",
      text: "Consultas em que você não compareceu ficarão registradas nesta aba.",
    },
    cancelled: {
      title: "Nenhuma consulta cancelada",
      text: "Consultas que você cancelar ficarão registradas nesta aba.",
    },
  } as const

  function openManageModal(appointment: Appointment, step: ModalStep = "actions") {
    setManageAppointment(appointment)
    setModalStep(step)
    setCancelReason("")
    setCancelError(null)
    setSaving(false)
  }

  function closeManageModal() {
    if (saving) return
    setManageAppointment(null)
    setModalStep("actions")
    setCancelReason("")
    setCancelError(null)
  }

  function handleRescheduleFromModal() {
    if (!manageAppointment || !onReschedule) return
    const target = manageAppointment
    closeManageModal()
    onReschedule(target)
  }

  async function handleConfirmCancel() {
    if (!manageAppointment || !onCancel) return
    const reason = cancelReason.trim()
    if (!reason) {
      setCancelError("Descreva o motivo do cancelamento.")
      return
    }

    setSaving(true)
    setCancelError(null)
    try {
      await onCancel(manageAppointment, reason)
      closeManageModal()
      setActiveTab("cancelled")
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Não foi possível cancelar a consulta.")
    } finally {
      setSaving(false)
    }
  }

  function renderRows(items: Appointment[], options: { muted?: boolean; allowManage?: boolean } = {}) {
    const { muted = false, allowManage = false } = options
    return items.map((appt) => (
      <AppointmentRow
        key={appt.id}
        appointment={appt}
        muted={muted}
        onManage={
          allowManage && (onCancel || onReschedule)
            ? (a) => openManageModal(a)
            : undefined
        }
      />
    ))
  }

  const modalOpen = Boolean(manageAppointment)
  const manageable = manageAppointment ? canPatientManageAppointment(manageAppointment) : false

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
            <p>Acompanhe agendamentos, ausências e cancelamentos</p>
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
          aria-selected={activeTab === "absent"}
          className={`${styles.tab} ${activeTab === "absent" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("absent")}
        >
          Ausentes
          <span className={styles.tabCount}>{absentList.length}</span>
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
            <strong>{emptyCopy[activeTab].title}</strong>
            <span>{emptyCopy[activeTab].text}</span>
            {activeTab === "scheduled" && onBook && (
              <Button onClick={onBook} className={styles.emptyAction}>
                Agendar consulta
              </Button>
            )}
          </div>
        ) : activeTab === "scheduled" ? (
          <div className={styles.groupedList}>
            {upcomingList.length > 0 && (
              <section className={styles.listGroup}>
                <header className={styles.groupHeader}>
                  <h3>Próximas consultas</h3>
                  <span>{upcomingList.length}</span>
                </header>
                <ul className={styles.appointmentList}>
                  {renderRows(upcomingList, { allowManage: true })}
                </ul>
              </section>
            )}
            {completedList.length > 0 && (
              <section className={styles.listGroup}>
                <header className={styles.groupHeader}>
                  <h3>Consultas realizadas</h3>
                  <span>{completedList.length}</span>
                </header>
                <ul className={styles.appointmentList}>
                  {renderRows(completedList, { muted: true })}
                </ul>
              </section>
            )}
          </div>
        ) : (
          <ul className={styles.appointmentList}>
            {renderRows(visibleList, {
              muted: activeTab === "cancelled" || activeTab === "absent",
            })}
          </ul>
        )}
      </section>

      <Modal
        isOpen={modalOpen}
        onClose={closeManageModal}
        title={modalStep === "actions" ? "Gerenciar consulta" : "Cancelar consulta"}
        subtitle={
          manageAppointment
            ? `${formatDate(manageAppointment.date)} às ${manageAppointment.time} · Dr(a). ${manageAppointment.doctorName}`
            : undefined
        }
        size="md"
        topLayer
        footer={
          modalStep === "actions" ? (
            <div className={styles.modalFooter}>
              {onReschedule && manageable && (
                <Button
                  fullWidth
                  className={styles.modalPrimaryBtn}
                  icon={<CalendarIcon />}
                  onClick={handleRescheduleFromModal}
                  disabled={saving}
                >
                  Remarcar consulta
                </Button>
              )}
              {onCancel && manageable && (
                <Button
                  fullWidth
                  variant="danger"
                  className={styles.modalDangerBtn}
                  onClick={() => setModalStep("cancel-reason")}
                  disabled={saving}
                >
                  Cancelar consulta
                </Button>
              )}
              <Button fullWidth variant="ghost" onClick={closeManageModal} disabled={saving}>
                Fechar
              </Button>
            </div>
          ) : (
            <div className={styles.modalFooter}>
              <Button
                fullWidth
                variant="danger"
                className={styles.modalDangerBtn}
                onClick={() => void handleConfirmCancel()}
                disabled={saving}
                loading={saving}
              >
                {saving ? "Cancelando..." : "Confirmar cancelamento"}
              </Button>
              <Button
                fullWidth
                variant="ghost"
                onClick={() => { setModalStep("actions"); setCancelError(null) }}
                disabled={saving}
              >
                Voltar
              </Button>
            </div>
          )
        }
      >
        {manageAppointment && modalStep === "actions" && (
          <div className={styles.modalBody}>
            <div className={styles.modalSummary}>
              <span className={styles.modalSummaryLabel}>Detalhes da consulta</span>
              <strong>{formatAppointmentType(manageAppointment.type)}</strong>
              <p>
                {formatDate(manageAppointment.date)} às {manageAppointment.time}
                {" · "}Dr(a). {manageAppointment.doctorName}
              </p>
              <Badge>{patientAppointmentStatusLabel(getPatientDisplayStatus(manageAppointment))}</Badge>
            </div>
            <p className={styles.modalHint}>
              Escolha remarcar para outro horário disponível ou cancele informando o motivo.
            </p>
          </div>
        )}

        {manageAppointment && modalStep === "cancel-reason" && (
          <div className={styles.modalBody}>
            <div className={styles.modalSummary}>
              <span className={styles.modalSummaryLabel}>Consulta a cancelar</span>
              <strong>{formatDate(manageAppointment.date)} às {manageAppointment.time}</strong>
              <p>Dr(a). {manageAppointment.doctorName}</p>
            </div>
            <p className={styles.modalHint}>
              Conte brevemente por que deseja cancelar. A clínica receberá esta informação.
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
              <p className={styles.modalError} role="alert">{cancelError}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
