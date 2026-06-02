interface NavItemConfig {
  id: PortalSection
  label: string
  icon: string
}

export const PORTAL_NAV_ITEMS: NavItemConfig[] = [
  { id: "overview", label: "Início", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { id: "find-doctor", label: "Agendar", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { id: "consultations", label: "Consultas", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
  { id: "exams", label: "Exames", icon: "M9 3h6M10 3v5.5L5.5 18a4 4 0 003.5 6h6a4 4 0 003.5-6L14 8.5V3" },
  { id: "reports", label: "Laudos", icon: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8" },
  { id: "prescriptions", label: "Receitas", icon: "M8.5 8.5l7 7M9 3.5a5.5 5.5 0 017.8 7.8l-7 7A5.5 5.5 0 013.2 11.3l7-7z" },
  { id: "billing", label: "Boletos", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { id: "profile", label: "Perfil", icon: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8z M16 11l2 2 4-4" },
]

export const SECTION_META: Record<PortalSection, { title: string; subtitle: string }> = {
  overview: {
    title: "Minha saúde",
    subtitle: "Visão completa do seu acompanhamento na clínica.",
  },
  "find-doctor": {
    title: "Agendar consulta",
    subtitle: "Busque médicos disponíveis e escolha o melhor horário.",
  },
  consultations: {
    title: "Minhas consultas",
    subtitle: "Consultas agendadas, ausências e cancelamentos.",
  },
  exams: {
    title: "Exames e procedimentos",
    subtitle: "Histórico de exames vinculados ao seu cadastro.",
  },
  reports: {
    title: "Laudos",
    subtitle: "Exames e documentos liberados pela equipe médica.",
  },
  prescriptions: {
    title: "Receitas",
    subtitle: "Prescrições emitidas para o seu tratamento.",
  },
  billing: {
    title: "Boletos e pagamentos",
    subtitle: "Cobranças pendentes e comprovantes disponíveis.",
  },
  profile: {
    title: "Meu perfil",
    subtitle: "Dados pessoais, foto e preferências de contato.",
  },
}

export type PortalSection =
  | "overview"
  | "find-doctor"
  | "consultations"
  | "exams"
  | "reports"
  | "prescriptions"
  | "billing"
  | "profile"
