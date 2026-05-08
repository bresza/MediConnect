import { useMemo } from "react"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Badge } from "../../components/ui/Badge/Badge"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { formatAppointmentType, formatDate } from "../../utils"
import type { Appointment, MedicalRecord, Patient, Prescription, User } from "../../types"
import styles from "./PatientPortal.module.css"

interface PatientPortalProps {
  currentUser: User
  patient: Patient | null
  appointments: Appointment[]
  records: MedicalRecord[]
  prescriptions: Prescription[]
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
  records,
  prescriptions,
}: PatientPortalProps) {
  const portalPatient = patient

  const nextAppointment = useMemo(
    () => appointments
      .filter((appointment) => appointment.status !== "cancelled")
      .filter(isFutureAppointment)
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0],
    [appointments],
  )

  const consultations = appointments.filter((appointment) =>
    appointment.type === "consultation" || appointment.type === "return")
  const exams = appointments.filter((appointment) =>
    appointment.type === "exam" || appointment.type === "procedure")
  const finalizedRecords = records.filter((record) => record.status === "finalized")

  if (!portalPatient) {
    return (
      <div>
        <Topbar title="Minha saúde" subtitle="Conta de paciente" />
        <Card className={styles.unlinkedCard}>
          <Avatar name={currentUser.name} size="lg" />
          <div>
            <h2>Conta criada, vínculo pendente</h2>
            <p>
              Ainda não encontramos um cadastro de paciente com o CPF ou e-mail desta conta.
              Quando a clínica vincular seu cadastro, consultas e documentos aparecerão aqui.
            </p>
            <div className={styles.unlinkedMeta}>
              <span>{currentUser.email}</span>
              {currentUser.patientCpf && <span>CPF {currentUser.patientCpf}</span>}
            </div>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <Topbar title="Minha saúde" subtitle="Consultas, exames e documentos vinculados ao seu cadastro" />

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
            <strong>{nextAppointment ? `${formatDate(nextAppointment.date)} às ${nextAppointment.time}` : "Sem agenda"}</strong>
          </div>
          <div>
            <span>Atendimentos</span>
            <strong>{finalizedRecords.length}</strong>
          </div>
          <div>
            <span>Receitas</span>
            <strong>{prescriptions.length}</strong>
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
                  <Badge>{appointment.status}</Badge>
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
                  <Badge>{appointment.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className={styles.panel}>
          <SectionTitle title="Atendimentos concluídos" count={finalizedRecords.length} />
          {finalizedRecords.length === 0 ? (
            <EmptyBlock title="Nenhum atendimento concluído" text="Registros finalizados podem aparecer aqui de forma resumida." />
          ) : (
            <div className={styles.list}>
              {finalizedRecords.map((record) => (
                <div key={record.id} className={styles.recordItem}>
                  <p>{record.chiefComplaint}</p>
                  <span>{formatDate(record.date)} - {record.doctorName}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className={styles.panel}>
          <SectionTitle title="Receitas" count={prescriptions.length} />
          {prescriptions.length === 0 ? (
            <EmptyBlock title="Nenhuma receita emitida" text="Receitas vinculadas ao seu cadastro serão listadas aqui." />
          ) : (
            <div className={styles.list}>
              {prescriptions.map((prescription) => (
                <div key={prescription.id} className={styles.recordItem}>
                  <p>{prescription.medications.map((medication) => medication.name).join(", ") || "Receita médica"}</p>
                  <span>{formatDate(prescription.date)} - {prescription.doctorName}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
