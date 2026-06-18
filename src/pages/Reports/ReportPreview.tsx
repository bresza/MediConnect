import { Button } from "../../components/ui/Button/Button"
import { printElement } from "../../utils/printReport"
import { ReportDocument, type ReportPreviewData } from "./ReportDocument"
import styles from "./Reports.module.css"

export type { ReportPreviewData }

interface ReportPreviewProps extends ReportPreviewData {
  onBack: () => void
  backLabel?: string
  primaryAction?: { label: string; onClick: () => void }
}

export function ReportPreview({
  reportType,
  onBack,
  backLabel = "← Voltar",
  primaryAction,
  ...documentData
}: ReportPreviewProps) {
  return (
    <div className={styles.previewRoot}>
      <div className={styles.previewToolbar}>
        <Button variant="ghost" onClick={onBack}>{backLabel}</Button>
        <div className={styles.previewToolbarActions}>
          <Button
            variant="outline"
            onClick={() => printElement("report-print-area", reportType || "Laudo Médico")}
          >
            Gerar PDF
          </Button>
          {primaryAction && (
            <Button onClick={primaryAction.onClick}>{primaryAction.label}</Button>
          )}
        </div>
      </div>

      <ReportDocument id="report-print-area" reportType={reportType} {...documentData} />
    </div>
  )
}
