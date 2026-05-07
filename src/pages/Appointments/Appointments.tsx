import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction"
import listPlugin from "@fullcalendar/list"
import ptBrLocale from "@fullcalendar/core/locales/pt-br"
import type { EventClickArg, EventDropArg, EventInput } from "@fullcalendar/core"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Badge } from "../../components/ui/Badge/Badge"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Button } from "../../components/ui/Button/Button"
import { Select } from "../../components/ui/Select/Select"
import { formatAppointmentType, checkConflict } from "../../utils"
import { useStaff } from "../../hooks/useStaff"
import { getAvailableSlots } from "../../services/appointments"
import { getDoctorAvailability } from "../../services/availability"
import type { DoctorAvailability } from "../../services/availability"
import type { Appointment, Patient, User } from "../../types"
import { TYPE_LABEL, TYPE_MAP, toDateStr } from "./calendarUtils"
import styles from "./Appointments.module.css"

type CalendarView = "timeGridDay" | "timeGridWeek" | "dayGridMonth" | "listWeek"

interface ModalForm {
  date: string
  time: string
  patientId: string
  patientName: string
  doctorName: string
  doctorId: string
  type: string
  duration: string
}

interface AppointmentsProps {
  appointments: Appointment[]
  patients: Patient[]
  currentUser: User
  onAddAppointment: (a: Omit<Appointment, "id">) => Promise<void>
  onUpdateAppointment: (a: Appointment) => Promise<void>
  onDeleteAppointment?: (id: string) => Promise<void>
}

const VIEW_LABELS: Record<CalendarView, string> = {
  timeGridDay: "Dia",
  timeGridWeek: "Semana",
  dayGridMonth: "Mês",
  listWeek: "Lista",
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
  absent: "Ausente",
  blocked: "Bloqueado",
  pending: "Pendente",
}

function emptyModal(dateStr: string): ModalForm {
  return {
    date: dateStr,
    time: "",
    patientId: "",
    patientName: "",
    doctorName: "",
    doctorId: "",
    type: "Consulta",
    duration: "30",
  }
}

function localTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number)
  return hours * 60 + minutes
}

