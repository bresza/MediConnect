import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  getPatientPrescriptionsByIdentity,
  getPatientReportsByIdentity,
} from "../../services/domain"
import { getPatientAppointmentsByIdentity } from "../../services/appointments"
import { getPatientFinancialRecordsByIdentity } from "../../services/financial"
import { getPatientByIdentity } from "../../services/patients"
import { attachPatientPhoto } from "../../services/patientPhoto"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Badge } from "../../components/ui/Badge/Badge"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Button } from "../../components/ui/Button/Button"
import { Modal } from "../../components/ui/Modal/Modal"
import { PatientRescheduleModal } from "../../components/ui/PatientReschedule/PatientRescheduleModal"
import { PatientConsultationsView } from "./PatientConsultationsView"
import { PatientFindDoctorView } from "./PatientFindDoctorView"
import { PatientBillingView } from "./PatientBillingView"
import { PatientDashboard } from "./PatientDashboard"
import { PatientProfileSettings } from "./PatientProfileSettings"
import { SECTION_META, type PortalSection } from "./patientPortalSections"
import { RichTextEditor } from "../../components/ui/RichTextEditor/RichTextEditor"
import { formatAppointmentType, formatCpfBR, formatDate } from "../../utils"
import { getPatientDisplayStatus, showInPatientScheduledTab } from "../../utils/patientAppointments"
import type { Appointment, FinancialRecord, Patient, Prescription, Report, User } from "../../types"
import styles from "./PatientPortal.module.css"

interface PatientPortalProps {
  currentUser: User
  patient: Patient | null
  appointments: Appointment[]
  prescriptions: Prescription[]
  activeSection: PortalSection
  onSectionChange: (section: PortalSection) => void
  onNavCountsChange?: (counts: Partial<Record<PortalSection, number>>) => void
  onBookAppointment?: (appointment: Omit<Appointment, "id">) => Promise<void>
  onCancelAppointment?: (appointment: Appointment, reason: string) => Promise<void>
  onUpdateAppointment?: (appointment: Appointment) => Promise<void>
}

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

function EmptyBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className={styles.emptyBlock}>
      <p>{title}</p>
      <span>{text}</span>
    </div>
  )
}

function ContentPanel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <Card className={styles.contentPanel}>
      <header className={styles.contentHeader}>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </header>
      <div className={styles.contentBody}>{children}</div>
    </Card>
  )
}

