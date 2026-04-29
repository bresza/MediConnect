// ─── Templates de laudos médicos pré-definidos ────────────────────
// O médico busca pela patologia e o laudo já vem preenchido.

export interface ReportTemplate {
  id:         string
  name:       string
  specialty:  string
  tags:       string[]
  exam:       string
  cid10:      string
  diagnosis:  string
  conclusion: string
  content:    string
}

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: "has-1", name: "Hipertensão Arterial Sistêmica", specialty: "Cardiologia",
    tags: ["hipertensão","pressão alta","HAS","cardiovascular","pressão"],
    exam: "Laudo Médico — Hipertensão Arterial", cid10: "I10",
    diagnosis: "Hipertensão Arterial Sistêmica (HAS) de grau [GRAU: 1/2/3]. Pressão arterial aferida: [PA mmHg]. Paciente relata [TEMPO] de evolução do quadro.",
    conclusion: "Diagnóstico de HAS confirmado. Indicado controle pressórico com [MEDICAÇÃO], dieta hipossódica e acompanhamento periódico.",
    content: `LAUDO MÉDICO — HIPERTENSÃO ARTERIAL SISTÊMICA\n\nPaciente: [NOME DO PACIENTE] | Data: [DATA]\nMédico: [NOME DO MÉDICO] | CRM: [CRM]\n\n1. QUEIXA PRINCIPAL\nPaciente refere [SINTOMAS: cefaleia, tontura, palpitações].\n\n2. HISTÓRIA CLÍNICA\nPA aferida: [PA] mmHg | FC: [FC] bpm\nHistórico familiar de HAS: [SIM/NÃO]\nMedicações em uso: [MEDICAÇÕES]\n\n3. DIAGNÓSTICO\nHipertensão Arterial Sistêmica — CID: I10\nGrau [1/2/3] — PA sistólica [VALOR] / diastólica [VALOR] mmHg\n\n4. CONDUTA\n- Iniciar/ajustar: [MEDICAÇÃO DOSE]\n- Dieta hipossódica (< 2g sódio/dia)\n- Atividade física aeróbica 30 min/dia, 5x/semana\n- Monitorização domiciliar da PA\n- Retorno em [PRAZO]\n\n5. CONCLUSÃO\nPaciente com HAS em [FASE DO TRATAMENTO]. Prognóstico [BOM/REGULAR] com adesão ao tratamento.`
  },
  {
    id: "dm2-1", name: "Diabetes Mellitus Tipo 2", specialty: "Endocrinologia",
    tags: ["diabetes","DM2","glicemia","açúcar","insulina","endocrinologia"],
    exam: "Laudo Médico — Diabetes Mellitus Tipo 2", cid10: "E11",
    diagnosis: "Diabetes Mellitus Tipo 2. Glicemia de jejum: [VALOR] mg/dL. HbA1c: [VALOR]%. Paciente com [TEMPO] de diagnóstico.",
    conclusion: "DM2 em acompanhamento. Controle glicêmico [ADEQUADO/INADEQUADO]. Ajuste de hipoglicemiante oral e orientações sobre dieta e exercício.",
    content: `LAUDO MÉDICO — DIABETES MELLITUS TIPO 2\n\nPaciente: [NOME DO PACIENTE] | Data: [DATA]\nMédico: [NOME DO MÉDICO] | CRM: [CRM]\n\n1. QUEIXA / MOTIVO\n[SINTOMAS: polidipsia, poliúria, polifagia, perda de peso, fadiga]\n\n2. EXAMES LABORATORIAIS\nGlicemia jejum: [VALOR] mg/dL | Pós-prandial: [VALOR] mg/dL\nHbA1c: [VALOR]% | Creatinina: [VALOR] mg/dL\n\n3. DIAGNÓSTICO\nDiabetes Mellitus Tipo 2 — CID: E11\nGrau de controle: [BOM / MODERADO / RUIM]\n\n4. CONDUTA\n- [MANTER/INICIAR/AJUSTAR]: [MEDICAÇÃO DOSE]\n- Dieta para diabéticos — restrição de carboidratos simples\n- Automonitorização da glicemia [FREQUÊNCIA]\n- Atividade física regular\n- Retorno em [PRAZO] com novos exames\n\n5. CONCLUSÃO\nDM2 em [FASE TRATAMENTO]. Prognóstico favorável com adesão ao tratamento.`
  },
  {
    id: "asma-1", name: "Asma Brônquica", specialty: "Pneumologia",
    tags: ["asma","broncoespasmo","dispneia","chiado","pneumologia","respiratório","inalador"],
    exam: "Laudo Médico — Asma Brônquica", cid10: "J45",
    diagnosis: "Asma brônquica [PERSISTENTE/INTERMITENTE] de grau [LEVE/MODERADO/GRAVE]. Espirometria: VEF1 [VALOR]%.",
    conclusion: "Asma brônquica confirmada. Prescrito [BRONCODILATADOR/CORTICOIDE INALATÓRIO]. Orientado sobre fatores desencadeantes.",
    content: `LAUDO MÉDICO — ASMA BRÔNQUICA\n\nPaciente: [NOME DO PACIENTE] | Data: [DATA]\nMédico: [NOME DO MÉDICO] | CRM: [CRM]\n\n1. QUEIXA PRINCIPAL\nDispneia, sibilância e tosse [PERÍODO: noturna/aos esforços/contínua].\nFrequência das crises: [FREQUÊNCIA]. Fatores desencadeantes: [FATORES]\n\n2. ESPIROMETRIA\nCVF: [VALOR]% | VEF1: [VALOR]% | VEF1/CVF: [VALOR]%\n\n3. DIAGNÓSTICO\nAsma Brônquica — CID: J45\nClassificação: [Intermitente / Persistente Leve / Persistente Moderada / Grave]\n\n4. CONDUTA\n- Broncodilatador resgate: [MEDICAÇÃO]\n- Corticoide inalatório manutenção: [MEDICAÇÃO DOSE]\n- Evitar fatores desencadeantes: [LISTA]\n- Técnica correta do inalador explicada\n- Retorno em [PRAZO]\n\n5. CONCLUSÃO\nAsma sob [BOM/REGULAR/MAU] controle. Aderência ao tratamento essencial.`
  },
  {
    id: "depressao-1", name: "Episódio Depressivo", specialty: "Psiquiatria",
    tags: ["depressão","depressivo","humor","tristeza","psiquiatria","mental","anedonia","ansiedade"],
    exam: "Laudo Médico — Episódio Depressivo", cid10: "F32",
    diagnosis: "Episódio depressivo [LEVE/MODERADO/GRAVE] (CID F32). Humor deprimido, anedonia e [OUTROS SINTOMAS] há [TEMPO].",
    conclusion: "Episódio depressivo confirmado. Iniciado [ANTIDEPRESSIVO]. Acompanhamento psicológico recomendado.",
    content: `LAUDO MÉDICO — EPISÓDIO DEPRESSIVO\n\nPaciente: [NOME DO PACIENTE] | Data: [DATA]\nMédico: [NOME DO MÉDICO] | CRM: [CRM]\n\n1. QUEIXA PRINCIPAL\nHumor deprimido, anedonia e [SINTOMAS] há [TEMPO].\n\n2. AVALIAÇÃO PSIQUIÁTRICA\nHumor: deprimido [LEVE/MODERADO/GRAVE]\nAfeto: embotado/restrito | Pensamento: lentificado\nRisco de suicídio: [BAIXO/MÉDIO/ALTO]\n\n3. DIAGNÓSTICO\nEpisódio Depressivo — CID: F32.[0/1/2]\n\n4. CONDUTA\n- Antidepressivo: [MEDICAÇÃO DOSE]\n- Encaminhar para psicoterapia (TCC)\n- Atividade física regular\n- Monitoramento do risco de suicídio\n- Retorno em [2/4] semanas\n\n5. CONCLUSÃO\nEpisódio depressivo em tratamento. Prognóstico [BOM/RESERVADO].`
  },
  {
    id: "lombalgia-1", name: "Lombalgia Crônica", specialty: "Ortopedia",
    tags: ["lombalgia","dor lombar","coluna","costas","ortopedia","hérnia","ciático","disco"],
    exam: "Laudo Médico — Lombalgia", cid10: "M54.5",
    diagnosis: "Lombalgia crônica inespecífica. Dor lombar com [IRRADIAÇÃO/SEM IRRADIAÇÃO] há [TEMPO]. EVA: [0-10]/10.",
    conclusion: "Lombalgia crônica em tratamento conservador. Fisioterapia e analgesia indicados. Reavaliação em [PRAZO].",
    content: `LAUDO MÉDICO — LOMBALGIA\n\nPaciente: [NOME DO PACIENTE] | Data: [DATA]\nMédico: [NOME DO MÉDICO] | CRM: [CRM]\n\n1. QUEIXA PRINCIPAL\nDor lombar [AGUDA/CRÔNICA] há [TEMPO], EVA [VALOR]/10, [COM/SEM] irradiação para MMII.\n\n2. EXAME FÍSICO\nPostura: [NORMAL/ANTÁLGICA] | Lasègue: [NEGATIVO/POSITIVO em GRAUS]\nAmplitude de movimento: [PRESERVADA/REDUZIDA]\nForça muscular MMII: [PRESERVADA/REDUZIDA]\n\n3. IMAGEM\n[RX/RM] coluna lombar: [ACHADOS]\n\n4. DIAGNÓSTICO\nLombalgia [Aguda/Crônica] — CID: M54.5\n[Associada a: hérnia L[N]-L[N] / espondiloartrose / protrusão]\n\n5. CONDUTA\n- Analgésico: [MEDICAÇÃO DOSE]\n- Anti-inflamatório: [MEDICAÇÃO] por [DIAS]\n- Fisioterapia: [TIPO] — [FREQUÊNCIA]\n- Retorno em [PRAZO]\n\n6. CONCLUSÃO\nLombalgia em tratamento conservador. [EVOLUÇÃO FAVORÁVEL / AGUARDANDO RESPOSTA].`
  },
  {
    id: "hipotireoidismo-1", name: "Hipotireoidismo", specialty: "Endocrinologia",
    tags: ["hipotireoidismo","tireoide","TSH","T4","fadiga","tireóide","hashimoto"],
    exam: "Laudo Médico — Hipotireoidismo", cid10: "E03",
    diagnosis: "Hipotireoidismo [PRIMÁRIO/SUBCLÍNICO]. TSH: [VALOR] μUI/mL. T4 livre: [VALOR] ng/dL.",
    conclusion: "Hipotireoidismo confirmado. Iniciada levotiroxina [DOSE] μg/dia. Retorno em 6-8 semanas com TSH.",
    content: `LAUDO MÉDICO — HIPOTIREOIDISMO\n\nPaciente: [NOME DO PACIENTE] | Data: [DATA]\nMédico: [NOME DO MÉDICO] | CRM: [CRM]\n\n1. QUEIXA PRINCIPAL\n[SINTOMAS: fadiga, ganho de peso, frio, constipação, queda de cabelo]\n\n2. EXAMES\nTSH: [VALOR] μUI/mL (VR: 0,4–4,0)\nT4 livre: [VALOR] ng/dL (VR: 0,8–1,8)\nAnti-TPO: [VALOR/NEGATIVO]\n\n3. DIAGNÓSTICO\nHipotireoidismo [Primário / Subclínico] — CID: E03\nEtiologia: [Hashimoto / Iatrogênico / Idiopático]\n\n4. CONDUTA\n- Levotiroxina [DOSE] μg/dia em jejum 30 min antes do café\n- Retorno em 6–8 semanas com TSH e T4 livre\n- Evitar cálcio/ferro próximo ao horário da medicação\n\n5. CONCLUSÃO\nHipotireoidismo em tratamento. TSH-alvo: 0,5–2,5 μUI/mL.`
  },
  {
    id: "itu-1", name: "Infecção Urinária (ITU)", specialty: "Clínica Geral",
    tags: ["itu","infecção urinária","cistite","urina","disúria","bexiga","urinária"],
    exam: "Laudo Médico — ITU", cid10: "N39.0",
    diagnosis: "ITU [BAIXA/ALTA]. Paciente com disúria, polaciúria e [OUTROS SINTOMAS]. EAS com [ACHADOS].",
    conclusion: "ITU confirmada. Prescrito [ANTIBIÓTICO] por [DIAS]. Retorno se não houver melhora em 48-72h.",
    content: `LAUDO MÉDICO — INFECÇÃO DO TRATO URINÁRIO\n\nPaciente: [NOME DO PACIENTE] | Data: [DATA]\nMédico: [NOME DO MÉDICO] | CRM: [CRM]\n\n1. QUEIXA PRINCIPAL\nDisúria, polaciúria e [URGÊNCIA/HEMATÚRIA] há [TEMPO].\n\n2. EXAME FÍSICO\nPuño-percussão: [NEG/POS] | Temperatura: [VALOR]°C\nDor suprapúbica: [SIM/NÃO]\n\n3. EXAMES\nEAS: [ACHADOS: leucocitúria, nitrito, hematúria]\nUrocultura: [COLETADA / RESULTADO]\n\n4. DIAGNÓSTICO\nITU [Baixa — Cistite / Alta — Pielonefrite] — CID: N39.0\n\n5. CONDUTA\n- [ANTIBIÓTICO] [DOSE] por [DIAS]\n- Analgésico/Antiespasmódico: [MEDICAÇÃO]\n- Hidratação oral aumentada\n- Retorno se febre > 38°C ou sem melhora em 48–72h\n\n6. CONCLUSÃO\nITU em tratamento. Prognóstico favorável com antibioticoterapia.`
  },
  {
    id: "atestado-1", name: "Atestado Médico — Afastamento", specialty: "Clínica Geral",
    tags: ["atestado","afastamento","trabalho","licença","repouso","declaração"],
    exam: "Atestado Médico", cid10: "",
    diagnosis: "Paciente necessita de afastamento de atividades laborais pelo período indicado.",
    conclusion: "Atestado fornecido conforme avaliação clínica realizada nesta data.",
    content: `ATESTADO MÉDICO\n\nAtesto que o(a) paciente [NOME DO PACIENTE], CPF [CPF], esteve sob minha avaliação clínica nesta data e, em razão de [DIAGNÓSTICO / CID: CÓDIGO], necessita de afastamento das atividades [LABORAIS/ESCOLARES/FÍSICAS] pelo período de [NÚMERO] ([POR EXTENSO]) dias, a contar de [DATA INICIAL].\n\n[CIDADE], [DATA]\n\n_______________________________________\n[NOME DO MÉDICO] | CRM: [NÚMERO]–[UF] | [ESPECIALIDADE]`
  },
  {
    id: "declaracao-1", name: "Declaração de Comparecimento", specialty: "Clínica Geral",
    tags: ["declaração","comparecimento","consulta","presença","atendimento"],
    exam: "Declaração de Comparecimento", cid10: "",
    diagnosis: "Paciente compareceu a consulta médica na data indicada.",
    conclusion: "Declaração fornecida a pedido do(a) paciente.",
    content: `DECLARAÇÃO DE COMPARECIMENTO\n\nDeclaro que o(a) paciente [NOME DO PACIENTE], CPF [CPF], compareceu a consulta médica nesta clínica no dia [DATA] às [HORÁRIO], permanecendo por aproximadamente [DURAÇÃO].\n\n[CIDADE], [DATA]\n\n_______________________________________\n[NOME DO MÉDICO] | CRM: [NÚMERO]–[UF]`
  },
  {
    id: "solexame-1", name: "Solicitação de Exames", specialty: "Clínica Geral",
    tags: ["exame","solicitação","pedido","laboratório","hemograma","sangue","exames"],
    exam: "Solicitação de Exames Complementares", cid10: "",
    diagnosis: "Solicitação de exames para investigação diagnóstica.",
    conclusion: "Exames solicitados conforme avaliação clínica.",
    content: `SOLICITAÇÃO DE EXAMES COMPLEMENTARES\n\nPaciente: [NOME DO PACIENTE] | CPF: [CPF] | Data: [DATA]\n\nLABORATORIAIS:\n[ ] Hemograma completo\n[ ] Glicemia de jejum\n[ ] HbA1c\n[ ] Colesterol total e frações\n[ ] Triglicerídeos\n[ ] TSH e T4 livre\n[ ] Creatinina e Ureia\n[ ] TGO / TGP\n[ ] Ácido úrico\n[ ] Urina rotina (EAS)\n[ ] Outros: _________________\n\nIMAGEM:\n[ ] Raio-X de [REGIÃO]\n[ ] Ultrassonografia de [REGIÃO]\n[ ] Eletrocardiograma (ECG)\n[ ] Outros: _________________\n\nINDICAÇÃO CLÍNICA: [HIPÓTESE DIAGNÓSTICA / CID]\n\n_______________________________________\n[NOME DO MÉDICO] | CRM: [NÚMERO]–[UF]`
  },
]

export const TEMPLATE_SPECIALTIES = [
  ...new Set(REPORT_TEMPLATES.map((t) => t.specialty)),
].sort()
