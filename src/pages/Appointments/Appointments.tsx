import { useState, useEffect, useMemo, useRef } from "react"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Badge } from "../../components/ui/Badge/Badge"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Button } from "../../components/ui/Button/Button"
import { Select } from "../../components/ui/Select/Select"
import { formatAppointmentType, checkConflict, timeToMinutes } from "../../utils"
import { useStaff } from "../../hooks/useStaff"
import { getAvailableSlots } from "../../services/appointments"
import type { Appointment, Patient, User } from "../../types"
import styles from "./Appointments.module.css"

type CalendarView = "day" | "week" | "month"

const HOURS       = ["08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","14:00","14:30","15:00","15:30","16:00","16:30","17:00"]
const DAYS_SHORT  = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const MONTHS_PT   = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"]
const MONTHS_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]

const TYPE_MAP: Record<string, Appointment["type"]> = {
  "Consulta":    "consultation",
  "Retorno":     "return",
  "Exame":       "exam",
  "Procedimento":"procedure",
}
const TYPE_LABEL: Record<Appointment["type"], string> = {
  consultation: "Consulta",
  return: "Retorno",
  exam: "Exame",
  procedure: "Procedimento",
}

const PlusIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5"
    viewBox="0 0 24 24" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
)
const ChevronIcon = ({ dir }: { dir: "left" | "right" }) => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"
    viewBox="0 0 24 24" strokeLinecap="round">
    <path d={dir === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
  </svg>
)
const CalendarIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"
    viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
)

