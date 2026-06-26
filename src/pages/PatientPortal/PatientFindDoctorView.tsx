import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getPatientDaySlots, type DaySlot } from "../../services/appointments"
import { PatientDaySlotsGrid } from "../../components/ui/PatientDaySlots/PatientDaySlotsGrid"
import { humanizeError } from "../../services/problemDetails"
import { findWaitingEntry, getWaitlist } from "../../services/waitlist"
import { enrollPatientInWaitlistFromPortal } from "../../services/waitlistAutomation"
import {
  getBookableDoctors,
  getDoctorAvailability,
  isDateOnDoctorSchedule,
  slotDurationForDateTime,
  summarizeDoctorWeekdays,
  type AvailabilityDoctor,
  type DoctorAvailability,
} from "../../services/availability"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Button } from "../../components/ui/Button/Button"
import { Modal } from "../../components/ui/Modal/Modal"
import {
  formatCrm,
  formatSpecialtyLabel,
  normalizeSpecialtyKey,
  sortByName,
  specialtyMatches,
  uniqueSpecialtyLabels,
} from "../../utils"
import type { Appointment, Patient } from "../../types"
import styles from "./PatientFindDoctorView.module.css"

interface PatientFindDoctorViewProps {
  patient: Patient
  onBack?: () => void
  embedded?: boolean
  searchQuery?: string
  specialtyFilter?: string
  onSpecialtiesLoaded?: (specialties: string[]) => void
  onBook: (appointment: Omit<Appointment, "id">) => Promise<void>
  onSuccess?: () => void
  onWaitlistEnrolled?: () => void
}

const APPOINTMENT_TYPE = "presencial"
const DEFAULT_SPECIALTY = "Clínica Geral"
const ALL_SPECIALTIES = ""
const DAY_STRIP_LENGTH = 14

const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

function doctorSpecialty(doctor: AvailabilityDoctor): string {
  return formatSpecialtyLabel(doctor.specialty || DEFAULT_SPECIALTY)
}

function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatDayLabel(dateStr: string): { weekday: string; day: string; month: string } {
  const d = new Date(`${dateStr}T12:00:00`)
  return {
    weekday: WEEKDAY_SHORT[d.getDay()],
    day: String(d.getDate()),
    month: MONTH_SHORT[d.getMonth()],
  }
}

function isPastDateTime(date: string, time: string): boolean {
  const dt = new Date(`${date}T${time}:00`)
  return Number.isNaN(dt.getTime()) || dt <= new Date()
}

function matchesSearch(doctor: AvailabilityDoctor, query: string): boolean {
  const q = normalizeSpecialtyKey(query)
  if (!q) return true
  const name = normalizeSpecialtyKey(doctor.name)
  const specialty = normalizeSpecialtyKey(doctorSpecialty(doctor))
  const crm = normalizeSpecialtyKey(doctor.crm ?? "")
  return name.includes(q) || specialty.includes(q) || crm.includes(q)
}

function firstBookableDay(today: string, schedule: DoctorAvailability[]): string | null {
  for (let i = 0; i < DAY_STRIP_LENGTH; i++) {
    const date = addDays(today, i)
    if (isDateOnDoctorSchedule(date, schedule)) return date
  }
  return null
}

const CalendarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
)

