/** Rótulos pt-BR para status Active/Inactive exibidos na UI. */
export function formatRecordStatus(status: string): string {
  if (status === "Active") return "Ativo"
  if (status === "Inactive") return "Inativo"
  return status
}

export const RECORD_STATUS_OPTIONS = [
  { value: "Active", label: "Ativo" },
  { value: "Inactive", label: "Inativo" },
] as const
