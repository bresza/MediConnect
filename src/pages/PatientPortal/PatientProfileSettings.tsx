import type { Patient } from "../../types"
import { formatCpfBR, formatDate, formatPhoneBR } from "../../utils"
import styles from "./PatientProfileSettings.module.css"

interface PatientProfileSettingsProps {
  patient: Patient
}

const CHANNEL_LABELS: Record<string, string> = {
  WhatsApp: "WhatsApp",
  Email: "E-mail",
  SMS: "SMS",
  Phone: "Telefone",
}

function displayValue(value?: string | null): string {
  const trimmed = value?.trim()
  return trimmed || "—"
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <strong className={styles.fieldValue}>{value}</strong>
    </div>
  )
}

/** Dados cadastrais do paciente — somente leitura no portal. */
export function PatientProfileSettings({ patient }: PatientProfileSettingsProps) {
  const channel = patient.preferredChannel
    ? (CHANNEL_LABELS[patient.preferredChannel] ?? patient.preferredChannel)
    : "—"

  return (
    <div className={styles.wrap}>
      <p className={styles.hint}>
        Seus dados são exibidos apenas para consulta. Para alterações, fale com a recepção da clínica.
      </p>

      <section className={styles.formSection}>
        <div className={styles.fieldsGrid}>
          <Field label="Nome completo" value={displayValue(patient.name)} />
          <Field label="Nome social" value={displayValue(patient.socialName)} />
          <Field label="E-mail" value={displayValue(patient.email)} />
          <Field
            label="Telefone"
            value={patient.phone ? formatPhoneBR(patient.phone) : "—"}
          />
          <Field
            label="Data de nascimento"
            value={patient.dob ? formatDate(patient.dob) : "—"}
          />
          <Field label="Canal preferido" value={channel} />
        </div>

        <div className={styles.readonlyBlock}>
          <div>
            <span>CPF</span>
            <strong>{patient.cpf ? formatCpfBR(patient.cpf) : "—"}</strong>
          </div>
          <div>
            <span>Cadastro desde</span>
            <strong>{patient.createdAt ? formatDate(patient.createdAt) : "—"}</strong>
          </div>
          <div>
            <span>Convênio</span>
            <strong>{displayValue(patient.healthInsurance || "Particular")}</strong>
          </div>
        </div>
      </section>
    </div>
  )
}
