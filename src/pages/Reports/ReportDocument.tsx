import { formatCrm, formatDate } from "../../utils"
import styles from "./Reports.module.css"

export interface ReportPreviewData {
  patientName: string
  reportType: string
  cid10: string
  diagnosis: string
  conclusion: string
  contentHtml: string
  date: string
  hideDate: boolean
  hideSignature: boolean
  doctorName: string
  doctorCrm?: string
  doctorSpecialty?: string
  orderNumber?: string
}

interface ReportDocumentProps extends ReportPreviewData {
  id?: string
}

export function ReportDocument({
  id,
  patientName,
  reportType,
  cid10,
  diagnosis,
  conclusion,
  contentHtml,
  date,
  hideDate,
  hideSignature,
  doctorName,
  doctorCrm,
  doctorSpecialty,
  orderNumber,
}: ReportDocumentProps) {
  return (
    <article
      id={id}
      data-report-print=""
      className={styles.reportDocument}
      aria-label="Documento do laudo"
    >
      <header className={styles.reportDocHeader}>
        <div>
          <p className={styles.reportClinicName}>MediConnect Clínica Médica</p>
          <p className={styles.reportClinicInfo}>Av. Principal, 1000 · Aracaju / SE · (79) 3000-0000</p>
        </div>
        {!hideDate && (
          <div className={styles.reportDateBlock}>
            <p className={styles.reportDateLabel}>Data</p>
            <p className={styles.reportDateValue}>{date ? formatDate(date) : "—"}</p>
          </div>
        )}
      </header>

      <div className={styles.reportDivider} />

      <p className={styles.reportDocTitle}>{reportType || "Laudo Médico"}</p>
      {orderNumber && <p className={styles.reportOrderNumber}>Pedido {orderNumber}</p>}

      <div className={styles.reportPatientBlock}>
        <p><span className={styles.reportFieldLabel}>Paciente:</span> {patientName || "—"}</p>
        {cid10 && <p><span className={styles.reportFieldLabel}>CID-10:</span> {cid10}</p>}
      </div>

      {diagnosis && (
        <section className={styles.reportSection}>
          <h3 className={styles.reportSectionTitle}>Diagnóstico</h3>
          <p className={styles.reportSectionText}>{diagnosis}</p>
        </section>
      )}

      {contentHtml && (
        <section className={styles.reportSection}>
          <h3 className={styles.reportSectionTitle}>Conteúdo</h3>
          <div
            className={styles.reportRichContent}
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
        </section>
      )}

      {conclusion && (
        <section className={styles.reportSection}>
          <h3 className={styles.reportSectionTitle}>Conclusão</h3>
          <p className={styles.reportSectionText}>{conclusion}</p>
        </section>
      )}

      {!hideSignature && (
        <footer className={styles.reportSignature}>
          <div className={styles.reportSignatureLine} />
          <p className={styles.reportDoctorName}>{doctorName || "Médico(a) responsável"}</p>
          {doctorCrm && <p className={styles.reportDoctorInfo}>CRM: {formatCrm(doctorCrm)}</p>}
          {doctorSpecialty && <p className={styles.reportDoctorInfo}>{doctorSpecialty}</p>}
          <p className={styles.reportSignatureNote}>
            Assinatura digital indisponível nesta versão. Documento válido mediante identificação do profissional.
          </p>
        </footer>
      )}
    </article>
  )
}
