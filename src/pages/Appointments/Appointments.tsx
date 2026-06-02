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
import { RefreshButton } from "../../components/ui/RefreshButton/RefreshButton"
import { Select } from "../../components/ui/Select/Select"
import { WaitlistPanel, WaitlistSuggestionModal, type AddWaitlistInput } from "../../components/ui/Waitlist/Waitlist"
import { ConsultationModal } from "../../components/ui/ConsultationModal/ConsultationModal"
import { useWaitlist } from "../../hooks/useWaitlist"
import { filterVisible, suggestForGap } from "../../services/waitlist"
import { checkConflict, formatAppointmentType } from "../../utils"
import { getAppointmentDoctors, getAvailableSlots, getDoctorAvailability } from "../../services/appointments"
import type { DoctorAvailability } from "../../services/appointments"
import type {
  Appointment, FinancialRecord, MedicalRecord, Patient, Prescription, User, WaitlistEntry,
} from "../../types"
import styles from "./Appointments.module.css"

type AppointmentsTab = "calendar" | "waitlist"

type CalendarView = "timeGridDay" | "timeGridWeek" | "dayGridMonth" | "listWeek"

interface ModalForm {
  date: string
  time: string
  patientId: string
  patientName: string
  doctorId: string
  doctorName: string
  type: string
  duration: string
  channel: string
  observations: string
}

interface AppointmentsProps {
  appointments: Appointment[]
  patients: Patient[]
  currentUser: User
  onAddAppointment: (a: Omit<Appointment, "id">) => Promise<void>
  onUpdateAppointment: (a: Appointment) => Promise<void>
  onDeleteAppointment?: (id: string) => Promise<void>
  onRefresh?: () => void | Promise<unknown>
  /** Médico: criar prontuário + receita + cobrança ao concluir um atendimento. */
  onAddMedicalRecord?:   (record: Omit<MedicalRecord, "id">) => Promise<MedicalRecord>
  onAddPrescription?:    (p: Omit<Prescription, "id">) => Promise<Prescription | void>
  onAddFinancialRecord?: (r: Omit<FinancialRecord, "id">) => Promise<FinancialRecord>
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
  requested: "Solicitado",
}

const TYPE_MAP: Record<string, Appointment["type"]> = {
  Consulta: "consultation",
  Retorno: "return",
  Exame: "exam",
  Procedimento: "procedure",
}

const TYPE_LABEL: Record<Appointment["type"], string> = {
  consultation: "Consulta",
  return: "Retorno",
  exam: "Exame",
  procedure: "Procedimento",
}

function toDateStr(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

function localTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

function localDateTime(date: Date): string {
  return `${toDateStr(date)}T${localTime(date)}:00`
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number)
  return hours * 60 + minutes
}