export function PatientFindDoctorView({
  patient,
  onBack,
  embedded = false,
  searchQuery: searchQueryProp,
  specialtyFilter: specialtyFilterProp,
  onSpecialtiesLoaded,
  onBook,
  onSuccess,
  onWaitlistEnrolled,
}: PatientFindDoctorViewProps) {
  const today = todayStr()
  const slotRequestRef = useRef(0)

  const [doctors, setDoctors] = useState<AvailabilityDoctor[]>([])
  const [doctorsLoading, setDoctorsLoading] = useState(true)
  const [doctorsError, setDoctorsError] = useState<string | null>(null)

  const [internalSearchQuery, setInternalSearchQuery] = useState("")
  const [internalSpecialtyFilter, setInternalSpecialtyFilter] = useState(ALL_SPECIALTIES)
  const searchQuery = searchQueryProp ?? internalSearchQuery
  const specialtyFilter = specialtyFilterProp ?? internalSpecialtyFilter

  const [bookingDoctor, setBookingDoctor] = useState<AvailabilityDoctor | null>(null)
  const [doctorSchedule, setDoctorSchedule] = useState<DoctorAvailability[]>([])
  const [scheduleLoading, setScheduleLoading] = useState(false)

  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [observations, setObservations] = useState("")
  const [daySlots, setDaySlots] = useState<DaySlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [alreadyOnWaitlist, setAlreadyOnWaitlist] = useState(false)
  const [waitlistSaving, setWaitlistSaving] = useState(false)
  const [waitlistMessage, setWaitlistMessage] = useState<string | null>(null)
  const [showWaitlistOffer, setShowWaitlistOffer] = useState(false)

  useEffect(() => {
    let alive = true
    setDoctorsLoading(true)
    setDoctorsError(null)

    getBookableDoctors()
      .then((list) => {
        if (!alive) return
        setDoctors(list)
        if (list.length === 0) {
          setDoctorsError("Nenhum médico com agenda cadastrada está disponível para agendamento.")
        }
      })
      .catch((err) => {
        if (!alive) return
        setDoctors([])
        setDoctorsError(humanizeError(err, "Erro ao carregar médicos."))
      })
      .finally(() => {
        if (alive) setDoctorsLoading(false)
      })

    return () => { alive = false }
  }, [])

  const specialties = useMemo(
    () => uniqueSpecialtyLabels(doctors.map((d) => d.specialty)),
    [doctors],
  )

  useEffect(() => {
    onSpecialtiesLoaded?.(specialties)
  }, [specialties, onSpecialtiesLoaded])

  const filteredDoctors = useMemo(() => {
    let list = doctors
    if (specialtyFilter) {
      list = list.filter((doctor) => specialtyMatches(doctorSpecialty(doctor), specialtyFilter))
    }
    if (searchQuery.trim()) {
      list = list.filter((doctor) => matchesSearch(doctor, searchQuery))
    }
    return sortByName(list, (doctor) => doctor.name)
  }, [doctors, specialtyFilter, searchQuery])

  const dayStrip = useMemo(() => {
    return Array.from({ length: DAY_STRIP_LENGTH }, (_, i) => addDays(today, i))
  }, [today])

  const scheduleSummary = useMemo(
    () => summarizeDoctorWeekdays(doctorSchedule),
    [doctorSchedule],
  )

  const openBooking = useCallback((doctor: AvailabilityDoctor) => {
    setBookingDoctor(doctor)
    setDoctorSchedule([])
    setDate("")
    setTime("")
    setObservations("")
    setDaySlots([])
    setSlotsError(null)
    setFormError(null)
    setSaving(false)
    setAlreadyOnWaitlist(false)
    setWaitlistSaving(false)
    setWaitlistMessage(null)
    setShowWaitlistOffer(false)
  }, [])

  const closeBooking = useCallback(() => {
    if (saving || waitlistSaving) return
    setBookingDoctor(null)
    setDoctorSchedule([])
    setDate("")
    setTime("")
    setDaySlots([])
    setFormError(null)
    setAlreadyOnWaitlist(false)
    setWaitlistSaving(false)
    setWaitlistMessage(null)
    setShowWaitlistOffer(false)
  }, [saving, waitlistSaving])

  useEffect(() => {
    if (!bookingDoctor) return

    let alive = true
    setScheduleLoading(true)

    getDoctorAvailability(bookingDoctor.id)
      .then((rows) => {
        if (!alive) return
        const active = rows.filter((row) => row.active)
        setDoctorSchedule(active)
        const first = firstBookableDay(today, active)
        setDate(first ?? "")
        setTime("")
        setDaySlots([])
        if (!first && active.length === 0) {
          setSlotsError("Este médico ainda não possui horários cadastrados.")
        }
      })
      .catch(() => {
        if (alive) setDoctorSchedule([])
      })
      .finally(() => {
        if (alive) setScheduleLoading(false)
      })

    return () => { alive = false }
  }, [bookingDoctor, today])

  useEffect(() => {
    if (!bookingDoctor) return

    let alive = true
    void getWaitlist().then((entries) => {
      if (!alive) return
      const existing = findWaitingEntry(entries, patient.id, {
        doctorId: bookingDoctor.id,
        specialty: doctorSpecialty(bookingDoctor),
      })
      setAlreadyOnWaitlist(Boolean(existing))
    })

    return () => { alive = false }
  }, [bookingDoctor, patient.id])

  const availableOnly = useMemo(
    () => daySlots.filter((slot) => slot.status === "available"),
    [daySlots],
  )

  const canOfferWaitlist = Boolean(
    bookingDoctor &&
    !scheduleLoading &&
    (doctorSchedule.length === 0 || (date && !slotsLoading && availableOnly.length === 0)),
  )

  async function handleJoinWaitlist() {
    if (!bookingDoctor) return

    setWaitlistSaving(true)
    setFormError(null)
    setWaitlistMessage(null)

    try {
      const { created } = await enrollPatientInWaitlistFromPortal({
        patient,
        doctorId: bookingDoctor.id,
        doctorName: bookingDoctor.name,
        specialty: doctorSpecialty(bookingDoctor),
        clinicalNotes: observations.trim() || undefined,
      })

      setAlreadyOnWaitlist(true)
      setWaitlistMessage(
        created
          ? "Você entrou na fila de espera. Avisaremos por SMS quando surgir uma vaga compatível."
          : "Você já está na fila de espera para este profissional.",
      )
      if (created) onWaitlistEnrolled?.()
    } catch (err) {
      setFormError(humanizeError(err, "Não foi possível entrar na fila de espera."))
    } finally {
      setWaitlistSaving(false)
    }
  }

  const loadSlots = useCallback(async (doctorId: string, nextDate: string, schedule: DoctorAvailability[]) => {
    if (!doctorId || !nextDate) {
      setDaySlots([])
      setSlotsLoading(false)
      setSlotsError(null)
      return
    }

    if (!isDateOnDoctorSchedule(nextDate, schedule)) {
      setDaySlots([])
      setSlotsLoading(false)
      setSlotsError("Sem atendimento neste dia.")
      return
    }

    const requestId = slotRequestRef.current + 1
    slotRequestRef.current = requestId
    setSlotsLoading(true)
    setSlotsError(null)

    try {
      const slots = await getPatientDaySlots(doctorId, nextDate, APPOINTMENT_TYPE)
      if (slotRequestRef.current !== requestId) return
      const futureSlots = slots.filter((slot) => slot.status !== "past")
      setDaySlots(futureSlots)
      const freeCount = futureSlots.filter((slot) => slot.status === "available").length
      if (freeCount === 0) {
        setSlotsError("Nenhum horário livre neste dia. Escolha outra data.")
      }
    } catch (err) {
      if (slotRequestRef.current !== requestId) return
      setDaySlots([])
      setSlotsError(humanizeError(err, "Erro ao consultar horários."))
    } finally {
      if (slotRequestRef.current === requestId) setSlotsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!bookingDoctor || !date || doctorSchedule.length === 0) return
    void loadSlots(bookingDoctor.id, date, doctorSchedule)
  }, [bookingDoctor, date, doctorSchedule, loadSlots])

  function selectDate(nextDate: string) {
    if (!isDateOnDoctorSchedule(nextDate, doctorSchedule)) return
    setDate(nextDate)
    setTime("")
    setFormError(null)
  }

  async function handleSubmit() {
    setFormError(null)

    if (!bookingDoctor) return
    if (!date) {
      setFormError("Selecione um dia disponível.")
      return
    }
    if (!time) {
      setFormError("Selecione um horário.")
      return
    }
    if (date < today || isPastDateTime(date, time)) {
      setFormError("Escolha um horário futuro.")
      return
    }
    if (!slotsLoading && availableOnly.length === 0) {
      setFormError("Não há horários disponíveis para esta data.")
      return
    }
    if (!availableOnly.some((slot) => slot.time === time)) {
      setFormError("Selecione um horário disponível da lista.")
      return
    }

    const duration = slotDurationForDateTime(date, time, doctorSchedule)

    setSaving(true)
    try {
      await onBook({
        patientId: patient.id,
        patientName: patient.socialName || patient.name,
        doctorId: bookingDoctor.id,
        doctorName: bookingDoctor.name,
        date,
        time,
        duration,
        type: "consultation",
        status: "scheduled",
        observations: observations.trim() || undefined,
        preferredChannel: "WhatsApp",
      })
      closeBooking()
      onSuccess?.()
    } catch (err) {
      setFormError(humanizeError(err, "Não foi possível concluir o agendamento."))
      setShowWaitlistOffer(true)
    } finally {
      setSaving(false)
    }
  }

  const selectedDayLabel = date ? formatDayLabel(date) : null

  return (
    <div className={`${styles.page} ${embedded ? styles.pageEmbedded : ""}`}>
      {!embedded && onBack && (
        <header className={styles.standaloneHeader}>
          <button type="button" className={styles.backBtn} onClick={onBack}>
            Voltar
          </button>
          <div>
            <h1>Agendar consulta</h1>
            <p>Encontre um especialista e escolha o melhor horário</p>
          </div>
          <div className={styles.standaloneSearch}>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Especialidade, nome do médico ou CRM..."
              value={searchQuery}
              onChange={(e) => setInternalSearchQuery(e.target.value)}
              aria-label="Buscar médico"
            />
            <select
              className={styles.specialtySelect}
              value={specialtyFilter}
              onChange={(e) => setInternalSpecialtyFilter(e.target.value)}
            >
              <option value={ALL_SPECIALTIES}>Todas as especialidades</option>
              {specialties.map((label) => (
                <option key={label} value={label}>{label}</option>
              ))}
            </select>
          </div>
        </header>
      )}

      {embedded && (
        <div className={styles.embeddedSearch}>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Especialidade, nome do médico ou CRM..."
            value={searchQuery}
            onChange={(e) => {
              if (searchQueryProp === undefined) setInternalSearchQuery(e.target.value)
            }}
            aria-label="Buscar médico"
          />
          <select
            className={styles.specialtySelect}
            value={specialtyFilter}
            onChange={(e) => {
              if (specialtyFilterProp === undefined) setInternalSpecialtyFilter(e.target.value)
            }}
          >
            <option value={ALL_SPECIALTIES}>Todas as especialidades</option>
            {specialties.map((label) => (
              <option key={label} value={label}>{label}</option>
            ))}
          </select>
        </div>
      )}

      {doctorsError && (
        <div className={styles.alert} role="alert">{doctorsError}</div>
      )}

      {!doctorsLoading && !doctorsError && filteredDoctors.length > 0 && (
        <div className={styles.howToBook} aria-label="Como agendar uma consulta">
          <p className={styles.howToBookTitle}>Como agendar</p>
          <ol className={styles.howToBookSteps}>
            <li>Escolha o médico na lista abaixo</li>
            <li>Clique em <strong>Agendar consulta</strong></li>
            <li>Selecione data, horário e confirme</li>
          </ol>
        </div>
      )}

      <div className={styles.resultsHead}>
        <p>
          {doctorsLoading
            ? "Carregando..."
            : `${filteredDoctors.length} especialista${filteredDoctors.length !== 1 ? "s" : ""} com agenda online`}
        </p>
        {!doctorsLoading && filteredDoctors.length > 0 && (
          <span className={styles.resultsHint}>
            Exibimos médicos com horários cadastrados para agendamento pelo portal
          </span>
        )}
        {!doctorsLoading && filteredDoctors.length > 0 && (
          <span className={styles.resultsHint}>Use o botão verde em cada card para agendar</span>
        )}
      </div>

      <div className={styles.results}>
        {doctorsLoading ? (
          <div className={styles.resultsEmpty}>Buscando profissionais com agenda aberta...</div>
        ) : filteredDoctors.length === 0 ? (
          <div className={styles.resultsEmpty}>
            <strong>Nenhum médico encontrado</strong>
            <span>Tente outra especialidade ou termo de busca.</span>
          </div>
        ) : (
          filteredDoctors.map((doctor) => (
            <article key={doctor.id} className={styles.doctorCard}>
              <div className={styles.doctorCardMain}>
                <Avatar name={doctor.name} size="lg" />
                <div className={styles.doctorCardInfo}>
                  <h2>{doctor.name}</h2>
                  <p className={styles.doctorSpecialty}>{doctorSpecialty(doctor)}</p>
                  {doctor.crm && (
                    <p className={styles.doctorCrm}>CRM {formatCrm(doctor.crm)}</p>
                  )}
                  <p className={styles.doctorBadge}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                    Consulta presencial
                  </p>
                </div>
              </div>
              <div className={styles.doctorCardAction}>
                <span className={styles.actionLabel}>Agendamento</span>
                <Button
                  onClick={() => openBooking(doctor)}
                  icon={<CalendarIcon />}
                  className={styles.scheduleBtn}
                  title={`Agendar consulta com ${doctor.name}`}
                >
                  Agendar consulta
                </Button>
              </div>
            </article>
          ))
        )}
      </div>

      <Modal
        isOpen={Boolean(bookingDoctor)}
        onClose={closeBooking}
        title="Agendar consulta"
        subtitle={bookingDoctor ? `${bookingDoctor.name} · ${doctorSpecialty(bookingDoctor)}` : undefined}
        size="lg"
        topLayer
        footer={
          <div className={styles.modalFooter}>
            {date && time && bookingDoctor ? (
              <div className={styles.bookingSummary}>
                <span className={styles.bookingSummaryLabel}>Resumo do agendamento</span>
                <strong>
                  {selectedDayLabel?.weekday}, {selectedDayLabel?.day} {selectedDayLabel?.month} às {time}
                </strong>
                <span>{bookingDoctor.name} · {doctorSpecialty(bookingDoctor)}</span>
              </div>
            ) : (
              <p className={styles.bookingSummaryHint}>
                Selecione um dia e um horário para confirmar o agendamento.
              </p>
            )}
            <Button
              fullWidth
              className={styles.confirmBtn}
              onClick={() => void handleSubmit()}
              disabled={scheduleLoading || waitlistSaving || !date || !time}
              loading={saving}
            >
              {saving ? "Confirmando..." : "Confirmar agendamento"}
            </Button>
            {canOfferWaitlist && !alreadyOnWaitlist && (
              <Button
                variant="outline"
                fullWidth
                onClick={() => void handleJoinWaitlist()}
                disabled={waitlistSaving || saving}
              >
                {waitlistSaving ? "Entrando na fila..." : "Entrar na fila de espera"}
              </Button>
            )}
          </div>
        }
      >
        {bookingDoctor && (
          <div className={styles.bookingBody}>
            <div className={styles.bookingDoctor}>
              <Avatar name={bookingDoctor.name} size="md" />
              <div>
                <strong>{bookingDoctor.name}</strong>
                <span>{doctorSpecialty(bookingDoctor)}</span>
                {!scheduleLoading && doctorSchedule.length > 0 && (
                  <small>Atende: {scheduleSummary}</small>
                )}
              </div>
            </div>

            {formError && (
              <div className={styles.alert} role="alert">{formError}</div>
            )}

            {waitlistMessage && (
              <div className={styles.waitlistSuccess} role="status">{waitlistMessage}</div>
            )}

            {(showWaitlistOffer || canOfferWaitlist) && !alreadyOnWaitlist && formError && (
              <div className={styles.waitlistOffer}>
                <p className={styles.waitlistInfo}>
                  Não conseguiu agendar? Você pode entrar na fila de espera e será avisado quando
                  houver desistência.
                </p>
                <Button
                  variant="outline"
                  onClick={() => void handleJoinWaitlist()}
                  disabled={waitlistSaving || saving}
                >
                  {waitlistSaving ? "Entrando na fila..." : "Entrar na fila de espera"}
                </Button>
              </div>
            )}

            <section className={styles.calendarSection}>
              <h3>Selecione o dia</h3>
              {scheduleLoading ? (
                <p className={styles.hint}>Carregando agenda...</p>
              ) : doctorSchedule.length === 0 ? (
                <div className={styles.waitlistOffer}>
                  <p className={styles.hint}>{slotsError ?? "Sem horários cadastrados."}</p>
                  {!alreadyOnWaitlist && (
                    <p className={styles.waitlistInfo}>
                      Entre na fila de espera para ser avisado quando abrir agenda neste profissional.
                    </p>
                  )}
                </div>
              ) : (
                <div className={styles.dayStrip} role="listbox" aria-label="Dias disponíveis">
                  {dayStrip.map((day) => {
                    const label = formatDayLabel(day)
                    const available = isDateOnDoctorSchedule(day, doctorSchedule)
                    const isSelected = date === day
                    const isToday = day === today
                    return (
                      <button
                        key={day}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        disabled={!available}
                        className={`${styles.dayChip} ${isSelected ? styles.dayChipActive : ""} ${!available ? styles.dayChipDisabled : ""}`}
                        onClick={() => selectDate(day)}
                      >
                        <span className={styles.dayChipWeek}>{label.weekday}</span>
                        <span className={styles.dayChipNum}>{label.day}</span>
                        <span className={styles.dayChipMonth}>{label.month}</span>
                        {isToday && <span className={styles.dayChipToday}>Hoje</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </section>

            <section className={styles.slotsSection}>
              <h3>Horários</h3>
              <p className={styles.slotsHint}>
                Horários em verde estão livres; os marcados como ocupados já possuem consulta agendada.
              </p>
              {!date ? (
                <p className={styles.hint}>Selecione um dia para ver os horários.</p>
              ) : slotsLoading ? (
                <p className={styles.hint}>Consultando disponibilidade...</p>
              ) : daySlots.length === 0 ? (
                <div className={styles.waitlistOffer}>
                  <p className={styles.hint}>{slotsError ?? "Nenhum horário neste dia."}</p>
                  {alreadyOnWaitlist ? (
                    <p className={styles.waitlistInfo}>
                      Você já está na fila de espera para este profissional. Avisaremos quando surgir vaga.
                    </p>
                  ) : (
                    <p className={styles.waitlistInfo}>
                      Sem horários livres? Entre na fila de espera — sua prioridade será calculada
                      automaticamente conforme a legislação (Lei 10.048/2000).
                    </p>
                  )}
                </div>
              ) : (
                <PatientDaySlotsGrid
                  daySlots={daySlots}
                  selectedTime={time}
                  onSelectTime={(slot) => {
                    setTime(slot)
                    setFormError(null)
                  }}
                />
              )}
            </section>

            <section className={styles.notesSection}>
              <label htmlFor="booking-notes">Motivo da consulta (opcional)</label>
              <textarea
                id="booking-notes"
                rows={3}
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                placeholder="Descreva brevemente o motivo da visita..."
                disabled={saving}
              />
            </section>
          </div>
        )}
      </Modal>
    </div>
  )
}
