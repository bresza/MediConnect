import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"

import {

  getPatientPrescriptionsByIdentity,

  getPatientReportsByIdentity,

} from "../../services/domain"

import { getPatientAppointmentsByIdentity } from "../../services/appointments"

import { getPatientByIdentity } from "../../services/patients"

import { Topbar } from "../../components/layout/Topbar/Topbar"

import { Card } from "../../components/ui/Card/Card"

import { Badge } from "../../components/ui/Badge/Badge"

import { Avatar } from "../../components/ui/Avatar/Avatar"

import { Button } from "../../components/ui/Button/Button"

import { Modal } from "../../components/ui/Modal/Modal"

import { ConfirmDialog } from "../../components/ui/ConfirmDialog/ConfirmDialog"

import { PatientBookAppointmentModal } from "../../components/ui/PatientBookAppointment/PatientBookAppointmentModal"

import { PatientRescheduleModal } from "../../components/ui/PatientReschedule/PatientRescheduleModal"

import { PatientConsultationsView } from "./PatientConsultationsView"

import { formatAppointmentType, formatCpfBR, formatDate } from "../../utils"

import type { Appointment, Patient, Prescription, Report, User } from "../../types"

import styles from "./PatientPortal.module.css"



interface PatientPortalProps {

  currentUser: User

  patient: Patient | null

  appointments: Appointment[]

  prescriptions: Prescription[]

  onBookAppointment?: (appointment: Omit<Appointment, "id">) => Promise<void>

  onUpdateAppointment?: (appointment: Appointment) => Promise<void>

}



type PortalSection = "hub" | "consultations" | "exams" | "reports" | "prescriptions"



const APPOINTMENT_STATUS: Record<string, string> = {

  scheduled: "Agendada",

  confirmed: "Confirmada",

  completed: "Concluída",

  cancelled: "Cancelada",

  absent: "Ausente",

  pending: "Pendente",

  requested: "Solicitada",

}



const REPORT_STATUS: Record<string, string> = {

  Draft: "Rascunho",

  Finalized: "Finalizado",

  Sent: "Enviado",

}



function isFutureAppointment(appointment: Appointment): boolean {

  const date = new Date(`${appointment.date}T${appointment.time}:00`)

  return !Number.isNaN(date.getTime()) && date > new Date()

}


function onlyDigits(value?: string): string {

  return value?.replace(/\D/g, "") ?? ""

}


function patientBelongsToUser(patient: Patient | null, user: User): boolean {

  if (!patient) return false

  const userCpf = onlyDigits(user.patientCpf)
  const patientCpf = onlyDigits(patient.cpf)
  const userEmail = user.email?.toLowerCase().trim()
  const patientEmail = patient.email?.toLowerCase().trim()

  return Boolean(
    (user.patientId && patient.id === user.patientId) ||
    (patient.userId && patient.userId === user.id) ||
    (userCpf && patientCpf && userCpf === patientCpf) ||
    (userEmail && patientEmail && userEmail === patientEmail),
  )

}



function SectionHeader({

  title,

  subtitle,

  onBack,

  action,

}: {

  title: string

  subtitle?: string

  onBack: () => void

  action?: ReactNode

}) {

  return (

    <header className={styles.sectionHeader}>

      <button type="button" className={styles.backBtn} onClick={onBack}>

        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>

          <path d="M15 18l-6-6 6-6" />

        </svg>

        Voltar

      </button>

      <div>

        <h2>{title}</h2>

        {subtitle && <p>{subtitle}</p>}

      </div>

      {action}

    </header>

  )

}



function EmptyBlock({ title, text }: { title: string; text: string }) {

  return (

    <div className={styles.emptyBlock}>

      <p>{title}</p>

      <span>{text}</span>

    </div>

  )

}



const IconCalendar = () => (

  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>

    <rect x="3" y="4" width="18" height="18" rx="2" />

    <path d="M16 2v4M8 2v4M3 10h18" />

  </svg>

)

const IconFlask = () => (

  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>

    <path d="M9 3h6M10 3v5.5L5.5 18a4 4 0 003.5 6h6a4 4 0 003.5-6L14 8.5V3" />

  </svg>

)

const IconFile = () => (

  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>

    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />

    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />

  </svg>

)

const IconPill = () => (

  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>

    <path d="M8.5 8.5l7 7M9 3.5a5.5 5.5 0 017.8 7.8l-7 7A5.5 5.5 0 013.2 11.3l7-7z" />

  </svg>

)

const IconPlus = () => (

  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>

    <path d="M12 5v14M5 12h14" />

  </svg>

)



