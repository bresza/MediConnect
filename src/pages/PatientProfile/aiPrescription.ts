import type { Patient, PrescriptionType } from "../../types"

type PrescriptionDraftMedication = {
  name: string
  concentration: string
  form: string
  quantity: string
  posology: string
  duration: string
  instructions: string
}

export interface AiPrescriptionResult {
  type: PrescriptionType
  cid10?: string
  observations: string
  medications: PrescriptionDraftMedication[]
}

export async function aiCompletePrescription(
  patient: Patient,
  clinicalContext: string,
  currentCid10: string,
): Promise<AiPrescriptionResult> {
  await new Promise((resolve) => setTimeout(resolve, 300))

  const source = [
    clinicalContext,
    currentCid10,
    patient.observations,
    patient.healthInsurance,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  if (source.includes("i10") || source.includes("hipertens")) {
    return {
      type: "simple",
      cid10: currentCid10 || "I10",
      observations:
        "Rascunho gerado por IA para revisão médica. Orientar aferição pressórica e retorno conforme evolução.",
      medications: [
        {
          name: "Losartana Potássica",
          concentration: "50mg",
          form: "Comprimido",
          quantity: "30 comprimidos",
          posology: "Tomar 1 comprimido uma vez ao dia (manhã)",
          duration: "30 dias",
          instructions: "Reavaliar pressão arterial e função renal conforme critério médico.",
        },
      ],
    }
  }

  if (source.includes("e11") || source.includes("diabet")) {
    return {
      type: "simple",
      cid10: currentCid10 || "E11",
      observations:
        "Rascunho gerado por IA para revisão médica. Reforçar dieta, hidratação e monitorização glicêmica.",
      medications: [
        {
          name: "Metformina",
          concentration: "500mg",
          form: "Comprimido",
          quantity: "60 comprimidos",
          posology: "Tomar 1 comprimido duas vezes ao dia",
          duration: "30 dias",
          instructions: "Tomar após as refeições.",
        },
      ],
    }
  }

  if (
    source.includes("j") ||
    source.includes("tosse") ||
    source.includes("resfri") ||
    source.includes("febre")
  ) {
    return {
      type: "simple",
      cid10: currentCid10 || "J06.9",
      observations:
        "Rascunho gerado por IA para revisão médica. Orientar hidratação, repouso e retorno se sinais de alarme.",
      medications: [
        {
          name: "Paracetamol",
          concentration: "750mg",
          form: "Comprimido",
          quantity: "12 comprimidos",
          posology: "Tomar 1 comprimido a cada 8 horas",
          duration: "3 dias",
          instructions: "Usar se dor ou febre.",
        },
        {
          name: "Loratadina",
          concentration: "10mg",
          form: "Comprimido",
          quantity: "10 comprimidos",
          posology: "Tomar 1 comprimido uma vez ao dia (manhã)",
          duration: "10 dias",
          instructions: "Usar se sintomas alérgicos ou coriza.",
        },
      ],
    }
  }

  if (source.includes("dor") || source.includes("m54") || source.includes("lomb")) {
    return {
      type: "simple",
      cid10: currentCid10 || "M54.5",
      observations:
        "Rascunho gerado por IA para revisão médica. Orientar repouso relativo e reavaliação se piora ou déficit neurológico.",
      medications: [
        {
          name: "Ibuprofeno",
          concentration: "400mg",
          form: "Comprimido",
          quantity: "15 comprimidos",
          posology: "Tomar 1 comprimido a cada 8 horas",
          duration: "5 dias",
          instructions: "Tomar após as refeições.",
        },
      ],
    }
  }

  return {
    type: "simple",
    cid10: currentCid10 || undefined,
    observations:
      "Rascunho gerado por IA para revisão médica. Ajustar medicamentos, dose e duração conforme avaliação clínica.",
    medications: [
      {
        name: "Paracetamol",
        concentration: "500mg",
        form: "Comprimido",
        quantity: "12 comprimidos",
        posology: "Tomar 1 comprimido a cada 8 horas",
        duration: "3 dias",
        instructions: "Usar se dor ou febre.",
      },
    ],
  }
}
