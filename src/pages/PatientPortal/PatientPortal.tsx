import { useCallback, useEffect, useMemo, useState } from "react"
import {
  getPatientPrescriptionsByIdentity,
  getPatientReportsByIdentity,
} from "../../services/domain"
import { getPatientAppointmentsByIdentity } from "../../services/appointments"
import { getPatientByIdentity } from "../../services/patients"
import { resolveRememberedPatientId } from "../../services/patientLinks"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Badge } from "../../components/ui/Badge/Badge"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Button } from "../../components/ui/Button/Button"
import { Modal } from "../../components/ui/Modal/Modal"
import { formatAppointmentType, formatCpfBR, formatDate } from "../../utils"
import type { Appointment, Patient, Prescription, Report, User } from "../../types"
import styles from "./PatientPortal.module.css"

interface PatientPortalProps {
  currentUser: User
  patient: Patient | null
  appointments: Appointment[]
  prescriptions: Prescription[]
}

const APPOINTMENT_STATUS: Record<string, string> = {
  scheduled: "Agendada",
  confirmed: "Confirmada",
  completed: "Concluída",
  cancelled: "Cancelada",
  absent: "Ausente",
  pending: "Pendente",
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

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className={styles.sectionTitle}>
      <h2>{title}</h2>
      <span>{count}</span>
    </div>
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

export function PatientPortal({
  currentUser,
  patient,
  appointments,
  prescriptions: propPrescriptions,
}: PatientPortalProps) {
  const [resolvedPatient, setResolvedPatient] = useState<Patient | null>(patient)
  const [reports, setReports] = useState<Report[]>([])
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [reportsLoading, setReportsLoading] = useState(true)
  const [apiAppointments, setApiAppointments] = useState<Appointment[]>([])
  const [appointmentsLoading, setAppointmentsLoading] = useState(true)
  const [apiPrescriptions, setApiPrescriptions] = useState<Prescription[]>([])
  const portalPatient = resolvedPatient ?? patient
  const rememberedPatientId = resolveRememberedPatientId({
    name: portalPatient?.name ?? patient?.name ?? currentUser.name,
    email: portalPatient?.email ?? patient?.email ?? currentUser.email,
    cpf: portalPatient?.cpf ?? patient?.cpf ?? currentUser.patientCpf,
  })
  const patientId = rememberedPatientId ?? portalPatient?.id ?? currentUser.patientId ?? ""
  const patientIdentity = useMemo(() => ({
    patientId,
    userId: currentUser.id,
    name: portalPatient?.name ?? patient?.name ?? currentUser.name,
    email: portalPatient?.email ?? patient?.email ?? currentUser.email,
    cpf: portalPatient?.cpf ?? patient?.cpf ?? currentUser.patientCpf,
  }), [
    patientId,
    currentUser.id,
    currentUser.name,
    currentUser.email,
    currentUser.patientCpf,
    portalPatient?.name,
    portalPatient?.email,
    portalPatient?.cpf,
    patient?.name,
    patient?.email,
    patient?.cpf,
  ])

  useEffect(() => {
    let alive = true

    getPatientByIdentity({
      patientId: currentUser.patientId ?? patient?.id,
      userId: currentUser.id,
      name: patient?.name ?? currentUser.name,
      email: patient?.email ?? currentUser.email,
      cpf: patient?.cpf ?? currentUser.patientCpf,
    })
      .then((linked) => {
        if (!alive) return
        setResolvedPatient(linked ?? patient)
      })
      .catch(() => {
        if (alive) setResolvedPatient(patient)
      })

    return () => { alive = false }
  }, [
    currentUser.id,
    currentUser.patientId,
    currentUser.name,
    currentUser.email,
    currentUser.patientCpf,
    patient,
  ])

  const loadReports = useCallback(async () => {
    if (!patientId) {
      setReports([])
      setReportsLoading(false)
      return
    }

    setReportsLoading(true)
    try {
      setReports(await getPatientReportsByIdentity(patientIdentity))
    } catch {
      setReports([])
    } finally {
      setReportsLoading(false)
    }
  }, [patientId, patientIdentity])

  useEffect(() => { loadReports() }, [loadReports])

  const loadAppointments = useCallback(async () => {
    if (!patientId) {
      setApiAppointments([])
      setAppointmentsLoading(false)
      return
    }

    setAppointmentsLoading(true)
    try {
      setApiAppointments(await getPatientAppointmentsByIdentity(patientIdentity))
    } catch {
      setApiAppointments([])
    } finally {
      setAppointmentsLoading(false)
    }
  }, [patientId, patientIdentity])

  useEffect(() => { loadAppointments() }, [loadAppointments])

  const loadClinicalData = useCallback(async () => {
    if (!patientId) {
      setApiPrescriptions([])
      return
    }

    const patientPrescriptions = await getPatientPrescriptionsByIdentity(patientIdentity).catch(() => [])
    setApiPrescriptions(patientPrescriptions)
  }, [patientId, patientIdentity])

  useEffect(() => { loadClinicalData() }, [loadClinicalData])

  const patientReports = useMemo(
    () => reports,
    [reports],
  )

  const portalAppointments = apiAppointments.length > 0 ? apiAppointments : appointments
  const portalPrescriptions = apiPrescriptions.length > 0 ? apiPrescriptions : propPrescriptions

  const consultations = portalAppointments.filter((appointment) =>
    appointment.type === "consultation" || appointment.type === "return")
  const exams = portalAppointments.filter((appointment) =>
    appointment.type === "exam" || appointment.type === "procedure")
  const nextAppointment = portalAppointments
    .filter((appointment) => appointment.status !== "cancelled")
    .filter(isFutureAppointment)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0]

  if (!portalPatient) {
    return (
      <div>
        <Topbar
          title="Minha saúde"
          subtitle="Conta de paciente"
        />
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
        subtitle="Consultas, exames e laudos vinculados ao seu cadastro"
      />

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
            <strong>{appointmentsLoading ? "..." : nextAppointment ? `${formatDate(nextAppointment.date)} às ${nextAppointment.time}` : "Sem agenda"}</strong>
          </div>
          <div>
            <span>Laudos</span>
            <strong>{reportsLoading ? "..." : patientReports.length}</strong>
          </div>
          <div>
            <span>Receitas</span>
            <strong>{portalPrescriptions.length}</strong>
          </div>
        </div>
      </div>

      <div className={styles.grid}>
        <Card className={styles.panel}>
          <SectionTitle title="Consultas" count={consultations.length} />
          {consultations.length === 0 ? (
            <EmptyBlock title="Nenhuma consulta encontrada" text="Assim que houver agendamento, ele aparecerá nesta lista." />
          ) : (
            <div className={styles.list}>
              {consultations.map((appointment) => (
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

        <Card className={styles.panel}>
          <SectionTitle title="Exames e procedimentos" count={exams.length} />
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

        <Card className={styles.panelWide}>
          <SectionTitle title="Laudos" count={patientReports.length} />
          {reportsLoading ? (
            <EmptyBlock title="Carregando laudos..." text="Aguarde enquanto buscamos os documentos liberados." />
          ) : patientReports.length === 0 ? (
            <EmptyBlock title="Nenhum laudo disponível" text="Laudos finalizados pela equipe médica aparecerão nesta área." />
          ) : (
            <div className={styles.documentList}>
              {patientReports.map((report) => (
                <div key={report.id} className={styles.documentItem}>
                  <div>
                    <p>{report.type}</p>
                    <span>{formatDate(report.date)} • {report.doctorName || "Equipe médica"}</span>
                  </div>
                  <div className={styles.documentActions}>
                    <Button size="sm" variant="outline" onClick={() => setSelectedReport(report)}>
                      Visualizar
                    </Button>
                    <Badge>{REPORT_STATUS[report.status] ?? report.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className={styles.panel}>
          <SectionTitle title="Receitas" count={portalPrescriptions.length} />
          {portalPrescriptions.length === 0 ? (
            <EmptyBlock title="Nenhuma receita emitida" text="Receitas vinculadas ao seu cadastro serão listadas aqui." />
          ) : (
            <div className={styles.list}>
              {portalPrescriptions.map((prescription) => (
                <div key={prescription.id} className={styles.recordItem}>
                  <p>{prescription.medications.map((medication) => medication.name).join(", ") || "Receita médica"}</p>
                  <span>{formatDate(prescription.date)} • {prescription.doctorName}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Modal
        isOpen={Boolean(selectedReport)}
        onClose={() => setSelectedReport(null)}
        title={selectedReport?.type ?? "Laudo"}
        subtitle={selectedReport ? `${formatDate(selectedReport.date)} • ${selectedReport.doctorName || "Equipe médica"}` : undefined}
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setSelectedReport(null)}>
            Fechar
          </Button>
        }
      >
        {selectedReport && (
          <div className={styles.reportViewer}>
            <div className={styles.reportMeta}>
              <div>
                <span>Status</span>
                <strong>{REPORT_STATUS[selectedReport.status] ?? selectedReport.status}</strong>
              </div>
              {selectedReport.cid10 && (
                <div>
                  <span>CID-10</span>
                  <strong>{selectedReport.cid10}</strong>
                </div>
              )}
              {selectedReport.orderNumber && (
                <div>
                  <span>Pedido</span>
                  <strong>{selectedReport.orderNumber}</strong>
                </div>
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
    </div>
  )
}