function FeatureTile({

  label,

  count,

  icon,

  accent,

  onClick,

}: {

  label: string

  count?: number

  icon: ReactNode

  accent?: boolean

  onClick: () => void

}) {

  return (

    <button

      type="button"

      className={`${styles.featureTile} ${accent ? styles.featureTileAccent : ""}`}

      onClick={onClick}

    >

      <span className={styles.featureIcon}>{icon}</span>

      <span className={styles.featureLabel}>{label}</span>

      {count !== undefined && <span className={styles.featureCount}>{count}</span>}

    </button>

  )

}



export function PatientPortal({

  currentUser,

  patient,

  appointments,

  prescriptions: propPrescriptions,

  onBookAppointment,

  onUpdateAppointment,

}: PatientPortalProps) {

  const [resolvedPatient, setResolvedPatient] = useState<Patient | null>(patient)

  const [activeSection, setActiveSection] = useState<PortalSection>("hub")

  const [reports, setReports] = useState<Report[]>([])

  const [selectedReport, setSelectedReport] = useState<Report | null>(null)

  const [bookingOpen, setBookingOpen] = useState(false)

  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null)

  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null)

  const [reportsLoading, setReportsLoading] = useState(true)

  const [apiAppointments, setApiAppointments] = useState<Appointment[]>([])

  const [appointmentsLoading, setAppointmentsLoading] = useState(true)

  const [apiPrescriptions, setApiPrescriptions] = useState<Prescription[]>([])



  const safeResolvedPatient = patientBelongsToUser(resolvedPatient, currentUser) ? resolvedPatient : null

  const portalPatient = safeResolvedPatient ?? patient

  const patientId = portalPatient?.id ?? currentUser.patientId ?? ""

  const patientIdentity = useMemo(() => ({

    patientId,

    userId: currentUser.id,

    name: portalPatient?.name ?? patient?.name ?? currentUser.name,

    email: portalPatient?.email ?? patient?.email ?? currentUser.email,

    cpf: portalPatient?.cpf ?? patient?.cpf ?? currentUser.patientCpf,

  }), [

    patientId, currentUser.id, currentUser.name, currentUser.email, currentUser.patientCpf,

    portalPatient?.name, portalPatient?.email, portalPatient?.cpf,

    patient?.name, patient?.email, patient?.cpf,

  ])



  useEffect(() => {

    let alive = true

    setResolvedPatient(patient)

    getPatientByIdentity({

      patientId: currentUser.patientId ?? patient?.id,

      userId: currentUser.id,

      name: patient?.name ?? currentUser.name,

      email: patient?.email ?? currentUser.email,

      cpf: patient?.cpf ?? currentUser.patientCpf,

    })

      .then((linked) => { if (alive) setResolvedPatient(linked ?? patient) })

      .catch(() => { if (alive) setResolvedPatient(patient) })

    return () => { alive = false }

  }, [currentUser.id, currentUser.patientId, currentUser.name, currentUser.email, currentUser.patientCpf, patient])



  const loadReports = useCallback(async () => {

    if (!patientId) { setReports([]); setReportsLoading(false); return }

    setReportsLoading(true)

    try { setReports(await getPatientReportsByIdentity(patientIdentity)) }

    catch { setReports([]) }

    finally { setReportsLoading(false) }

  }, [patientId, patientIdentity])



  useEffect(() => { void loadReports() }, [loadReports])



  const loadAppointments = useCallback(async () => {

    if (!patientId) { setApiAppointments([]); setAppointmentsLoading(false); return }

    setAppointmentsLoading(true)

    try { setApiAppointments(await getPatientAppointmentsByIdentity(patientIdentity)) }

    catch { setApiAppointments([]) }

    finally { setAppointmentsLoading(false) }

  }, [patientId, patientIdentity])



  useEffect(() => { void loadAppointments() }, [loadAppointments])



  const loadClinicalData = useCallback(async () => {

    if (!patientId) { setApiPrescriptions([]); return }

    setApiPrescriptions(await getPatientPrescriptionsByIdentity(patientIdentity).catch(() => []))

  }, [patientId, patientIdentity])



  useEffect(() => { void loadClinicalData() }, [loadClinicalData])



  const portalAppointments = apiAppointments.length > 0 ? apiAppointments : appointments

  const portalPrescriptions = apiPrescriptions.length > 0 ? apiPrescriptions : propPrescriptions



  const consultations = portalAppointments.filter((a) => a.type === "consultation" || a.type === "return")

  const exams = portalAppointments.filter((a) => a.type === "exam" || a.type === "procedure")

  const nextAppointment = portalAppointments

    .filter((a) => a.status !== "cancelled")

    .filter(isFutureAppointment)

    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0]



  async function handleCancelConfirm() {

    if (!cancelTarget || !onUpdateAppointment) return

    await onUpdateAppointment({ ...cancelTarget, status: "cancelled" })

    setCancelTarget(null)

    await loadAppointments()

  }



  if (!portalPatient) {

    return (

      <div>

        <Topbar title="Minha saúde" subtitle="Conta de paciente" />

        <Card className={styles.unlinkedCard}>

          <div className={styles.unlinkedIcon}>

            <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">

              <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />

              <circle cx="9" cy="7" r="4" />

              <path d="M19 8v6M22 11h-6" />

            </svg>

          </div>

          <div>

            <h2>Conta criada, vínculo pendente</h2>

            <p>

              Ainda não encontramos um cadastro de paciente com o CPF ou e-mail desta conta.

              Quando a clínica vincular seu cadastro, consultas, exames e laudos aparecerão aqui.

            </p>

            <div className={styles.unlinkedMeta}>

              <span>{currentUser.email}</span>

              {currentUser.patientCpf && <span>CPF {formatCpfBR(currentUser.patientCpf)}</span>}

            </div>

          </div>

        </Card>

      </div>

    )

  }



  return (

    <div>

      <Topbar

        title="Minha saúde"

        subtitle={activeSection === "hub"

          ? "Acesse consultas, exames, laudos e receitas"

          : "Consultas, exames e laudos vinculados ao seu cadastro"}

      />



      {activeSection === "hub" && (

        <>

          <div className={styles.hero}>

            <div className={styles.identity}>

              <Avatar name={portalPatient.name} size="lg" />

              <div>

                <h1>{portalPatient.socialName || portalPatient.name}</h1>

                <p>{portalPatient.email || currentUser.email}</p>

              </div>

            </div>

            <div className={styles.heroStats}>

              <div>

                <span>Próximo horário</span>

                <strong>

                  {appointmentsLoading ? "..." : nextAppointment

                    ? `${formatDate(nextAppointment.date)} às ${nextAppointment.time}`

                    : "Sem agenda"}

                </strong>

              </div>

              <div>

                <span>Laudos</span>

                <strong>{reportsLoading ? "..." : reports.length}</strong>

              </div>

              <div>

                <span>Receitas</span>

                <strong>{portalPrescriptions.length}</strong>

              </div>

            </div>

          </div>



          <div className={styles.featureGrid}>

            <FeatureTile label="Consultas" count={consultations.length} icon={<IconCalendar />} onClick={() => setActiveSection("consultations")} />

            <FeatureTile label="Exames" count={exams.length} icon={<IconFlask />} onClick={() => setActiveSection("exams")} />

            <FeatureTile label="Laudos" count={reports.length} icon={<IconFile />} onClick={() => setActiveSection("reports")} />

            <FeatureTile label="Receitas" count={portalPrescriptions.length} icon={<IconPill />} onClick={() => setActiveSection("prescriptions")} />

            <FeatureTile label="Agendar" icon={<IconPlus />} accent onClick={() => onBookAppointment && setBookingOpen(true)} />

          </div>

        </>

      )}



      {activeSection === "consultations" && (

        <PatientConsultationsView

          appointments={consultations}

          loading={appointmentsLoading}

          statusLabels={APPOINTMENT_STATUS}

          onBack={() => setActiveSection("hub")}

          onBook={onBookAppointment ? () => setBookingOpen(true) : undefined}

          onReschedule={setRescheduleTarget}

          onCancel={setCancelTarget}

        />

      )}



      {activeSection === "exams" && (

        <Card className={styles.sectionCard}>

          <SectionHeader title="Exames e procedimentos" subtitle={`${exams.length} registro(s)`} onBack={() => setActiveSection("hub")} />

          {exams.length === 0 ? (

            <EmptyBlock title="Nenhum exame encontrado" text="Exames agendados ou procedimentos ficam reunidos aqui." />

          ) : (

            <div className={styles.list}>

              {exams.map((appointment) => (

                <div key={appointment.id} className={styles.listItem}>

                  <div>

                    <p>{formatAppointmentType(appointment.type)}</p>

                    <span>{formatDate(appointment.date)} às {appointment.time} com {appointment.doctorName}</span>

                  </div>

                  <Badge>{APPOINTMENT_STATUS[appointment.status] ?? appointment.status}</Badge>

                </div>

              ))}

            </div>

          )}

        </Card>

      )}



      {activeSection === "reports" && (

        <Card className={styles.sectionCard}>

          <SectionHeader title="Laudos" subtitle={`${reports.length} documento(s)`} onBack={() => setActiveSection("hub")} />

          {reportsLoading ? (

            <EmptyBlock title="Carregando laudos..." text="Aguarde enquanto buscamos os documentos liberados." />

          ) : reports.length === 0 ? (

            <EmptyBlock title="Nenhum laudo disponível" text="Laudos finalizados pela equipe médica aparecerão nesta área." />

          ) : (

            <div className={styles.documentList}>

              {reports.map((report) => (

                <div key={report.id} className={styles.documentItem}>

                  <div>

                    <p>{report.type}</p>

                    <span>{formatDate(report.date)} • {report.doctorName || "Equipe médica"}</span>

                  </div>

                  <div className={styles.documentActions}>

                    <Button size="sm" variant="outline" onClick={() => setSelectedReport(report)}>Visualizar</Button>

                    <Badge>{REPORT_STATUS[report.status] ?? report.status}</Badge>

                  </div>

                </div>

              ))}

            </div>

          )}

        </Card>

      )}



      {activeSection === "prescriptions" && (

        <Card className={styles.sectionCard}>

          <SectionHeader title="Receitas" subtitle={`${portalPrescriptions.length} receita(s)`} onBack={() => setActiveSection("hub")} />

          {portalPrescriptions.length === 0 ? (

            <EmptyBlock title="Nenhuma receita emitida" text="Receitas vinculadas ao seu cadastro serão listadas aqui." />

          ) : (

            <div className={styles.list}>

              {portalPrescriptions.map((prescription) => (

                <div key={prescription.id} className={styles.recordItem}>

                  <p>{prescription.medications.map((m) => m.name).join(", ") || "Receita médica"}</p>

                  <span>{formatDate(prescription.date)} • {prescription.doctorName}</span>

                </div>

              ))}

            </div>

          )}

        </Card>

      )}



      <Modal

        isOpen={Boolean(selectedReport)}

        onClose={() => setSelectedReport(null)}

        title={selectedReport?.type ?? "Laudo"}

        subtitle={selectedReport ? `${formatDate(selectedReport.date)} • ${selectedReport.doctorName || "Equipe médica"}` : undefined}

        size="lg"

        footer={<Button variant="outline" onClick={() => setSelectedReport(null)}>Fechar</Button>}

      >

        {selectedReport && (

          <div className={styles.reportViewer}>

            <div className={styles.reportMeta}>

              <div>

                <span>Status</span>

                <strong>{REPORT_STATUS[selectedReport.status] ?? selectedReport.status}</strong>

              </div>

              {selectedReport.cid10 && (

                <div><span>CID-10</span><strong>{selectedReport.cid10}</strong></div>

              )}

              {selectedReport.orderNumber && (

                <div><span>Pedido</span><strong>{selectedReport.orderNumber}</strong></div>

              )}

            </div>

            {selectedReport.diagnosis && (

              <section className={styles.reportSection}>

                <h3>Diagnóstico</h3>

                <p>{selectedReport.diagnosis}</p>

              </section>

            )}

            <section className={styles.reportSection}>

              <h3>Conteúdo do laudo</h3>

              <div className={styles.reportContent}>

                {selectedReport.contentHtml || selectedReport.content || "Conteúdo não informado."}

              </div>

            </section>

            {selectedReport.conclusion && (

              <section className={styles.reportSection}>

                <h3>Conclusão</h3>

                <p>{selectedReport.conclusion}</p>

              </section>

            )}

          </div>

        )}

      </Modal>



      <ConfirmDialog

        isOpen={Boolean(cancelTarget)}

        onClose={() => setCancelTarget(null)}

        onConfirm={() => void handleCancelConfirm()}

        title="Cancelar consulta"

        message={cancelTarget

          ? `Deseja cancelar a consulta de ${formatDate(cancelTarget.date)} às ${cancelTarget.time} com ${cancelTarget.doctorName}?`

          : ""}

        confirmLabel="Sim, cancelar"

        variant="danger"

      />



      {onBookAppointment && portalPatient && (

        <PatientBookAppointmentModal

          isOpen={bookingOpen}

          onClose={() => setBookingOpen(false)}

          patient={portalPatient}

          onBook={onBookAppointment}

          onSuccess={() => { void loadAppointments(); setActiveSection("consultations") }}

        />

      )}



      {onUpdateAppointment && (

        <PatientRescheduleModal

          isOpen={Boolean(rescheduleTarget)}

          onClose={() => setRescheduleTarget(null)}

          appointment={rescheduleTarget}

          onReschedule={onUpdateAppointment}

          onSuccess={() => void loadAppointments()}

        />

      )}

    </div>

  )

}


