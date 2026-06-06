import { useMemo, useState } from "react"
import { Badge } from "../../components/ui/Badge/Badge"
import { Button } from "../../components/ui/Button/Button"
import { Modal } from "../../components/ui/Modal/Modal"
import { RichTextEditor } from "../../components/ui/RichTextEditor/RichTextEditor"
import { formatDate } from "../../utils"
import type { Report, ReportStatus } from "../../types"
import styles from "./PatientReportsView.module.css"

interface PatientReportsViewProps {
  reports: Report[]
  loading?: boolean
}

const STATUS_LABEL: Record<ReportStatus, string> = {
  Draft: "Em elaboração",
  Finalized: "Disponível",
  Sent: "Enviado",
}

type TabId = "available" | "pending"

function reportTitle(report: Report): string {
  const title = report.type?.trim() || report.exam?.trim()
  return title || "Laudo médico"
}

function isReadable(report: Report): boolean {
  return report.status === "Finalized" || report.status === "Sent"
}

function reportTs(report: Report): number {
  return new Date(`${report.date}T12:00:00`).getTime()
}

function DocIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function PatientReportsView({ reports, loading }: PatientReportsViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>("available")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Report | null>(null)

  const sorted = useMemo(
    () => [...reports].sort((a, b) => reportTs(b) - reportTs(a)),
    [reports],
  )

  const available = useMemo(() => sorted.filter(isReadable), [sorted])
  const pending = useMemo(() => sorted.filter((r) => r.status === "Draft"), [sorted])

  const filtered = useMemo(() => {
    const base = activeTab === "available" ? available : pending
    const q = query.trim().toLowerCase()
    if (!q) return base
    return base.filter((report) => {
      const haystack = [
        reportTitle(report),
        report.doctorName,
        report.diagnosis,
        report.cid10,
        report.orderNumber,
      ].filter(Boolean).join(" ").toLowerCase()
      return haystack.includes(q)
    })
  }, [activeTab, available, pending, query])

  if (loading) {
    return <p className={styles.hint}>Carregando laudos...</p>
  }

  if (reports.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}><DocIcon /></div>
        <strong>Nenhum laudo disponível</strong>
        <span>Quando a equipe médica liberar um laudo para você, ele aparecerá aqui.</span>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.intro}>
        <p>
          Aqui você encontra exames e laudos <strong>liberados pela clínica</strong>.
          Documentos em elaboração ficam na aba &quot;Em preparo&quot; até serem publicados.
        </p>
      </div>

      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.search}
          placeholder="Buscar por exame, médico ou CID..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar laudos"
        />
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Laudos">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "available"}
          className={`${styles.tab} ${activeTab === "available" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("available")}
        >
          Liberados
          <span className={styles.tabCount}>{available.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "pending"}
          className={`${styles.tab} ${activeTab === "pending" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("pending")}
        >
          Em preparo
          <span className={styles.tabCount}>{pending.length}</span>
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyTab}>
          <strong>
            {activeTab === "available"
              ? "Nenhum laudo liberado"
              : "Nenhum laudo em preparo"}
          </strong>
          <span>
            {activeTab === "available"
              ? "Laudos finalizados pela equipe médica aparecerão nesta aba."
              : "Quando um laudo estiver sendo elaborado, você verá o status aqui."}
          </span>
        </div>
      ) : (
        <ul className={styles.list}>
          {filtered.map((report) => {
            const readable = isReadable(report)
            return (
              <li key={report.id} className={`${styles.card} ${!readable ? styles.cardPending : ""}`}>
                <div className={styles.cardIcon}><DocIcon /></div>
                <div className={styles.cardBody}>
                  <h3 className={styles.cardTitle}>{reportTitle(report)}</h3>
                  <p className={styles.cardMeta}>
                    <span>{formatDate(report.date)}</span>
                    <span className={styles.dot} aria-hidden>·</span>
                    <span>Dr(a). {report.doctorName || "Equipe médica"}</span>
                  </p>
                  {(report.cid10 || report.orderNumber) && (
                    <p className={styles.cardExtra}>
                      {report.cid10 && <span>CID {report.cid10}</span>}
                      {report.cid10 && report.orderNumber && <span className={styles.dot} aria-hidden>·</span>}
                      {report.orderNumber && <span>Pedido {report.orderNumber}</span>}
                    </p>
                  )}
                  {report.diagnosis && (
                    <p className={styles.cardPreview}>{report.diagnosis}</p>
                  )}
                </div>
                <div className={styles.cardAside}>
                  <Badge>{STATUS_LABEL[report.status]}</Badge>
                  <Button
                    size="sm"
                    variant={readable ? "primary" : "outline"}
                    className={readable ? styles.viewBtn : styles.viewBtnPending}
                    icon={<EyeIcon />}
                    onClick={() => setSelected(report)}
                    title="Visualizar laudo"
                  >
                    Visualizar
                  </Button>
                  {!readable && (
                    <span className={styles.pendingHint}>Aguardando liberação</span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Modal
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? reportTitle(selected) : "Laudo"}
        subtitle={
          selected
            ? `${formatDate(selected.date)} · Dr(a). ${selected.doctorName || "Equipe médica"}`
            : undefined
        }
        size="lg"
        topLayer
        footer={
          <>
            {selected && isReadable(selected) && (
              <Button
                variant="outline"
                className={styles.printBtn}
                onClick={() => window.print()}
              >
                Baixar PDF
              </Button>
            )}
            <Button fullWidth className={styles.closeBtn} variant="outline" onClick={() => setSelected(null)}>
              Fechar
            </Button>
          </>
        }
      >
        {selected && (
          <div className={styles.viewer} id="patient-report-viewer">
            {!isReadable(selected) && (
              <div className={styles.draftNotice} role="status">
                <strong>Laudo em elaboração</strong>
                <span>
                  Este documento ainda não foi liberado pela equipe médica.
                  Você pode acompanhar os dados disponíveis abaixo.
                </span>
              </div>
            )}
            <div className={styles.viewerMeta}>
              <div>
                <span>Situação</span>
                <strong>{STATUS_LABEL[selected.status]}</strong>
              </div>
              <div>
                <span>Data</span>
                <strong>{formatDate(selected.date)}</strong>
              </div>
              <div>
                <span>Médico(a)</span>
                <strong>{selected.doctorName || "Equipe médica"}</strong>
              </div>
              {selected.cid10 && (
                <div>
                  <span>CID-10</span>
                  <strong>{selected.cid10}</strong>
                </div>
              )}
              {selected.orderNumber && (
                <div>
                  <span>Nº do pedido</span>
                  <strong>{selected.orderNumber}</strong>
                </div>
              )}
            </div>

            {selected.diagnosis && (
              <section className={styles.viewerSection}>
                <h4>Diagnóstico</h4>
                <p>{selected.diagnosis}</p>
              </section>
            )}

            <section className={styles.viewerSection}>
              <h4>Conteúdo</h4>
              {(selected.contentHtml || selected.content) ? (
                <RichTextEditor
                  value={selected.contentHtml || selected.content || ""}
                  onChange={() => {}}
                  readOnly
                />
              ) : (
                <p className={styles.viewerEmpty}>Conteúdo não informado.</p>
              )}
            </section>

            {selected.conclusion && (
              <section className={styles.viewerSection}>
                <h4>Conclusão</h4>
                <p>{selected.conclusion}</p>
              </section>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