export function PatientPortal({
  currentUser,
  patient,
  appointments,
  prescriptions: propPrescriptions,
  activeSection,
  onSectionChange,
  onNavCountsChange,
  onBookAppointment,
  onCancelAppointment,
  onUpdateAppointment,
}: PatientPortalProps) {
  const [resolvedPatient, setResolvedPatient] = useState<Patient | null>(patient)
  const [reports, setReports] = useState<Report[]>([])
  const [billingRecords, setBillingRecords] = useState<FinancialRecord[]>([])
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null)
  const [reportsLoading, setReportsLoading] = useState(true)
  const [billingLoading, setBillingLoading] = useState(true)
  const [apiAppointments, setApiAppointments] = useState<Appointment[]>([])
  const [appointmentsLoading, setAppointmentsLoading] = useState(true)
  const [apiPrescriptions, setApiPrescriptions] = useState<Prescription[]>([])

  const portalPatient = resolvedPatient ?? patient
  const patientId = portalPatient?.id ?? currentUser.patientId ?? currentUser.id
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

  const loadPatient = useCallback(async () => {
    const linked = await getPatientByIdentity({
      patientId: currentUser.patientId ?? patient?.id,
      userId: currentUser.id,
    }).catch(() => patient)

    const base = linked ?? patient
    if (!base) {
      setResolvedPatient(null)
      return
    }

    const withPhoto = await attachPatientPhoto(base).catch(() => base)
    setResolvedPatient(withPhoto)
  }, [currentUser.id, currentUser.patientId, currentUser.name, currentUser.email, currentUser.patientCpf, patient])

  useEffect(() => { void loadPatient() }, [loadPatient])

  const loadReports = useCallback(async () => {
    if (!patientId) { setReports([]); setReportsLoading(false); return }
    setReportsLoading(true)
    try { setReports(await getPatientReportsByIdentity(patientIdentity)) }
    catch { setReports([]) }
    finally { setReportsLoading(false) }
  }, [patientId, patientIdentity])

  const loadBilling = useCallback(async () => {
    if (!patientId) { setBillingRecords([]); setBillingLoading(false); return }
    setBillingLoading(true)
    try { setBillingRecords(await getPatientFinancialRecordsByIdentity(patientIdentity)) }
    catch { setBillingRecords([]) }
    finally { setBillingLoading(false) }
  }, [patientId, patientIdentity])

  const loadAppointments = useCallback(async () => {
    if (!patientId) { setApiAppointments([]); setAppointmentsLoading(false); return }
    setAppointmentsLoading(true)
    try { setApiAppointments(await getPatientAppointmentsByIdentity(patientIdentity)) }
    catch { setApiAppointments([]) }
    finally { setAppointmentsLoading(false) }
  }, [patientId, patientIdentity])

  const loadClinicalData = useCallback(async () => {
    if (!patientId) { setApiPrescriptions([]); return }
    setApiPrescriptions(await getPatientPrescriptionsByIdentity(patientIdentity).catch(() => []))
  }, [patientId, patientIdentity])

  useEffect(() => { void loadReports() }, [loadReports])
  useEffect(() => { void loadBilling() }, [loadBilling])
  useEffect(() => { void loadAppointments() }, [loadAppointments])
  useEffect(() => { void loadClinicalData() }, [loadClinicalData])

  const portalAppointments = apiAppointments.length > 0 ? apiAppointments : appointments
  const portalPrescriptions = apiPrescriptions.length > 0 ? apiPrescriptions : propPrescriptions
  const consultations = portalAppointments.filter((a) => a.type === "consultation" || a.type === "return")
  const exams = portalAppointments.filter((a) => a.type === "exam" || a.type === "procedure")
  const scheduledConsultations = consultations.filter(showInPatientScheduledTab)
  const cancelledConsultations = consultations.filter((a) => a.status === "cancelled")
  const pendingBilling = billingRecords.filter((r) => r.status === "Pending" || r.status === "Overdue")
  const nextAppointment = portalAppointments
    .filter((a) => a.status !== "cancelled")
    .filter(isFutureAppointment)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0]

  const navCounts: Partial<Record<PortalSection, number>> = {
    consultations: scheduledConsultations.length,
    exams: exams.length,
    reports: reports.length,
    prescriptions: portalPrescriptions.length,
    billing: pendingBilling.length,
  }

  useEffect(() => {
    onNavCountsChange?.(navCounts)
  }, [
    onNavCountsChange,
    scheduledConsultations.length,
    exams.length,
    reports.length,
    portalPrescriptions.length,
    pendingBilling.length,
  ])

  const sectionMeta = SECTION_META[activeSection]

  if (!portalPatient) {
    return (
      <div className={styles.portal}>
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
    <div className={styles.portal}>
      <Card className={styles.heroCard}>
        <div className={styles.heroMain}>
          <Avatar
            name={portalPatient.name}
            photoUrl={portalPatient.photoUrl}
            size="lg"
          />
          <div className={styles.heroText}>
            <p className={styles.heroEyebrow}>Portal do paciente</p>
            <h1>{portalPatient.socialName || portalPatient.name}</h1>
            <span>{portalPatient.email || currentUser.email}</span>
            {portalPatient.cpf && <span>CPF {formatCpfBR(portalPatient.cpf)}</span>}
          </div>
        </div>
        <div className={styles.heroAside}>
          <div>
            <span>Próxima consulta</span>
            <strong>
              {appointmentsLoading ? "..." : nextAppointment
                ? `${formatDate(nextAppointment.date)} às ${nextAppointment.time}`
                : "Sem agenda"}
            </strong>
          </div>
          <Button variant="outline" size="sm" onClick={() => onSectionChange("profile")}>
            Configurar perfil
          </Button>
        </div>
      </Card>

      <div className={styles.mainArea}>
        {activeSection === "overview" && (
          <PatientDashboard
            nextAppointment={nextAppointment}
            scheduledConsultations={scheduledConsultations}
            cancelledConsultations={cancelledConsultations}
            reports={reports}
            prescriptions={portalPrescriptions}
            pendingBilling={pendingBilling}
            appointmentsLoading={appointmentsLoading}
            onNavigate={onSectionChange}
            onViewReport={setSelectedReport}
          />
        )}

        {activeSection !== "overview" && (
          <ContentPanel title={sectionMeta.title} subtitle={sectionMeta.subtitle}>
            {activeSection === "find-doctor" && (
              onBookAppointment ? (
                <PatientFindDoctorView
                  embedded
                  patient={portalPatient}
                  onBook={onBookAppointment}
                  onSuccess={() => {
                    void loadAppointments()
                    onSectionChange("consultations")
                  }}
                  onWaitlistEnrolled={() => onSectionChange("consultations")}
                />
              ) : (
                <EmptyBlock
                  title="Agendamento indisponível"
                  text="No momento não é possível agendar consultas pelo portal."
                />
              )
            )}

            {activeSection === "consultations" && (
              <PatientConsultationsView
                embedded
                appointments={consultations}
                loading={appointmentsLoading}
                statusLabels={APPOINTMENT_STATUS}
                onBook={onBookAppointment ? () => onSectionChange("find-doctor") : undefined}
                onReschedule={onUpdateAppointment ? setRescheduleTarget : undefined}
                onCancel={onCancelAppointment}
              />
            )}

            {activeSection === "exams" && (
              exams.length === 0 ? (
                <EmptyBlock title="Nenhum exame encontrado" text="Exames agendados ou procedimentos ficam reunidos aqui." />
              ) : (
                <div className={styles.recordList}>
                  {exams.map((appointment) => (
                    <div key={appointment.id} className={styles.recordCard}>
                      <div>
                        <p>{formatAppointmentType(appointment.type)}</p>
                        <span>{formatDate(appointment.date)} às {appointment.time} com {appointment.doctorName}</span>
                      </div>
                      <Badge>{getPatientDisplayStatus(appointment)}</Badge>
                    </div>
                  ))}
                </div>
              )
            )}

            {activeSection === "reports" && (
              reportsLoading ? (
                <EmptyBlock title="Carregando laudos..." text="Aguarde enquanto buscamos os documentos liberados." />
              ) : reports.length === 0 ? (
                <EmptyBlock title="Nenhum laudo disponível" text="Laudos finalizados pela equipe médica aparecerão nesta área." />
              ) : (
                <div className={styles.recordList}>
                  {reports.map((report) => (
                    <div key={report.id} className={styles.recordCard}>
                      <div>
                        <p>{report.type}</p>
                        <span>{formatDate(report.date)} • {report.doctorName || "Equipe médica"}</span>
                      </div>
                      <div className={styles.recordActions}>
                        <Button size="sm" variant="outline" onClick={() => setSelectedReport(report)}>Visualizar</Button>
                        <Badge>{REPORT_STATUS[report.status] ?? report.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {activeSection === "prescriptions" && (
              portalPrescriptions.length === 0 ? (
                <EmptyBlock title="Nenhuma receita emitida" text="Receitas vinculadas ao seu cadastro serão listadas aqui." />
              ) : (
                <div className={styles.recordList}>
                  {portalPrescriptions.map((prescription) => (
                    <div key={prescription.id} className={styles.recordCard}>
                      <div>
                        <p>{prescription.medications.map((m) => m.name).join(", ") || "Receita médica"}</p>
                        <span>{formatDate(prescription.date)} • {prescription.doctorName}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {activeSection === "billing" && (
              <PatientBillingView records={billingRecords} loading={billingLoading} />
            )}

            {activeSection === "profile" && (
              <PatientProfileSettings
                patient={portalPatient}
                onSaved={(saved) => setResolvedPatient(saved)}
              />
            )}
          </ContentPanel>
        )}
      </div>

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
              {(selectedReport.contentHtml || selectedReport.content) ? (
                <RichTextEditor
                  value={selectedReport.contentHtml || selectedReport.content || ""}
                  onChange={() => {}}
                  readOnly
                />
              ) : (
                <p className={styles.reportEmpty}>Conteúdo não informado.</p>
              )}
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