const BLOCK_STYLE: Record<string, string> = {
  confirmed: styles.appointmentBlockConfirmed,
  pending:   styles.appointmentBlockPending,
  absent:    styles.appointmentBlockAbsent,
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
function getWeekDays(d: Date): Date[] {
  const start = new Date(d)
  start.setDate(d.getDate() - d.getDay())
  return Array.from({ length: 7 }, (_, i) => { const day = new Date(start); day.setDate(start.getDate() + i); return day })
}

// ─── Mini Calendar Picker ─────────────────────────────────────────
interface MiniCalendarPickerProps {
  currentDate: Date; appointments: Appointment[]
  onSelectDate: (d: Date) => void; popupClass?: string
}
function MiniCalendarPicker({ currentDate, appointments, onSelectDate, popupClass }: MiniCalendarPickerProps) {
  const [pickerMonth, setPickerMonth] = useState(() => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1))
  const [showYearGrid, setShowYearGrid] = useState(false)
  const y = pickerMonth.getFullYear(); const m = pickerMonth.getMonth()
  const firstDay    = new Date(y, m, 1).getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const todayStr = toDateStr(new Date()); const selectedStr = toDateStr(currentDate)
  function dayStr(day: number) { return `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` }
  const decadeStart = Math.floor(y / 10) * 10
  const yearRange   = Array.from({ length: 12 }, (_, i) => decadeStart - 1 + i)
  const pickerCls   = [styles.picker, popupClass].filter(Boolean).join(" ")

  if (showYearGrid) {
    return (
      <div className={pickerCls}>
        <div className={styles.pickerHeader}>
          <button className={styles.pickerArrow} onClick={() => setPickerMonth(new Date(y - 10, m, 1))}><ChevronIcon dir="left" /></button>
          <div className={styles.yearRangeLabel}>
            <span className={styles.yearRangeText}>{decadeStart}–{decadeStart + 9}</span>
            <button className={styles.yearRangeBack} onClick={() => setShowYearGrid(false)}>
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              Fechar
            </button>
          </div>
          <button className={styles.pickerArrow} onClick={() => setPickerMonth(new Date(y + 10, m, 1))}><ChevronIcon dir="right" /></button>
        </div>
        <div className={styles.yearGrid}>
          {yearRange.map((yr) => (
            <button key={yr} className={[styles.yearCell, yr === y ? styles.yearCellActive : "", (yr < decadeStart || yr > decadeStart + 9) ? styles.yearCellOutside : ""].filter(Boolean).join(" ")}
              onClick={() => { setPickerMonth(new Date(yr, m, 1)); setShowYearGrid(false) }}>{yr}</button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={pickerCls}>
      <div className={styles.pickerHeader}>
        <button className={styles.pickerArrow} onClick={() => setPickerMonth(new Date(y, m - 1, 1))}><ChevronIcon dir="left" /></button>
        <button className={styles.pickerMonthYear} onClick={() => setShowYearGrid(true)}>
          {MONTHS_SHORT[m]}<span className={styles.pickerYearBadge}>{y}</span>
          <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        <button className={styles.pickerArrow} onClick={() => setPickerMonth(new Date(y, m + 1, 1))}><ChevronIcon dir="right" /></button>
      </div>
      <div className={styles.pickerGrid}>
        {DAYS_SHORT.map((d) => <div key={d} className={styles.pickerDayLabel}>{d}</div>)}
        {cells.map((day, i) => {
          if (day === null) return <div key={`b${i}`} />
          const ds = dayStr(day); const isSelected = ds === selectedStr; const isToday = ds === todayStr
          const hasApt = appointments.some((a) => a.date === ds)
          return (
            <button key={day} className={[styles.pickerDayCell, isSelected ? styles.pickerDayCellSelected : "", isToday && !isSelected ? styles.pickerDayCellToday : ""].filter(Boolean).join(" ")}
              onClick={() => onSelectDate(new Date(y, m, day))}>
              <span>{day}</span>{hasApt && <span className={styles.pickerDot} />}
            </button>
          )
        })}
      </div>
      <div className={styles.pickerFooter}>
        <button className={styles.pickerTodayBtn} onClick={() => onSelectDate(new Date())}>Ir para hoje</button>
      </div>
    </div>
  )
}

// ─── Modal form ───────────────────────────────────────────────────
interface ModalForm {
  date: string; time: string; patientName: string
  doctorName: string; doctorId: string; type: string
  duration: string; channel: string; observations: string
}
function emptyModal(dateStr: string): ModalForm {
  return { date: dateStr, time: "", patientName: "", doctorName: "", doctorId: "", type: "", duration: "30", channel: "", observations: "" }
}

// ─── Main component ───────────────────────────────────────────────
interface AppointmentsProps {
  appointments:    Appointment[]
  patients:        Patient[]
  currentUser:     User
  onAddAppointment: (a: Omit<Appointment, "id">) => Promise<void>
  onUpdateAppointment: (a: Appointment) => Promise<void>
}

export function Appointments({ appointments, patients, currentUser, onAddAppointment, onUpdateAppointment }: AppointmentsProps) {
  const isDoctor = currentUser.role === "doctor"

  // ── Médicos via hook (API) ────────────────────────────────────
  const { staff } = useStaff()
  const doctors   = staff.filter((s) => s.role === "doctor")
  const doctorNames = doctors.map((d) => d.name)

  const [view, setView]               = useState<CalendarView>("day")
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date())
  const [selected, setSelected]       = useState<Appointment | null>(null)
  const [showModal, setShowModal]     = useState(false)
  const [showPicker, setShowPicker]         = useState(false)
  const [showModalPicker, setShowModalPicker] = useState(false)
  const [filterDoctor, setFilterDoctor] = useState("")
  const [modal, setModal]             = useState<ModalForm>(() => emptyModal(toDateStr(new Date())))
  const [modalError, setModalError]   = useState<string | null>(null)
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [isLoadingSlots, setIsLoadingSlots] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null)

  const pickerRef      = useRef<HTMLDivElement>(null)
  const modalPickerRef = useRef<HTMLDivElement>(null)
  const slotRequestRef = useRef(0)
  const currentDateStr = toDateStr(currentDate)

  function parseDateStr(s: string): Date {
    const [y, mo, d] = s.split("-").map(Number)
    return new Date(y, mo - 1, d)
  }
  function formatDisplayDate(s: string): string {
    const [y, mo, d] = s.split("-").map(Number)
    return `${String(d).padStart(2, "0")} de ${MONTHS_PT[mo - 1]} de ${y}`
  }
  const weekDays = getWeekDays(currentDate)

  useEffect(() => {
    if (!showPicker) return
    function h(e: MouseEvent) { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [showPicker])

  useEffect(() => {
    if (!showModalPicker) return
    function h(e: MouseEvent) { if (modalPickerRef.current && !modalPickerRef.current.contains(e.target as Node)) setShowModalPicker(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [showModalPicker])

  async function loadSlots(doctorId: string, date: string, keepTime?: string) {
    if (!doctorId || !date) {
      setAvailableSlots([])
      setIsLoadingSlots(false)
      setSlotsError(null)
      return
    }

    const requestId = slotRequestRef.current + 1
    slotRequestRef.current = requestId
    setIsLoadingSlots(true)
    setSlotsError(null)
    try {
      const slots = await getAvailableSlots(doctorId, date)
      if (slotRequestRef.current !== requestId) return
      setAvailableSlots(
        keepTime && !slots.includes(keepTime)
          ? [keepTime, ...slots].sort()
          : slots,
      )
    } catch (err) {
      if (slotRequestRef.current === requestId) {
        setAvailableSlots([])
        setSlotsError(err instanceof Error ? err.message : "Erro ao consultar horários disponíveis")
      }
    } finally {
      if (slotRequestRef.current === requestId) setIsLoadingSlots(false)
    }
  }

  function formatPeriodLabel(): string {
    const y = currentDate.getFullYear(); const m = currentDate.getMonth()
    if (view === "day") return `${currentDate.getDate()} de ${MONTHS_PT[m]} de ${y}`
    if (view === "week") {
      const s = weekDays[0]; const e = weekDays[6]
      if (s.getMonth() === e.getMonth()) return `${s.getDate()}–${e.getDate()} de ${MONTHS_PT[m]} de ${y}`
      return `${s.getDate()} ${MONTHS_PT[s.getMonth()]} – ${e.getDate()} ${MONTHS_PT[e.getMonth()]} de ${y}`
    }
    return `${MONTHS_PT[m]} de ${y}`
  }

  function navigate(dir: -1 | 1) {
    setCurrentDate((prev) => {
      const d = new Date(prev)
      if (view === "day") d.setDate(d.getDate() + dir)
      else if (view === "week") d.setDate(d.getDate() + dir * 7)
      else d.setMonth(d.getMonth() + dir)
      return d
    })
    setSelected(null)
  }

  function goToToday() { setCurrentDate(new Date()); setSelected(null); setShowPicker(false) }
  function handlePickerSelect(d: Date) { setCurrentDate(d); setView("day"); setSelected(null); setShowPicker(false) }

  const sameDoctor = (a: Pick<Appointment, "doctorId" | "doctorName">) =>
    a.doctorId === currentUser.id ||
    a.doctorName === currentUser.name ||
    a.doctorName.toLowerCase().trim() === currentUser.name.toLowerCase().trim()

  const allFiltered = isDoctor
    ? appointments.filter(sameDoctor)
    : filterDoctor ? appointments.filter((a) => a.doctorName === filterDoctor) : appointments
  const dayAppointments = allFiltered.filter((a) => a.date === currentDateStr)

  const summary = [
    { label: "Confirmados", value: dayAppointments.filter((a) => a.status === "confirmed").length, cls: styles.summaryGreen },
    { label: "Pendentes",   value: dayAppointments.filter((a) => a.status === "pending").length,   cls: styles.summaryAmber },
    { label: "Ausentes",    value: dayAppointments.filter((a) => a.status === "absent").length,    cls: styles.summaryRed   },
  ]

  const conflict = useMemo(() => {
    if (!modal.doctorName || !modal.time || !modal.date) return null
    const appointmentsForConflict = editingAppointment
      ? appointments.filter((a) => a.id !== editingAppointment.id)
      : appointments
    const result = checkConflict(appointmentsForConflict, modal.doctorName, modal.date, modal.time, Number(modal.duration) || 30)
    return result ? result.message : null
  }, [modal.doctorName, modal.date, modal.time, modal.duration, appointments, editingAppointment])

  function setModalField(field: keyof ModalForm, value: string) {
    if (field === "date") setAvailableSlots([])
    if (field === "date") setSlotsError(null)
    setModal((m) => ({ ...m, [field]: value })); setModalError(null)
    if (field === "date" && modal.doctorId) void loadSlots(modal.doctorId, value, editingAppointment?.time)
  }

  function openModal(time?: string, appointment?: Appointment) {
    const currentDoctor = staff.find((s) =>
      s.id === currentUser.id ||
      s.email === currentUser.email ||
      s.name === currentUser.name
    )
    const doctorId   = isDoctor ? (currentDoctor?.id ?? currentUser.id) : ""
    const doctorName = isDoctor ? currentUser.name : ""
    setEditingAppointment(appointment ?? null)
    setModal(appointment ? {
      date: appointment.date,
      time: appointment.time,
      patientName: appointment.patientName,
      doctorName: appointment.doctorName || doctorName,
      doctorId: appointment.doctorId || doctorId,
      type: TYPE_LABEL[appointment.type] ?? "Consulta",
      duration: String(appointment.duration),
      channel: appointment.preferredChannel ?? "",
      observations: appointment.observations ?? "",
    } : { ...emptyModal(currentDateStr), doctorId, doctorName, ...(time ? { time } : {}) })
    setModalError(null); setShowModal(true)
    setAvailableSlots([])
    setIsLoadingSlots(false)
    setSlotsError(null)
    if ((appointment?.doctorId || doctorId) && (appointment?.date || currentDateStr)) {
      void loadSlots(appointment?.doctorId || doctorId, appointment?.date || currentDateStr, appointment?.time)
    }
  }

  function closeModal() {
    setShowModal(false)
    setModal(emptyModal(currentDateStr))
    setEditingAppointment(null)
    setModalError(null)
    setShowModalPicker(false)
    setAvailableSlots([])
    setIsLoadingSlots(false)
    setSlotsError(null)
  }

  async function handleSaveAppointment() {
    if (!modal.patientName) { setModalError("Selecione o paciente"); return }
    if (!modal.doctorName)  { setModalError("Selecione o profissional"); return }
    if (!modal.time)        { setModalError("Selecione o horário"); return }
    if (!modal.type)        { setModalError("Selecione o tipo"); return }
    if (conflict)           { setModalError("Resolva o conflito de horário antes de salvar"); return }
    if (slotsError) {
      setModalError("Não foi possível confirmar a disponibilidade pela API")
      return
    }
    if (modal.doctorId && modal.date && !isLoadingSlots && availableSlots.length === 0) {
      setModalError("A API não retornou slots disponíveis para este médico/data")
      return
    }
    if (modal.doctorId && modal.date && availableSlots.length > 0 && !availableSlots.includes(modal.time)) {
      setModalError("Selecione um horário disponível retornado pela API")
      return
    }

    const patient = patients.find((p) => p.name === modal.patientName)
    const doctor  = doctors.find((d) => d.name === modal.doctorName)
    const doctorId = modal.doctorId || doctor?.id || (isDoctor ? currentUser.id : "")
    if (!patient?.id) { setModalError("Paciente inválido"); return }
    if (!doctorId)    { setModalError("Médico inválido"); return }

    const payload = {
      patientId:        patient?.id ?? "",
      patientName:      modal.patientName,
      doctorId,
      doctorName:       modal.doctorName,
      date:             modal.date,
      time:             modal.time,
      duration:         Number(modal.duration) || 30,
      type:             TYPE_MAP[modal.type] ?? "consultation",
      status:           editingAppointment?.status ?? "confirmed",
      preferredChannel: modal.channel as Appointment["preferredChannel"] | undefined,
      observations:     modal.observations || undefined,
    }

    if (editingAppointment) await onUpdateAppointment({ ...payload, id: editingAppointment.id })
    else await onAddAppointment(payload)
    closeModal()
  }

  async function handleStatus(appointment: Appointment, status: Appointment["status"]) {
    await onUpdateAppointment({ ...appointment, status })
    setSelected((current) => current?.id === appointment.id ? { ...current, status } : current)
  }

  function handleDoctorSelect(name: string) {
    const doctor = doctors.find((d) => d.name === name)
    setAvailableSlots([])
    setSlotsError(null)
    setModal((m) => ({ ...m, doctorName: name, doctorId: doctor?.id ?? "" }))
    setModalError(null)
    if (doctor?.id && modal.date) void loadSlots(doctor.id, modal.date, editingAppointment?.time)
  }

  const monthYear = currentDate.getFullYear(); const monthMonth = currentDate.getMonth()
  const firstDayOfMonth = new Date(monthYear, monthMonth, 1).getDay()
  const daysInMonth     = new Date(monthYear, monthMonth + 1, 0).getDate()
  const monthCells: (number | null)[] = [...Array(firstDayOfMonth).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  function monthDayDateStr(day: number) { return `${monthYear}-${String(monthMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` }

  const VIEW_LABELS: Record<CalendarView, string> = { day: "Dia", week: "Semana", month: "Mês" }
  const modalSlotOptions = modal.doctorId && modal.date ? availableSlots : HOURS

  return (
    <div>
      <Topbar title="Agendamento" subtitle={`Agenda da clínica · ${formatPeriodLabel()}`}
        action={
          <>
            <div className={styles.viewSwitcher}>
              {(["day", "week", "month"] as CalendarView[]).map((v) => (
                <button key={v} onClick={() => setView(v)} className={`${styles.viewBtn} ${view === v ? styles.viewBtnActive : ""}`}>{VIEW_LABELS[v]}</button>
              ))}
            </div>
            <Button onClick={() => openModal()} icon={<PlusIcon />}>Novo agendamento</Button>
          </>
        }
      />

      <div className={styles.layout}>
        <Card>
          <div className={styles.toolbar}>
            {!isDoctor && (
              <Select options={doctorNames} placeholder="Todos os profissionais" value={filterDoctor}
                onChange={(e) => { setFilterDoctor(e.target.value); setSelected(null) }} className="" />
            )}
            {isDoctor && (
              <div className={styles.doctorBadge}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
                </svg>
                {currentUser.name}
              </div>
            )}
            <Select options={["Todas as unidades", "Unidade Central"]} className="" />
            <div className={styles.spacer} />
            <div className={styles.navControls}>
              <button className={styles.navArrow} onClick={() => navigate(-1)} aria-label="Anterior"><ChevronIcon dir="left" /></button>
              <div className={styles.pickerWrapper} ref={pickerRef}>
                <button className={`${styles.periodTrigger} ${showPicker ? styles.periodTriggerActive : ""}`}
                  onClick={() => setShowPicker((v) => !v)} aria-label="Selecionar data">
                  <CalendarIcon /><span>{formatPeriodLabel()}</span>
                  <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round">
                    <path d={showPicker ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
                  </svg>
                </button>
                {showPicker && <MiniCalendarPicker currentDate={currentDate} appointments={allFiltered} onSelectDate={handlePickerSelect} />}
              </div>
              <button className={styles.navArrow} onClick={() => navigate(1)} aria-label="Próximo"><ChevronIcon dir="right" /></button>
            </div>
            <button className={styles.todayBtn} onClick={goToToday}>Hoje</button>
          </div>

          {/* Day view */}
          {view === "day" && (
            <div className={styles.dayScroll}>
              {HOURS.map((h) => {
                const slotMin  = timeToMinutes(h)
                const aptStart = dayAppointments.find((a) => a.time === h)
                const aptCover = !aptStart && dayAppointments.find((a) => { const s = timeToMinutes(a.time); return slotMin > s && slotMin < s + a.duration })
                return (
                  <div key={h} className={styles.hourRow}>
                    <div className={styles.hourLabel}>{h}</div>
                    <div className={styles.hourCell}>
                      {aptStart ? (
                        <div onClick={() => setSelected(aptStart)} className={`${styles.appointmentBlock} ${BLOCK_STYLE[aptStart.status] ?? styles.appointmentBlockDefault}`}>
                          <div className={styles.appointmentBlockRow}><p className={styles.appointmentPatient}>{aptStart.patientName}</p><Badge>{aptStart.status}</Badge></div>
                          <p className={styles.appointmentMeta}>{formatAppointmentType(aptStart.type)} · {aptStart.doctorName} · {aptStart.duration}min</p>
                        </div>
                      ) : aptCover ? (
                        <div className={styles.continuationSlot}><span className={styles.continuationLabel}>Em atendimento · {aptCover.patientName}</span></div>
                      ) : (
                        <div className={styles.emptySlot} onClick={() => openModal(h)}><span className={styles.emptySlotLabel}>+ Disponível</span></div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Week view */}
          {view === "week" && (
            <div className={styles.weekScroll}>
              <div className={styles.weekGrid}>
                <div style={{ backgroundColor: "var(--muted)", borderBottom: "1px solid var(--border)" }} />
                {weekDays.map((d) => {
                  const isActive = toDateStr(d) === currentDateStr
                  return (
                    <button key={d.toISOString()} className={styles.weekDayHeader}
                      onClick={() => { setCurrentDate(new Date(d)); setView("day") }}>
                      <p className={styles.weekDayName}>{DAYS_SHORT[d.getDay()]}</p>
                      <p className={`${styles.weekDayNum} ${isActive ? styles.weekDayNumActive : ""}`}>{d.getDate()}</p>
                    </button>
                  )
                })}
                {HOURS.slice(0, 8).map((h) => (
                  <>
                    <div key={h} className={styles.weekHourLabel}>{h}</div>
                    {weekDays.map((d) => {
                      const ds  = toDateStr(d)
                      const apt = allFiltered.find((a) => a.date === ds && a.time === h)
                      return (
                        <div key={d.toISOString()} className={styles.weekCell} onClick={() => { setCurrentDate(new Date(d)); setView("day") }}>
                          {apt && <div className={styles.weekEvent}>{apt.patientName.split(" ")[0]}</div>}
                        </div>
                      )
                    })}
                  </>
                ))}
              </div>
            </div>
          )}

          {/* Month view */}
          {view === "month" && (
            <div className={styles.monthPadding}>
              <div className={styles.monthGrid}>
                {DAYS_SHORT.map((d) => <div key={d} className={styles.monthDayLabel}>{d}</div>)}
                {monthCells.map((day, idx) => {
                  if (day === null) return <div key={`blank-${idx}`} className={styles.monthDayCell} />
                  const ds = monthDayDateStr(day); const isToday = ds === toDateStr(new Date()); const isSelected = ds === currentDateStr
                  const aptCount = allFiltered.filter((a) => a.date === ds).length
                  return (
                    <div key={day} className={`${styles.monthDayCell} ${isSelected ? styles.monthDayCellActive : ""} ${isToday ? styles.monthDayCellToday : ""}`}
                      onClick={() => { setCurrentDate(new Date(monthYear, monthMonth, day)); setView("day") }} style={{ cursor: "pointer" }}>
                      <p className={`${styles.monthDayNum} ${isSelected ? styles.monthDayNumActive : ""} ${isToday && !isSelected ? styles.monthDayNumToday : ""}`}>{day}</p>
                      {aptCount > 0 && <div className={styles.monthDotRow}>{Array.from({ length: Math.min(aptCount, 3) }, (_, i) => <div key={i} className={styles.monthDot} />)}</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </Card>

        {/* Side panels */}
        <div className={styles.sidePanel}>
          {selected ? (
            <Card className={styles.detailCard}>
              <div className={styles.detailHeader}><p className={styles.detailTitle}>Detalhes</p><button className={styles.closeBtn} onClick={() => setSelected(null)}>×</button></div>
              <Avatar name={selected.patientName} size="lg" />
              <p className={styles.detailPatientName}>{selected.patientName}</p>
              <div className={styles.detailBadge}><Badge>{selected.status}</Badge></div>
              <div className={styles.detailFields}>
                {([["Data", selected.date], ["Horário", selected.time], ["Tipo", formatAppointmentType(selected.type)], ["Médico", selected.doctorName], ["Duração", `${selected.duration} min`]] as [string, string][]).map(([k, v]) => (
                  <div key={k} className={styles.detailField}><span className={styles.detailFieldKey}>{k}</span><span className={styles.detailFieldVal}>{v}</span></div>
                ))}
              </div>
              <div className={styles.detailActions}>
                <Button size="sm" variant="outline" onClick={() => openModal(undefined, selected)}>Editar</Button>
                {selected.status !== "completed" && (
                  <Button size="sm" variant="ghost" onClick={() => handleStatus(selected, "completed")}>Concluir</Button>
                )}
                {selected.status !== "cancelled" && (
                  <Button size="sm" variant="danger" onClick={() => handleStatus(selected, "cancelled")}>Cancelar</Button>
                )}
              </div>
            </Card>
          ) : (
            <Card className={styles.summaryCard}>
              <p className={styles.summaryTitle}>Resumo do dia</p>
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>{currentDate.toLocaleDateString("pt-BR")}</p>
              {summary.map((s) => (
                <div key={s.label} className={styles.summaryRow}><span className={styles.summaryLabel}>{s.label}</span><span className={`${styles.summaryValue} ${s.cls}`}>{s.value}</span></div>
              ))}
            </Card>
          )}
          <Card className={styles.queueCard}>
            <p className={styles.queueTitle}>Fila de espera</p>
            <p className={styles.queueSub}>2 pacientes aguardando</p>
            {["Regina Paixão", "Hélio Santos"].map((n) => (
              <div key={n} className={styles.queueItem}><Avatar name={n} size="sm" /><span className={styles.queueName}>{n}</span><button className={styles.callBtn}>Chamar</button></div>
            ))}
          </Card>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <Card className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{editingAppointment ? "Editar agendamento" : "Novo agendamento"}</h2>
            <div className={styles.modalGrid}>
              <div className={styles.modalDateWrapper} ref={modalPickerRef}>
                <button type="button" className={`${styles.dateInput} ${styles.datePickerBtn} ${showModalPicker ? styles.datePickerBtnActive : ""}`}
                  onClick={() => setShowModalPicker((v) => !v)}>
                  <CalendarIcon />
                  <span className={modal.date ? styles.datePickerValue : styles.datePickerPlaceholder}>
                    {modal.date ? formatDisplayDate(modal.date) : "Selecionar data"}
                  </span>
                  <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round" style={{ marginLeft: "auto", flexShrink: 0 }}>
                    <path d={showModalPicker ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
                  </svg>
                </button>
                {showModalPicker && (
                  <MiniCalendarPicker currentDate={modal.date ? parseDateStr(modal.date) : currentDate} appointments={appointments}
                    onSelectDate={(d) => { setModalField("date", toDateStr(d)); setShowModalPicker(false) }} popupClass={styles.modalPickerPopup} />
                )}
              </div>
              <select className={styles.dateInput} value={modal.time} onChange={(e) => setModalField("time", e.target.value)}>
                <option value="">
                  {isLoadingSlots ? "Carregando horários..." : modalSlotOptions.length === 0 ? "Sem slots disponíveis" : "Horário"}
                </option>
                {modalSlotOptions.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <div className={styles.colSpan2}>
                <Select options={patients.map((p) => p.name)} placeholder="Paciente"
                  value={modal.patientName} onChange={(e) => setModalField("patientName", e.target.value)} />
              </div>
              {isDoctor ? (
                <div className={styles.modalDoctorLocked}>
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  {currentUser.name}
                </div>
              ) : (
                <Select options={doctorNames} placeholder="Profissional"
                  value={modal.doctorName} onChange={(e) => handleDoctorSelect(e.target.value)} />
              )}
              <Select options={["Consulta", "Retorno", "Exame", "Procedimento"]} placeholder="Tipo"
                value={modal.type} onChange={(e) => setModalField("type", e.target.value)} />
              <Select options={["20 min", "30 min", "40 min", "60 min"]} placeholder="Duração"
                value={modal.duration ? `${modal.duration} min` : ""}
                onChange={(e) => setModalField("duration", e.target.value.replace(" min", ""))} />
              <Select options={["WhatsApp", "Email", "SMS"]} placeholder="Confirmação"
                value={modal.channel} onChange={(e) => setModalField("channel", e.target.value)} />
            </div>
            <textarea placeholder="Observações..." rows={2} value={modal.observations}
              onChange={(e) => setModalField("observations", e.target.value)} className={styles.modalTextarea} />
            {conflict && (
              <div className={styles.conflictWarning}><span style={{ fontSize: 16, lineHeight: 1.2 }}>⚠️</span><p className={styles.conflictText}>{conflict}</p></div>
            )}
            {showModal && modal.doctorId && modal.date && !isLoadingSlots && slotsError && (
              <div className={styles.conflictWarning}>
                <span style={{ fontSize: 16, lineHeight: 1.2 }}>ℹ️</span>
                <p className={styles.conflictText}>
                  Não foi possível consultar os slots na API: {slotsError}
                </p>
              </div>
            )}
            {showModal && modal.doctorId && modal.date && !isLoadingSlots && !slotsError && availableSlots.length === 0 && (
              <div className={styles.conflictWarning}>
                <span style={{ fontSize: 16, lineHeight: 1.2 }}>ℹ️</span>
                <p className={styles.conflictText}>
                  A API não retornou slots disponíveis para este médico/data. Confira a disponibilidade cadastrada antes de salvar.
                </p>
              </div>
            )}
            {modalError && !conflict && <p style={{ marginTop: 10, fontSize: 12, color: "var(--destructive)" }}>{modalError}</p>}
            <div className={styles.modalFooter}>
              <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
              <Button onClick={handleSaveAppointment} disabled={!!conflict}>
                {editingAppointment ? "Salvar alterações" : "Confirmar agendamento"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