function minutesToTime(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`
}

function addMinutes(date: Date, minutes: number): Date {
  const next = new Date(date)
  next.setMinutes(next.getMinutes() + minutes)
  return next
}

function emptyModal(date = toDateStr(new Date())): ModalForm {
  return {
    date,
    time: "",
    patientId: "",
    patientName: "",
    doctorId: "",
    doctorName: "",
    type: "Consulta",
    duration: "30",
    channel: "",
    observations: "",
  }
}

function eventStart(appointment: Appointment): string {
  return `${appointment.date}T${appointment.time}:00`
}

function isPastDateTime(date: string, time: string): boolean {
  if (!date || !time) return false
  const selected = new Date(`${date}T${time}:00`)
  return Number.isNaN(selected.getTime()) ? false : selected <= new Date()
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return name
  return `${parts[0]} ${parts[1][0]}.`
}

function monthWeekRowIndex(date: Date, firstDay: number): number {
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1)
  const startOffset = (firstOfMonth.getDay() - firstDay + 7) % 7
  return Math.floor((date.getDate() + startOffset - 1) / 7)
}

function formatWeekOfMonth(date: Date, firstDay: number): string {
  return `${monthWeekRowIndex(date, firstDay) + 1}ª sem.`
}

function isFirstDayOfWeekRow(date: Date, firstDay: number): boolean {
  return ((date.getDay() - firstDay + 7) % 7) === 0
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

function formatVisibleMonth(date: Date): string {
  const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function Appointments({
  appointments,
  patients,
  currentUser,
  onAddAppointment,
  onUpdateAppointment,
  onDeleteAppointment,
  onRefresh,
  onAddMedicalRecord,
  onAddPrescription,
  onAddFinancialRecord,
}: AppointmentsProps) {
  const calendarRef = useRef<FullCalendar | null>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const calendarShellRef = useRef<HTMLDivElement>(null)
  const slotRequestRef = useRef(0)
  const isDoctor    = currentUser.role === "doctor"
  const isManager   = currentUser.role === "manager" || currentUser.role === "admin"
  const isSecretary = currentUser.role === "secretary"
  const canManage = true
  /** Gestor/admin tem visão completa mas (regra do produto) não edita a fila. */
  const canManageWaitlist = isDoctor || isSecretary
  const today = toDateStr(new Date())
  const [activeTab, setActiveTab] = useState<AppointmentsTab>("calendar")
  const [suggested, setSuggested] = useState<WaitlistEntry | null>(null)
  const [consultationFor, setConsultationFor] = useState<Appointment | null>(null)

  const waitlist = useWaitlist()
  const canStartConsultation = isDoctor && !!onAddMedicalRecord && !!onAddFinancialRecord

  const [doctors, setDoctors] = useState<{ id: string; name: string }[]>([])
  const [isLoadingDoctors, setIsLoadingDoctors] = useState(true)
  const [doctorsError, setDoctorsError] = useState<string | null>(null)
  const [calendarView, setCalendarView] = useState<CalendarView>("dayGridMonth")
  const [calendarTitle, setCalendarTitle] = useState("")
  const [visibleMonth, setVisibleMonth] = useState(() => new Date())
  const [filterDoctorId, setFilterDoctorId] = useState("")
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null)
  const [modal, setModal] = useState<ModalForm>(() => emptyModal())
  const [modalError, setModalError] = useState<string | null>(null)
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [isLoadingSlots, setIsLoadingSlots] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [availabilityRows, setAvailabilityRows] = useState<DoctorAvailability[]>([])
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const [pageHeight, setPageHeight] = useState<number>()
  const [calendarHeight, setCalendarHeight] = useState(480)

  useEffect(() => {
    let active = true
    setIsLoadingDoctors(true)
    setDoctorsError(null)

    getAppointmentDoctors()
      .then((items) => {
        if (active) setDoctors(items)
      })
      .catch((err) => {
        if (active) setDoctorsError(err instanceof Error ? err.message : "Erro ao carregar médicos")
      })
      .finally(() => {
        if (active) setIsLoadingDoctors(false)
      })

    return () => { active = false }
  }, [])

  const currentDoctor = useMemo(() => {
    return doctors.find((doctor) =>
      doctor.id === currentUser.id ||
      doctor.name.toLowerCase().trim() === currentUser.name.toLowerCase().trim())
  }, [currentUser.id, currentUser.name, doctors])

  const visibleDoctorIds = useMemo(() => {
    if (isDoctor) return [currentDoctor?.id ?? currentUser.id].filter(Boolean)
    if (filterDoctorId) return [filterDoctorId]
    return doctors.map((doctor) => doctor.id)
  }, [currentDoctor?.id, currentUser.id, doctors, filterDoctorId, isDoctor])

  const scopedCalendarDoctorId = useMemo(() => {
    if (isDoctor) return currentDoctor?.id ?? currentUser.id
    return filterDoctorId || undefined
  }, [currentDoctor?.id, currentUser.id, filterDoctorId, isDoctor])

  useEffect(() => {
    let active = true

    if (visibleDoctorIds.length === 0) {
      setAvailabilityRows([])
      setAvailabilityError(null)
      setIsLoadingAvailability(false)
      return () => { active = false }
    }

    setIsLoadingAvailability(true)
    setAvailabilityError(null)
    Promise.all(visibleDoctorIds.map((doctorId) => getDoctorAvailability(doctorId)))
      .then((rows) => {
        if (!active) return
        setAvailabilityRows(rows.flat())
      })
      .catch((err) => {
        if (!active) return
        setAvailabilityRows([])
        setAvailabilityError(err instanceof Error ? err.message : "Erro ao carregar disponibilidade")
      })
      .finally(() => {
        if (active) setIsLoadingAvailability(false)
      })

    return () => { active = false }
  }, [visibleDoctorIds])

  const visibleWaitlist = useMemo(() => {
    if (isDoctor) {
      const currentDoctorId = currentDoctor?.id ?? currentUser.id
      return filterVisible(waitlist.sorted, { doctorId: currentDoctorId })
    }
    return waitlist.sorted
  }, [waitlist.sorted, isDoctor, currentDoctor?.id, currentUser.id])

  const visibleAppointments = useMemo(() => {
    if (isDoctor) {
      const currentDoctorId = currentDoctor?.id ?? currentUser.id
      return appointments.filter((appointment) =>
        appointment.doctorId === currentDoctorId ||
        appointment.doctorId === currentUser.id ||
        appointment.doctorName.toLowerCase().trim() === currentUser.name.toLowerCase().trim())
    }

    if (!filterDoctorId) return appointments
    const doctor = doctors.find((item) => item.id === filterDoctorId)
    return appointments.filter((appointment) =>
      appointment.doctorId === filterDoctorId ||
      Boolean(doctor && appointment.doctorName === doctor.name))
  }, [appointments, currentDoctor?.id, currentUser.id, currentUser.name, doctors, filterDoctorId, isDoctor])

  const events = useMemo<EventInput[]>(() =>
    visibleAppointments.map((appointment) => {
      const start = new Date(eventStart(appointment))
      const end = addMinutes(start, appointment.duration)
      const statusClass = `event${appointment.status[0]?.toUpperCase() ?? ""}${appointment.status.slice(1)}`

      return {
        id: appointment.id,
        title: appointment.patientName,
        start: localDateTime(start),
        end: localDateTime(end),
        classNames: [styles[statusClass] ?? styles.eventDefault],
        extendedProps: { appointment },
      }
    }),
    [visibleAppointments],
  )

  const calendarSlotMin = useMemo(() => {
    if (availabilityRows.length === 0) return "07:00:00"
    const min = Math.min(...availabilityRows.map((row) => timeToMinutes(row.startTime)))
    return `${minutesToTime(Math.max(0, min - 30))}:00`
  }, [availabilityRows])

  const calendarSlotMax = useMemo(() => {
    if (availabilityRows.length === 0) return "18:00:00"
    const max = Math.max(...availabilityRows.map((row) => timeToMinutes(row.endTime)))
    return `${minutesToTime(Math.min(24 * 60, max + 30))}:00`
  }, [availabilityRows])

  const summary = useMemo(() => {
    const todayAppointments = visibleAppointments.filter((appointment) => appointment.date === today)
    return [
      { label: "Hoje", value: todayAppointments.length, cls: styles.summaryBlue },
      { label: "Confirmados", value: todayAppointments.filter((appointment) => appointment.status === "confirmed").length, cls: styles.summaryGreen },
      { label: "Pendentes", value: todayAppointments.filter((appointment) => appointment.status === "pending" || appointment.status === "scheduled" || appointment.status === "requested").length, cls: styles.summaryAmber },
      { label: "Cancelados", value: todayAppointments.filter((appointment) => appointment.status === "cancelled").length, cls: styles.summaryRed },
    ]
  }, [today, visibleAppointments])

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

  const loadSlots = useCallback(async (doctorId: string, date: string, keepTime?: string) => {
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
      setAvailableSlots(keepTime && !slots.includes(keepTime) ? [keepTime, ...slots].sort() : slots)
    } catch (err) {
      if (slotRequestRef.current !== requestId) return
      setAvailableSlots([])
      setSlotsError(err instanceof Error ? err.message : "Erro ao consultar horários disponíveis")
    } finally {
      if (slotRequestRef.current === requestId) setIsLoadingSlots(false)
    }
  }, [])

  function hasAvailabilityAt(date: Date, doctorId?: string): boolean {
    if (date <= new Date()) return false
    const dateStr = toDateStr(date)
    const minutes = timeToMinutes(localTime(date))

    return availabilityRows.some((row) => {
      if (doctorId && row.doctorId !== doctorId) return false
      if (row.weekday !== date.getDay()) return false
      return dateStr >= today &&
        minutes >= timeToMinutes(row.startTime) &&
        minutes < timeToMinutes(row.endTime)
    })
  }

  function hasAvailabilityOnDate(date: Date, doctorId?: string): boolean {
    const dateStr = toDateStr(date)
    if (dateStr < today) return false
    return availabilityRows.some((row) => {
      if (doctorId && row.doctorId !== doctorId) return false
      return row.weekday === date.getDay()
    })
  }

  function availableDoctorFor(date: Date) {
    const minutes = timeToMinutes(localTime(date))
    const row = availabilityRows.find((item) =>
      item.weekday === date.getDay() &&
      minutes >= timeToMinutes(item.startTime) &&
      minutes < timeToMinutes(item.endTime))

    return row ? doctors.find((doctor) => doctor.id === row.doctorId) : undefined
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

  function handlePatientSelect(patientId: string) {
    const patient = patients.find((item) => item.id === patientId)
    setModal((current) => ({ ...current, patientId, patientName: patient?.name ?? "" }))
    setModalError(null)
  }

  function handleDoctorSelect(doctorId: string) {
    const doctor = doctors.find((item) => item.id === doctorId)
    setModal((current) => ({ ...current, doctorId, doctorName: doctor?.name ?? "", time: "" }))
    setAvailableSlots([])
    setSlotsError(null)
    setModalError(null)
    if (doctorId && modal.date) void loadSlots(doctorId, modal.date, editingAppointment?.time)
  }

  function setModalField(field: keyof ModalForm, value: string) {
    if (field === "date" && value < today) {
      setModalError("Selecione uma data futura para o agendamento.")
      setAvailableSlots([])
      setSlotsError(null)
      return
    }

    setModal((current) => ({ ...current, [field]: value }))
    setModalError(null)

    if (field === "date") {
      setAvailableSlots([])
      setSlotsError(null)
      if (modal.doctorId) void loadSlots(modal.doctorId, value, editingAppointment?.time)
    }
  }

  function defaultDoctor() {
    if (isDoctor) return currentDoctor
    if (filterDoctorId) return doctors.find((doctor) => doctor.id === filterDoctorId)
    return undefined
  }

  function openModal(startDate?: Date, appointment?: Appointment) {
    if (!canManage) return

    const fallbackDoctor = startDate ? (defaultDoctor() ?? availableDoctorFor(startDate)) : defaultDoctor()
    const date = appointment?.date ?? (startDate ? toDateStr(startDate) : today)
    const time = appointment?.time ?? (startDate ? localTime(startDate) : "")
    const doctorId = appointment?.doctorId ?? fallbackDoctor?.id ?? ""
    const doctorName = appointment?.doctorName ?? fallbackDoctor?.name ?? (isDoctor ? currentUser.name : "")

    setEditingAppointment(appointment ?? null)
    setModal(appointment ? {
      date,
      time,
      patientId: appointment.patientId,
      patientName: appointment.patientName,
      doctorId,
      doctorName,
      type: TYPE_LABEL[appointment.type] ?? "Consulta",
      duration: String(appointment.duration),
      channel: appointment.preferredChannel ?? "",
      observations: appointment.observations ?? "",
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

    if (doctorId && date) void loadSlots(doctorId, date, appointment?.time)
  }

  function closeModal() {
    setShowModal(false)
    setEditingAppointment(null)
    setModal(emptyModal())
    setModalError(null)
    setAvailableSlots([])
    setIsLoadingSlots(false)
    setSlotsError(null)
  }

  async function handleSaveAppointment() {
    if (!modal.patientId || !modal.patientName) { setModalError("Selecione o paciente"); return }
    if (!modal.doctorId || !modal.doctorName) { setModalError("Selecione o profissional"); return }
    if (!modal.time) { setModalError("Selecione o horário"); return }
    if (!modal.type) { setModalError("Selecione o tipo"); return }
    if (modal.date < today || isPastDateTime(modal.date, modal.time)) {
      setModalError("Agendamentos só podem ser criados para horários futuros.")
      return
    }
    if (conflict) { setModalError("Resolva o conflito de horário antes de salvar"); return }
    if (doctorsError) { setModalError("Não foi possível carregar médicos da API"); return }
    if (slotsError) { setModalError("Não foi possível confirmar a disponibilidade pela API"); return }
    if (modal.doctorId && modal.date && !isLoadingSlots && availableSlots.length === 0) {
      setModalError("A API não retornou slots disponíveis para este médico/data")
      return
    }
    if (modal.doctorId && modal.date && availableSlots.length > 0 && !availableSlots.includes(modal.time)) {
      setModalError("Selecione um horário disponível retornado pela API")
      return
    }

    const payload = {
      patientId: modal.patientId,
      patientName: modal.patientName,
      doctorId: modal.doctorId,
      doctorName: modal.doctorName,
      date: modal.date,
      time: modal.time,
      duration: Number(modal.duration) || 30,
      type: TYPE_MAP[modal.type] ?? "consultation",
      status: editingAppointment?.status ?? "confirmed",
      preferredChannel: modal.channel as Appointment["preferredChannel"] | undefined,
      observations: modal.observations || undefined,
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
    if (isPastDateTime(nextDate, nextTime)) {
      info.revert()
      window.alert("Agendamentos só podem ser remarcados para horários futuros.")
      return
    }

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

    // Desistência → procura sugestão na fila de espera compatível com a vaga.
    if (status === "cancelled" || status === "absent") {
      const candidate = suggestForGap(visibleWaitlist, {
        doctorId: appointment.doctorId,
      })
      if (candidate) setSuggested(candidate)
    }
  }

  async function handleDeleteSelected(appointment: Appointment) {
    if (!onDeleteAppointment) return
    if (!window.confirm(`Excluir o agendamento de ${appointment.patientName}?`)) return
    await onDeleteAppointment(appointment.id)
    setSelected(null)
  }

  function handleDateClick(arg: DateClickArg) {
    if (!canManage) return
    const clicked = arg.allDay ? new Date(`${arg.dateStr}T08:00:00`) : arg.date
    const isPastSelection = arg.allDay ? arg.dateStr < today : clicked <= new Date()
    if (isPastSelection) {
      window.alert("Agendamentos só podem ser criados para horários futuros.")
      return
    }

    const isAvailableSelection = arg.allDay
      ? hasAvailabilityOnDate(clicked, scopedCalendarDoctorId)
      : hasAvailabilityAt(clicked, scopedCalendarDoctorId)

    if (!isAvailableSelection) {
      window.alert(isLoadingAvailability ? "Aguarde o carregamento da disponibilidade." : "Este horário não possui disponibilidade cadastrada.")
      return
    }

    openModal(clicked)
  }

  function handleEventClick(arg: EventClickArg) {
    const appointment = arg.event.extendedProps.appointment as Appointment | undefined
    if (appointment) setSelected(appointment)
  }

  async function handleAddToWaitlist(input: AddWaitlistInput) {
    await waitlist.add(input)
  }

  function handleScheduleFromWaitlist(entry: WaitlistEntry) {
    setActiveTab("calendar")
    setSuggested(null)
    setEditingAppointment(null)
    const fallbackDoctor = entry.doctorId
      ? doctors.find((d) => d.id === entry.doctorId)
      : defaultDoctor()

    setModal({
      ...emptyModal(today),
      patientId:   entry.patientId,
      patientName: entry.patientName,
      doctorId:    fallbackDoctor?.id ?? "",
      doctorName:  fallbackDoctor?.name ?? "",
    })
    setShowModal(true)
    setModalError(null)
    setAvailableSlots([])
    setSlotsError(null)
  }

  const slotOptions = modal.doctorId && modal.date ? availableSlots : []

  const measureLayout = useCallback(() => {
    const pageEl = pageRef.current
    if (pageEl) {
      const parent = pageEl.parentElement
      const parentStyle = parent ? getComputedStyle(parent) : null
      const paddingBottom = parentStyle ? parseFloat(parentStyle.paddingBottom) : 16
      const pageTop = pageEl.getBoundingClientRect().top
      setPageHeight(Math.max(420, Math.floor(window.innerHeight - pageTop - paddingBottom)))
    }

    if (activeTab === "calendar" && calendarShellRef.current) {
      setCalendarHeight(Math.max(300, calendarShellRef.current.clientHeight))
    }
  }, [activeTab])

  useEffect(() => {
    measureLayout()
    const raf = window.requestAnimationFrame(measureLayout)
    window.addEventListener("resize", measureLayout)

    const observers: ResizeObserver[] = []
    const observe = (node: Element | null | undefined) => {
      if (!node) return
      const observer = new ResizeObserver(measureLayout)
      observer.observe(node)
      observers.push(observer)
    }

    observe(pageRef.current?.parentElement ?? null)
    observe(calendarShellRef.current)

    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener("resize", measureLayout)
      observers.forEach((observer) => observer.disconnect())
    }
  }, [measureLayout, calendarView, activeTab, selected, doctorsError, availabilityError, calendarTitle])

  useEffect(() => {
    if (activeTab !== "calendar") return
    calendarRef.current?.getApi().updateSize()
  }, [calendarHeight, calendarView, activeTab])

  return (
    <div
      ref={pageRef}
      className={styles.page}
      style={pageHeight ? { height: pageHeight, maxHeight: pageHeight } : undefined}
    >
      <div className={styles.pageHeader}>
        <Topbar
          title="Agendamento"
          subtitle={
            calendarView === "dayGridMonth"
              ? formatVisibleMonth(visibleMonth)
              : calendarTitle
                ? `Agenda da clínica · ${calendarTitle}`
                : "Agenda da clínica"
          }
          action={
            <div className={styles.headerActions}>
              {onRefresh && <RefreshButton onRefresh={onRefresh} />}
              {canManage && activeTab === "calendar" && (
                <Button onClick={() => openModal()} icon={<span aria-hidden="true">+</span>}>
                  Novo agendamento
                </Button>
              )}
            </div>
          }
        />
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Visualização">
        {([
          { id: "calendar", label: "Agenda" },
          { id: "waitlist", label: `Fila de espera${visibleWaitlist.length ? ` (${visibleWaitlist.length})` : ""}` },
        ] as { id: AppointmentsTab; label: string }[]).map((t) => {
          const active = activeTab === t.id
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`${styles.tab} ${active ? styles.tabActive : ""}`}
            >
              {t.label}
            </button>
          )
        })}
        {isManager && (
          <span className={styles.managerHint}>
            Visualização gerencial (somente leitura na fila)
          </span>
        )}
      </div>

      {activeTab === "waitlist" ? (
        <div className={styles.waitlistShell}>
          <WaitlistPanel
            entries={visibleWaitlist}
            patients={patients}
            doctors={doctors}
            currentUser={currentUser}
            canManage={canManageWaitlist}
            loading={waitlist.loading}
            error={waitlist.error}
            onAdd={handleAddToWaitlist}
            onUpdate={async (entry) => { await waitlist.update(entry) }}
            onRemove={async (id) => { await waitlist.remove(id) }}
            onScheduleFromEntry={handleScheduleFromWaitlist}
          />
        </div>
      ) : (
      <div className={styles.layout}>
        <Card className={styles.calendarCard}>
          <div className={styles.toolbar}>
            <div className={styles.toolbarRow}>
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

              {!isDoctor && (
                <Select
                  options={doctors.map((doctor) => ({ value: doctor.id, label: doctor.name }))}
                  placeholder={isLoadingDoctors ? "Carregando médicos..." : "Todos os profissionais"}
                  value={filterDoctorId}
                  onChange={(event) => { setFilterDoctorId(event.target.value); setSelected(null) }}
                  className={styles.toolbarSelect}
                />
              )}

              {isDoctor && <div className={styles.lockedProfile}>{currentUser.name}</div>}

              {calendarView === "dayGridMonth" && (
                <div className={styles.monthContext} aria-live="polite">
                  <span className={styles.monthContextLabel}>{formatVisibleMonth(visibleMonth)}</span>
                  <span className={styles.monthContextHint}>
                    {isSameMonth(visibleMonth, new Date()) ? "Mês atual" : "Outro mês"}
                  </span>
                </div>
              )}

              <div className={styles.toolbarSpacer} />

              <div className={styles.navControls}>
                <button type="button" className={styles.navButton} onClick={() => navigateCalendar("prev")} aria-label="Anterior">‹</button>
                <button type="button" className={styles.todayBtn} onClick={() => navigateCalendar("today")}>Hoje</button>
                <button type="button" className={styles.navButton} onClick={() => navigateCalendar("next")} aria-label="Próximo">›</button>
              </div>
            </div>

            <div className={styles.mobileSummary}>
              {summary.map((item) => (
                <div key={item.label} className={styles.mobileSummaryItem}>
                  <strong className={item.cls}>{item.value}</strong>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div
            className={`${styles.calendarShell} ${calendarView === "dayGridMonth" ? styles.calendarMonthView : ""}`}
            ref={calendarShellRef}
          >
            {doctorsError && <p className={styles.availabilityNotice}>Não foi possível carregar médicos: {doctorsError}</p>}
            {availabilityError && <p className={styles.availabilityNotice}>Não foi possível carregar disponibilidade: {availabilityError}</p>}
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
              locale={ptBrLocale}
              initialView={calendarView}
              headerToolbar={false}
              events={events}
              height={calendarHeight}
              slotMinTime={calendarSlotMin}
              slotMaxTime={calendarSlotMax}
              slotDuration="00:30:00"
              snapDuration="00:30:00"
              allDaySlot={false}
              nowIndicator
              selectable={canManage}
              editable={canManage}
              eventStartEditable={canManage}
              eventDurationEditable={false}
              dayMaxEvents={3}
              eventMinHeight={28}
              eventShortHeight={28}
              eventMaxStack={3}
              slotEventOverlap={false}
              expandRows
              dayCellClassNames={(arg) => {
                const classes: string[] = []
                if (toDateStr(arg.date) < today) classes.push(styles.pastDay)
                else {
                  classes.push(
                    hasAvailabilityOnDate(arg.date, scopedCalendarDoctorId)
                      ? styles.availableDay
                      : styles.unavailableDay,
                  )
                }

                if (arg.view.type === "dayGridMonth") {
                  const now = new Date()
                  if (isSameMonth(arg.date, now)) {
                    const firstDay = (arg.view.calendar.getOption("firstDay") as number | undefined) ?? 0
                    const todayRow = monthWeekRowIndex(now, firstDay)
                    if (monthWeekRowIndex(arg.date, firstDay) === todayRow) {
                      classes.push(styles.monthCurrentWeek)
                    }
                    if (toDateStr(arg.date) === today) {
                      classes.push(styles.monthTodayCell)
                    }
                  }
                }

                return classes
              }}
              dayCellContent={(arg) => {
                if (arg.view.type !== "dayGridMonth") return undefined

                const now = new Date()
                if (!isSameMonth(arg.date, now)) {
                  return (
                    <div className={styles.monthDayTop}>
                      <span className={styles.monthDayNumber}>{arg.dayNumberText}</span>
                    </div>
                  )
                }

                const firstDay = (arg.view.calendar.getOption("firstDay") as number | undefined) ?? 0
                const isToday = toDateStr(arg.date) === today
                const inCurrentWeek = monthWeekRowIndex(arg.date, firstDay) === monthWeekRowIndex(now, firstDay)
                const showWeekLabel = inCurrentWeek && isFirstDayOfWeekRow(arg.date, firstDay)

                return (
                  <div className={styles.monthDayTop}>
                    {showWeekLabel && (
                      <span className={styles.monthWeekLabel}>{formatWeekOfMonth(now, firstDay)}</span>
                    )}
                    <span className={`${styles.monthDayNumber} ${isToday ? styles.monthDayNumberToday : ""}`}>
                      {arg.dayNumberText}
                    </span>
                    {isToday && (
                      <span className={styles.monthDayTodayLabel}>Hoje</span>
                    )}
                  </div>
                )
              }}
              dayHeaderClassNames={(arg) => {
                const classes: string[] = []
                if (toDateStr(arg.date) < today) classes.push(styles.pastHeader)
                if (arg.view.type === "dayGridMonth" && toDateStr(arg.date) === today) {
                  classes.push(styles.monthTodayHeader)
                }
                return classes
              }}
              slotLaneClassNames={(arg) => {
                if (!arg.date) return []
                if (arg.date <= new Date()) return [styles.pastSlot]
                return hasAvailabilityAt(arg.date, scopedCalendarDoctorId) ? [styles.availableSlot] : [styles.unavailableSlot]
              }}
              datesSet={(arg) => {
                setCalendarTitle(arg.view.title)
                setVisibleMonth(new Date(arg.view.currentStart))
              }}
              dateClick={handleDateClick}
              eventClick={handleEventClick}
              eventDrop={handleEventDrop}
              eventContent={(arg) => {
                const appointment = arg.event.extendedProps.appointment as Appointment | undefined
                return (
                  <div className={styles.eventInner}>
                    <span className={styles.eventTime}>{arg.timeText}</span>
                    {appointment && <span className={styles.eventPatient}>{shortName(appointment.patientName)}</span>}
                  </div>
                )
              }}
              eventTimeFormat={{ hour: "2-digit", minute: "2-digit", meridiem: false }}
              slotLabelFormat={{ hour: "2-digit", minute: "2-digit", meridiem: false }}
            />
          </div>
        </Card>

        <aside className={`${styles.sidePanel} ${selected ? styles.sidePanelSelected : ""}`}>
          {selected ? (
            <Card className={styles.detailCard}>
              <div className={styles.detailHeader}>
                <p className={styles.detailTitle}>Detalhes</p>
                <button type="button" className={styles.closeBtn} onClick={() => setSelected(null)} aria-label="Fechar">×</button>
              </div>

              <Avatar name={selected.patientName} size="lg" />
              <p className={styles.detailPatientName}>{selected.patientName}</p>
              <div className={styles.detailBadge}><Badge>{STATUS_LABELS[selected.status] ?? selected.status}</Badge></div>

              <div className={styles.detailFields}>
                <div className={styles.detailField}><span>Data</span><strong>{selected.date}</strong></div>
                <div className={styles.detailField}><span>Horário</span><strong>{selected.time}</strong></div>
                <div className={styles.detailField}><span>Tipo</span><strong>{formatAppointmentType(selected.type)}</strong></div>
                <div className={styles.detailField}><span>Médico</span><strong>{selected.doctorName}</strong></div>
                <div className={styles.detailField}><span>Duração</span><strong>{selected.duration} min</strong></div>
              </div>

              {canManage && (
                <div className={styles.detailActions}>
                  {canStartConsultation && selected.status !== "completed" && selected.status !== "cancelled" && (
                    <Button size="sm" variant="primary" onClick={() => setConsultationFor(selected)}>
                      Atender paciente
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openModal(undefined, selected)}>Editar</Button>
                  {selected.status !== "completed" && <Button size="sm" variant="ghost" onClick={() => handleStatus(selected, "completed")}>Concluir</Button>}
                  {selected.status !== "cancelled" && <Button size="sm" variant="danger" onClick={() => handleStatus(selected, "cancelled")}>Cancelar</Button>}
                  {onDeleteAppointment && <Button size="sm" variant="danger" onClick={() => handleDeleteSelected(selected)}>Excluir</Button>}
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
            <div className={styles.legendItem}><span className={styles.legendScheduled} />Agendado</div>
            <div className={styles.legendItem}><span className={styles.legendPending} />Pendente / solicitado</div>
            <div className={styles.legendItem}><span className={styles.legendCompleted} />Concluído</div>
            <div className={styles.legendItem}><span className={styles.legendCancelled} />Cancelado</div>
            <div className={styles.legendItem}><span className={styles.legendAbsent} />Ausente</div>
          </Card>
        </aside>
      </div>
      )}

      <ConsultationModal
        isOpen={!!consultationFor && canStartConsultation}
        onClose={() => setConsultationFor(null)}
        appointment={consultationFor}
        patient={consultationFor ? patients.find((p) => p.id === consultationFor.patientId) ?? null : null}
        currentUser={currentUser}
        onComplete={async ({ appointmentId, medicalRecord, prescription, financialRecord }) => {
          if (!onAddMedicalRecord || !onAddFinancialRecord) return
          await onAddMedicalRecord(medicalRecord)
          if (prescription && onAddPrescription) {
            await onAddPrescription(prescription)
          }
          await onAddFinancialRecord(financialRecord)
          const target = appointments.find((a) => a.id === appointmentId)
          if (target && target.status !== "completed") {
            await onUpdateAppointment({ ...target, status: "completed" })
          }
          await onRefresh?.()
        }}
      />

      <WaitlistSuggestionModal
        isOpen={!!suggested}
        entry={suggested}
        onCancel={() => setSuggested(null)}
        onAccept={(entry) => {
          handleScheduleFromWaitlist(entry)
        }}
        onDismissEntry={(entry) => {
          // Pula esse paciente: marca como removido e tenta o próximo.
          void waitlist.update({ ...entry, status: "removed" }).then(() => {
            const next = suggestForGap(
              visibleWaitlist.filter((e) => e.id !== entry.id),
              { doctorId: entry.doctorId },
            )
            setSuggested(next)
          })
        }}
      />

      {showModal && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <Card className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalTitle}>{editingAppointment ? "Editar agendamento" : "Novo agendamento"}</h2>
                <p className={styles.modalSubtitle}>Os horários são validados pela API de disponibilidade.</p>
              </div>
              <button type="button" className={styles.closeBtn} onClick={closeModal} aria-label="Fechar">×</button>
            </div>

            <div className={styles.modalGrid}>
              <label className={styles.field}>
                <span>Data</span>
                <input type="date" min={today} value={modal.date} onChange={(event) => setModalField("date", event.target.value)} className={styles.input} />
              </label>

              <label className={styles.field}>
                <span>Horário</span>
                <select className={styles.input} value={modal.time} onChange={(event) => setModalField("time", event.target.value)}>
                  <option value="">{isLoadingSlots ? "Carregando horários..." : slotOptions.length === 0 ? "Sem horários disponíveis" : "Selecione"}</option>
                  {slotOptions.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
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

              <Select label="Tipo" options={Object.keys(TYPE_MAP)} value={modal.type} onChange={(event) => setModalField("type", event.target.value)} />
              <Select label="Duração" options={["20 min", "30 min", "40 min", "60 min"]} value={modal.duration ? `${modal.duration} min` : ""} onChange={(event) => setModalField("duration", event.target.value.replace(" min", ""))} />
            </div>

            {conflict && <div className={styles.warning}><strong>Conflito</strong><span>{conflict}</span></div>}
            {!conflict && slotsError && <div className={styles.warning}><strong>Disponibilidade</strong><span>{slotsError}</span></div>}
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
