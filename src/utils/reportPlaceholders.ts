export interface ReportPlaceholderContext {
  patientName: string
  doctorName: string
  date: string
  crm: string
  cpf?: string
}

/** Substitui placeholders conhecidos e marca os demais para preenchimento manual. */
export function fillReportTemplate(text: string, ctx: ReportPlaceholderContext): string {
  let result = text
    .replace(/\[NOME DO PACIENTE\]/gi, ctx.patientName)
    .replace(/\[NOME DO MÉDICO\]/gi, ctx.doctorName)
    .replace(/\[NOME DO MEDICO\]/gi, ctx.doctorName)
    .replace(/\[DATA\]/gi, ctx.date)
    .replace(/\[DATA INICIAL\]/gi, ctx.date)
    .replace(/\[CRM\]/gi, ctx.crm)
    .replace(/\[CPF\]/gi, ctx.cpf || "(CPF do paciente)")
    .replace(/\[CIDADE\]/gi, "Aracaju")
    .replace(/\[NÚMERO\]/gi, "(quantidade de dias)")
    .replace(/\[NUMERO\]/gi, "(quantidade de dias)")

  result = result.replace(/\[([^\]]+)\]/g, (match, inner: string) => {
    if (inner.includes("/")) return match
    return "(a preencher)"
  })

  return result
}
