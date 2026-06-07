const PRINT_STYLES = `
  @page { margin: 16mm; size: A4; }
  * { box-sizing: border-box; }
  body {
    font-family: "Open Sans", Arial, sans-serif;
    color: #111827;
    background: #ffffff;
    margin: 0;
    padding: 24px;
    font-size: 13px;
    line-height: 1.65;
  }
  [data-report-print] {
    max-width: 720px;
    margin: 0 auto;
    color: #111827;
    background: #ffffff;
  }
  [data-report-print] header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  [data-report-print] p { margin: 0 0 8px; color: #111827; }
  [data-report-print] h3 {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6b7280;
    margin: 16px 0 8px;
  }
  [data-report-print] section { margin-bottom: 16px; }
  [data-report-print] footer { margin-top: 32px; text-align: center; }
  [data-report-print] ul { margin: 8px 0 8px 20px; padding: 0; }
  [data-report-print] li { margin-bottom: 4px; color: #111827; }
  [data-report-print] strong { font-weight: 600; color: #111827; }
  [data-report-print] div[class*="reportRich"] p { margin: 0 0 8px; }
`

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Abre janela limpa só com o laudo — evita PDF em branco do layout da app. */
export function printElement(elementId: string, documentTitle = "Laudo"): void {
  const node = document.getElementById(elementId)
  if (!node) {
    window.print()
    return
  }
  printHtml(node.innerHTML, documentTitle)
}

export function printHtml(html: string, documentTitle = "Laudo"): void {
  const printWindow = window.open("", "_blank", "noopener,noreferrer")
  if (!printWindow) {
    window.print()
    return
  }

  printWindow.document.open()
  printWindow.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(documentTitle)}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>${html}</body>
</html>`)
  printWindow.document.close()

  const triggerPrint = () => {
    printWindow.focus()
    printWindow.addEventListener("afterprint", () => printWindow.close(), { once: true })
    printWindow.print()
    window.setTimeout(() => {
      if (!printWindow.closed) printWindow.close()
    }, 2000)
  }

  if (printWindow.document.readyState === "complete") {
    triggerPrint()
  } else {
    printWindow.onload = triggerPrint
  }
}