function minutesToTime(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`
}

function localDateTime(date: Date): string {
  return `${toDateStr(date)}T${localTime(date)}:00`
}

function addMinutes(date: Date, minutes: number): Date {
  const next = new Date(date)
  next.setMinutes(next.getMinutes() + minutes)
  return next
}

function eventStart(appointment: Appointment): string {
  return `${appointment.date}T${appointment.time}:00`
}

export function Appointments({
  appointments,
  patients,
  currentUser,
  onAddAppointment,
  onUpdateAppointment,
  onDeleteAppointment,
}: AppointmentsProps) {
  const calendarRef = useRef<FullCalendar | null>(null)
  const slotRequestRef = useRef(0)
  const isDoctor = currentUser.role === "doctor"
  const isPatient = currentUser.role === "patient"
  const canManage = !isPatient
  const currentDoctorId = currentUser.doctorId ?? currentUser.id
  const currentPatientId = currentUser.patientId ?? currentUser.id

  const { staff } = useStaff()
  const doctors = useMemo(() => staff.filter((s) => s.role === "doctor"), [staff])

  const [calendarView, setCalendarView] = useState<CalendarView>("timeGridWeek")
  const [calendarTitle, setCalendarTitle] = useState("")
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [filterDoctorId, setFilterDoctorId] = useState("")
  const [modal, setModal] = useState<ModalForm>(() => emptyModal(toDateStr(new Date())))
  const [modalError, setModalError] = useState<string | null>(null)
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [isLoadingSlots, setIsLoadingSlots] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null)
  const [availabilityRows, setAvailabilityRows] = useState<DoctorAvailability[]>([])
  const [isAvailabilityLoading, setIsAvailabilityLoading] = useState(false)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)

  const currentDoctor = useMemo(
    () => staff.find((s) =>
      s.id === currentDoctorId ||
      s.id === currentUser.id ||
      s.email === currentUser.email ||
      s.name === currentUser.name
    ),
    [currentDoctorId, currentUser.email, currentUser.id, currentUser.name, staff],
  )

  const visibleDoctorIds = useMemo(() => {
    if (isDoctor) return [currentDoctor?.id ?? currentDoctorId].filter(Boolean)
    if (filterDoctorId) return [filterDoctorId]
    return doctors.map((doctor) => doctor.id)
  }, [currentDoctor?.id, currentDoctorId, doctors, filterDoctorId, isDoctor])

  useEffect(() => {
    let alive = true

    if (visibleDoctorIds.length === 0) {
      setAvailabilityRows([])
      setIsAvailabilityLoading(false)
      setAvailabilityError(null)
      return () => { alive = false }
    }

    setIsAvailabilityLoading(true)
    setAvailabilityError(null)
    Promise.all(visibleDoctorIds.map((doctorId) => getDoctorAvailability(doctorId)))
      .then((rows) => {
        if (!alive) return
        setAvailabilityRows(rows.flat().filter((row) => row.active))
      })
      .catch((err) => {
        if (!alive) return
        setAvailabilityRows([])
        setAvailabilityError(err instanceof Error ? err.message : "Erro ao carregar disponibilidade")
      })
      .finally(() => {
        if (alive) setIsAvailabilityLoading(false)
      })

    return () => { alive = false }
  }, [visibleDoctorIds])

  const sameDoctor = useCallback((a: Pick<Appointment, "doctorId" | "doctorName">) =>
    a.doctorId === currentDoctorId ||
    a.doctorId === currentUser.id ||
    a.doctorName === currentUser.name ||
    a.doctorName.toLowerCase().trim() === currentUser.name.toLowerCase().trim(),
  [currentDoctorId, currentUser.id, currentUser.name])

  const visibleAppointments = useMemo(() => {
    if (isPatient) {
      return appointments.filter((a) =>
        a.patientId === currentPatientId ||
        a.patientId === currentUser.id ||
        a.patientName.toLowerCase().trim() === currentUser.name.toLowerCase().trim()
      )
    }

    if (isDoctor) return appointments.filter(sameDoctor)
    if (filterDoctorId) {
      const selectedDoctor = doctors.find((doctor) => doctor.id === filterDoctorId)
      return appointments.filter((a) =>
        a.doctorId === filterDoctorId ||
        Boolean(selectedDoctor && a.doctorName === selectedDoctor.name)
      )
    }
    return appointments
  }, [appointments, currentPatientId, currentUser.id, currentUser.name, doctors, filterDoctorId, isDoctor, isPatient, sameDoctor])

  const availableWeekdays = useMemo(() => {
    return Array.from(new Set(availabilityRows.map((row) => row.weekday))).sort((a, b) => a - b)
  }, [availabilityRows])

  const hiddenDays = useMemo(() => {
    if (availableWeekdays.length === 0) return []
    return [0, 1, 2, 3, 4, 5, 6].filter((day) => !availableWeekdays.includes(day))
  }, [availableWeekdays])

  const businessHours = useMemo(() => {
    return availabilityRows.map((row) => ({
      daysOfWeek: [row.weekday],
      startTime: row.startTime.slice(0, 5),
      endTime: row.endTime.slice(0, 5),
    }))
  }, [availabilityRows])

  const calendarSlotMin = useMemo(() => {
    if (availabilityRows.length === 0) return "06:00:00"
    const min = Math.min(...availabilityRows.map((row) => timeToMinutes(row.startTime)))
    return `${minutesToTime(Math.max(0, min - 30))}:00`
  }, [availabilityRows])

  const calendarSlotMax = useMemo(() => {
    if (availabilityRows.length === 0) return "22:00:00"
    const max = Math.max(...availabilityRows.map((row) => timeToMinutes(row.endTime)))
    return `${minutesToTime(Math.min(24 * 60, max + 30))}:00`
  }, [availabilityRows])

  const events = useMemo<EventInput[]>(() =>
    visibleAppointments.map((appointment) => {
      const start = new Date(eventStart(appointment))
      const end = addMinutes(start, appointment.duration)

      return {
        id: appointment.id,
        title: `${appointment.patientName} · ${formatAppointmentType(appointment.type)}`,
        start: localDateTime(start),
        end: localDateTime(end),
        classNames: [styles[`event${appointment.status[0].toUpperCase()}${appointment.status.slice(1)}`] ?? styles.eventDefault],
        extendedProps: { appointment },
      }
    }),
    [visibleAppointments],
  )

  const summary = useMemo(() => {
    const today = toDateStr(new Date())
    const todayAppointments = visibleAppointments.filter((a) => a.date === today)

    return [
      { label: "Hoje", value: todayAppointments.length, cls: styles.summaryBlue },
      { label: "Confirmados", value: todayAppointments.filter((a) => a.status === "confirmed").length, cls: styles.summaryGreen },
      { label: "Pendentes", value: todayAppointments.filter((a) => a.status === "pending" || a.status === "scheduled").length, cls: styles.summaryAmber },
      { label: "Cancelados", value: todayAppointments.filter((a) => a.status === "cancelled").length, cls: styles.summaryRed },
    ]
  }, [visibleAppointments])

  const conflict = useMemo(() => {
    if (!modal.doctorName || !modal.time || !modal.date) return null
    const result = checkConflict(
      appointments,
      modal.doctorName,
      modal.date,
      modal.time,
      Number(modal.duration) || 30,
      editingAppointment?.id,
    )
    return result ? result.message : null
  }, [appointments, editingAppointment?.id, modal.date, modal.doctorName, modal.duration, modal.time])

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

  function hasAvailabilityAt(date: Date, doctorId?: string): boolean {
    if (availabilityRows.length === 0) return false

    const weekday = date.getDay()
    const minutes = timeToMinutes(localTime(date))
    return availabilityRows.some((row) => {
      if (row.weekday !== weekday) return false
      if (doctorId && row.doctorId !== doctorId) return false
      return minutes >= timeToMinutes(row.startTime) && minutes < timeToMinutes(row.endTime)
    })
  }

  function defaultDoctorForSlot(date?: Date) {
    if (isDoctor) {
      return currentDoctor ?? doctors.find((doctor) => doctor.id === currentDoctorId)
    }

    if (filterDoctorId) {
      return doctors.find((doctor) => doctor.id === filterDoctorId)
    }

    if (!date) return undefined

    const weekday = date.getDay()
    const minutes = timeToMinutes(localTime(date))
    const availability = availabilityRows.find((row) =>
      row.weekday === weekday &&
      minutes >= timeToMinutes(row.startTime) &&
      minutes < timeToMinutes(row.endTime)
    )

    return availability ? doctors.find((doctor) => doctor.id === availability.doctorId) : undefined
  }

  function changeView(view: CalendarView) {
    setCalendarView(view)
    calendarRef.current?.getApi().changeView(view)
  }

  function navigateCalendar(action: "prev" | "next" | "today") {
    const api = calendarRef.current?.getApi()
    if (!api) return
    api[action]()
    setSelected(null)
  }

  function setModalField(field: keyof ModalForm, value: string) {
    setModal((current) => ({ ...current, [field]: value }))
    setModalError(null)

    if (field === "date") {
      setAvailableSlots([])
      setSlotsError(null)
      if (modal.doctorId) void loadSlots(modal.doctorId, value, editingAppointment?.time)
    }
  }

  function handlePatientSelect(id: string) {
    const patient = patients.find((p) => p.id === id)
    setModal((current) => ({ ...current, patientId: id, patientName: patient?.name ?? "" }))
    setModalError(null)
  }

  function handleDoctorSelect(id: string) {
    const doctor = doctors.find((d) => d.id === id)
    setModal((current) => ({ ...current, doctorName: doctor?.name ?? "", doctorId: id, time: "" }))
    setAvailableSlots([])
    setSlotsError(null)
    setModalError(null)
    if (doctor?.id && modal.date) void loadSlots(doctor.id, modal.date, editingAppointment?.time)
  }

  function openModal(startDate?: Date, appointment?: Appointment) {
    if (!canManage) return

    const defaultDoctor = defaultDoctorForSlot(startDate)
    const doctorId = defaultDoctor?.id ?? ""
    const doctorName = defaultDoctor?.name ?? (isDoctor ? currentUser.name : "")
    const date = startDate ? toDateStr(startDate) : toDateStr(new Date())
    const time = startDate ? localTime(startDate) : ""

    setEditingAppointment(appointment ?? null)
    setModal(appointment ? {
      date: appointment.date,
      time: appointment.time,
      patientId: appointment.patientId,
      patientName: appointment.patientName,
      doctorName: appointment.doctorName || doctorName,
      doctorId: appointment.doctorId || doctorId,
      type: TYPE_LABEL[appointment.type] ?? "Consulta",
      duration: String(appointment.duration),
    } : {
      ...emptyModal(date),
      time,
      doctorId,
      doctorName,
    })

    setModalError(null)
    setAvailableSlots([])
    setIsLoadingSlots(false)
    setSlotsError(null)
    setShowModal(true)

    const slotDoctorId = appointment?.doctorId || doctorId
    const slotDate = appointment?.date || date
    if (slotDoctorId && slotDate) {
      void loadSlots(slotDoctorId, slotDate, appointment?.time)
    }
  }

  function closeModal() {
    setShowModal(false)
    setEditingAppointment(null)
    setModal(emptyModal(toDateStr(new Date())))
    setModalError(null)
    setAvailableSlots([])
    setIsLoadingSlots(false)
    setSlotsError(null)
  }

  async function handleSaveAppointment() {
    if (!modal.patientName) { setModalError("Selecione o paciente"); return }
    if (!modal.doctorName) { setModalError("Selecione o profissional"); return }
    if (!modal.time) { setModalError("Selecione o horário"); return }
    if (!modal.type) { setModalError("Selecione o tipo"); return }
    if (conflict) { setModalError("Resolva o conflito de horário antes de salvar"); return }
    if (isLoadingSlots) { setModalError("Aguarde a consulta de disponibilidade do médico."); return }
    if (slotsError) { setModalError("Não foi possível confirmar a disponibilidade do médico."); return }
    if (modal.doctorId && modal.date && availableSlots.length === 0) {
      setModalError("Este médico não possui disponibilidade para a data selecionada.")
      return
    }
    if (modal.doctorId && modal.date && !availableSlots.includes(modal.time)) {
      setModalError("Selecione um horário disponível retornado pela API.")
      return
    }

    const patient = patients.find((p) => p.id === modal.patientId)
    const doctor = doctors.find((d) => d.id === modal.doctorId)
    const doctorId = modal.doctorId || doctor?.id || (isDoctor ? currentDoctorId : "")

    if (!patient?.id) { setModalError("Paciente inválido"); return }
    if (!doctorId) { setModalError("Médico inválido"); return }

    const payload = {
      patientId: patient.id,
      patientName: modal.patientName,
      doctorId,
      doctorName: modal.doctorName,
      date: modal.date,
      time: modal.time,
      duration: Number(modal.duration) || 30,
      type: TYPE_MAP[modal.type] ?? "consultation",
      status: editingAppointment?.status ?? "confirmed",
    }

    if (editingAppointment) await onUpdateAppointment({ ...payload, id: editingAppointment.id })
    else await onAddAppointment(payload)

    closeModal()
  }

  async function handleEventDrop(info: EventDropArg) {
    const appointment = info.event.extendedProps.appointment as Appointment | undefined
    const start = info.event.start
    if (!appointment || !start) {
      info.revert()
      return
    }

    const nextDate = toDateStr(start)
    const nextTime = localTime(start)
    const dropConflict = checkConflict(
      appointments,
      appointment.doctorName,
      nextDate,
      nextTime,
      appointment.duration,
      appointment.id,
    )

    if (dropConflict) {
      info.revert()
      window.alert(dropConflict.message)
      return
    }

    try {
      const slots = await getAvailableSlots(appointment.doctorId, nextDate)
      if (!slots.includes(nextTime)) {
        info.revert()
        window.alert("Horário indisponível pela API para este médico.")
        return
      }

      await onUpdateAppointment({ ...appointment, date: nextDate, time: nextTime })
    } catch (err) {
      info.revert()
      window.alert(err instanceof Error ? err.message : "Não foi possível remarcar o agendamento.")
    }
  }

  async function handleStatus(appointment: Appointment, status: Appointment["status"]) {
    await onUpdateAppointment({ ...appointment, status })
    setSelected((current) => current?.id === appointment.id ? { ...current, status } : current)
  }

  async function handleDeleteSelected(appointment: Appointment) {
    if (!onDeleteAppointment) return
    const confirmed = window.confirm(`Excluir o agendamento de ${appointment.patientName}?`)
    if (!confirmed) return
    await onDeleteAppointment(appointment.id)
    setSelected(null)
  }

  function handleDateClick(arg: DateClickArg) {
    if (!canManage) return
    const clickedDate = arg.allDay ? new Date(`${arg.dateStr}T08:00:00`) : arg.date
    const scopedDoctorId = isDoctor ? (currentDoctor?.id ?? currentDoctorId) : filterDoctorId || undefined

    if (isAvailabilityLoading) {
      window.alert("Aguarde o carregamento da disponibilidade médica.")
      return
    }
    if (visibleDoctorIds.length > 0 && availabilityRows.length === 0) {
      window.alert("Este médico ainda não possui disponibilidade cadastrada.")
      return
    }
    if (availabilityRows.length > 0 && !hasAvailabilityAt(clickedDate, scopedDoctorId)) {
      setSelected(null)
      window.alert("Este dia ou horário não está cadastrado na disponibilidade do médico.")
      return
    }
    openModal(clickedDate)
  }

  function handleEventClick(arg: EventClickArg) {
    const appointment = arg.event.extendedProps.appointment as Appointment | undefined
    if (appointment) setSelected(appointment)
  }

  const modalSlotOptions = modal.doctorId && modal.date ? availableSlots : []

  return (
    <div>
      <Topbar
        title="Agendamento"
        subtitle={calendarTitle ? `Agenda da clínica · ${calendarTitle}` : "Agenda da clínica"}
        action={
          canManage ? (
            <Button onClick={() => openModal()} icon={<span aria-hidden="true">+</span>}>
              Novo agendamento
            </Button>
          ) : null
        }
      />

      <div className={styles.layout}>
        <Card className={styles.calendarCard}>
          <div className={styles.toolbar}>
            <div className={styles.viewSwitcher}>
              {(Object.keys(VIEW_LABELS) as CalendarView[]).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => changeView(view)}
                  className={`${styles.viewBtn} ${calendarView === view ? styles.viewBtnActive : ""}`}
                >
                  {VIEW_LABELS[view]}
                </button>
              ))}
            </div>

            {!isDoctor && !isPatient && (
              <Select
                options={doctors.map((doctor) => ({ value: doctor.id, label: doctor.name }))}
                placeholder="Todos os profissionais"
                value={filterDoctorId}
                onChange={(event) => {
                  setFilterDoctorId(event.target.value)
                  setSelected(null)
                }}
                className={styles.toolbarSelect}
              />
            )}

            {isDoctor && (
              <div className={styles.lockedProfile}>
                <span>{currentUser.name}</span>
              </div>
            )}

            <div className={styles.spacer} />

            <div className={styles.navControls}>
              <button type="button" className={styles.navButton} onClick={() => navigateCalendar("prev")} aria-label="Anterior">
                ‹
              </button>
              <button type="button" className={styles.todayBtn} onClick={() => navigateCalendar("today")}>
                Hoje
              </button>
              <button type="button" className={styles.navButton} onClick={() => navigateCalendar("next")} aria-label="Próximo">
                ›
              </button>
            </div>
          </div>

          <div className={styles.calendarShell}>
            {availabilityError && (
              <p className={styles.availabilityNotice}>Não foi possível carregar a disponibilidade médica: {availabilityError}</p>
            )}
            {!availabilityError && !isAvailabilityLoading && visibleDoctorIds.length > 0 && availabilityRows.length === 0 && (
              <p className={styles.availabilityNotice}>Nenhuma disponibilidade cadastrada para o médico selecionado.</p>
            )}
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
              locale={ptBrLocale}
              initialView={calendarView}
              headerToolbar={false}
              events={events}
              height="auto"
              slotMinTime={calendarSlotMin}
              slotMaxTime={calendarSlotMax}
              slotDuration="00:30:00"
              snapDuration="00:30:00"
              hiddenDays={hiddenDays}
              businessHours={businessHours}
              allDaySlot={false}
              nowIndicator
              selectable={canManage}
              editable={canManage}
              eventStartEditable={canManage}
              eventDurationEditable={false}
              dayMaxEvents={3}
              expandRows
              datesSet={(arg) => setCalendarTitle(arg.view.title)}
              dateClick={handleDateClick}
              eventClick={handleEventClick}
              eventDrop={handleEventDrop}
              eventTimeFormat={{ hour: "2-digit", minute: "2-digit", meridiem: false }}
              slotLabelFormat={{ hour: "2-digit", minute: "2-digit", meridiem: false }}
            />
          </div>
        </Card>

        <aside className={styles.sidePanel}>
          {selected ? (
            <Card className={styles.detailCard}>
              <div className={styles.detailHeader}>
                <p className={styles.detailTitle}>Detalhes</p>
                <button type="button" className={styles.closeBtn} onClick={() => setSelected(null)} aria-label="Fechar">
                  ×
                </button>
              </div>

              <Avatar name={selected.patientName} size="lg" />
              <p className={styles.detailPatientName}>{selected.patientName}</p>
              <div className={styles.detailBadge}>
                <Badge>{STATUS_LABELS[selected.status] ?? selected.status}</Badge>
              </div>

              <div className={styles.detailFields}>
                <div className={styles.detailField}><span>Data</span><strong>{selected.date}</strong></div>
                <div className={styles.detailField}><span>Horário</span><strong>{selected.time}</strong></div>
                <div className={styles.detailField}><span>Tipo</span><strong>{formatAppointmentType(selected.type)}</strong></div>
                <div className={styles.detailField}><span>Médico</span><strong>{selected.doctorName}</strong></div>
                <div className={styles.detailField}><span>Duração</span><strong>{selected.duration} min</strong></div>
              </div>

              {canManage && (
                <div className={styles.detailActions}>
                  <Button size="sm" variant="outline" onClick={() => openModal(undefined, selected)}>Editar</Button>
                  {selected.status !== "completed" && (
                    <Button size="sm" variant="ghost" onClick={() => handleStatus(selected, "completed")}>Concluir</Button>
                  )}
                  {selected.status !== "cancelled" && (
                    <Button size="sm" variant="danger" onClick={() => handleStatus(selected, "cancelled")}>Cancelar</Button>
                  )}
                  {onDeleteAppointment && (
                    <Button size="sm" variant="danger" onClick={() => handleDeleteSelected(selected)}>Excluir</Button>
                  )}
                </div>
              )}
            </Card>
          ) : (
            <Card className={styles.summaryCard}>
              <p className={styles.summaryTitle}>Resumo de hoje</p>
              {summary.map((item) => (
                <div key={item.label} className={styles.summaryRow}>
                  <span>{item.label}</span>
                  <strong className={item.cls}>{item.value}</strong>
                </div>
              ))}
            </Card>
          )}

          <Card className={styles.legendCard}>
            <p className={styles.summaryTitle}>Status</p>
            <div className={styles.legendItem}><span className={styles.legendConfirmed} />Confirmado</div>
            <div className={styles.legendItem}><span className={styles.legendPending} />Pendente ou agendado</div>
            <div className={styles.legendItem}><span className={styles.legendCompleted} />Concluído</div>
            <div className={styles.legendItem}><span className={styles.legendCancelled} />Cancelado ou ausente</div>
          </Card>
        </aside>
      </div>

      {showModal && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <Card className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalTitle}>{editingAppointment ? "Editar agendamento" : "Novo agendamento"}</h2>
                <p className={styles.modalSubtitle}>Os horários são validados pela API de disponibilidade.</p>
              </div>
              <button type="button" className={styles.closeBtn} onClick={closeModal} aria-label="Fechar">
                ×
              </button>
            </div>

            <div className={styles.modalGrid}>
              <label className={styles.field}>
                <span>Data</span>
                <input
                  type="date"
                  value={modal.date}
                  onChange={(event) => setModalField("date", event.target.value)}
                  className={styles.input}
                />
              </label>

              <label className={styles.field}>
                <span>Horário</span>
                <select className={styles.input} value={modal.time} onChange={(event) => setModalField("time", event.target.value)}>
                  <option value="">
                    {isLoadingSlots ? "Carregando horários..." : modalSlotOptions.length === 0 ? "Sem horários disponíveis" : "Selecione"}
                  </option>
                  {modalSlotOptions.map((slot) => (
                    <option key={slot} value={slot}>{slot}</option>
                  ))}
                </select>
              </label>

              <div className={styles.colSpan2}>
                <Select
                  label="Paciente"
                  options={patients.map((patient) => ({ value: patient.id, label: patient.name }))}
                  placeholder="Selecione o paciente"
                  value={modal.patientId}
                  onChange={(event) => handlePatientSelect(event.target.value)}
                />
              </div>

              {isDoctor ? (
                <div className={styles.field}>
                  <span>Profissional</span>
                  <div className={styles.lockedDoctor}>{currentUser.name}</div>
                </div>
              ) : (
                <Select
                  label="Profissional"
                  options={doctors.map((doctor) => ({ value: doctor.id, label: doctor.name }))}
                  placeholder="Selecione o profissional"
                  value={modal.doctorId}
                  onChange={(event) => handleDoctorSelect(event.target.value)}
                />
              )}

              <Select
                label="Tipo"
                options={["Consulta", "Retorno", "Exame", "Procedimento"]}
                placeholder="Tipo de atendimento"
                value={modal.type}
                onChange={(event) => setModalField("type", event.target.value)}
              />

              <Select
                label="Duração"
                options={["20 min", "30 min", "40 min", "60 min"]}
                placeholder="Duração"
                value={modal.duration ? `${modal.duration} min` : ""}
                onChange={(event) => setModalField("duration", event.target.value.replace(" min", ""))}
              />
            </div>

            {conflict && (
              <div className={styles.warning}>
                <strong>Conflito</strong>
                <span>{conflict}</span>
              </div>
            )}

            {!conflict && slotsError && (
              <div className={styles.warning}>
                <strong>Disponibilidade</strong>
                <span>Não foi possível confirmar a disponibilidade do médico. Tente outra data ou recarregue a tela.</span>
              </div>
            )}

            {modalError && !conflict && <p className={styles.errorText}>{modalError}</p>}

            <div className={styles.modalFooter}>
              <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
              <Button onClick={handleSaveAppointment} disabled={!!conflict || isLoadingSlots}>
                {editingAppointment ? "Salvar alterações" : "Confirmar agendamento"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
