import { useState } from "react"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Button } from "../../components/ui/Button/Button"
import { formatDate } from "../../utils"
import { PrescriptionEditor } from "./PrescriptionEditor"
import type { PageId, Patient, MedicalRecord, Appointment, Prescription, User } from "../../types"
import styles from "./PatientProfile.module.css"

interface PatientProfileProps {
  patient: Patient
  records: MedicalRecord[]
  appointments: Appointment[]
  prescriptions: Prescription[]
  currentUser: User
  onNavigate: (page: PageId) => void
  onEditPatient: (p: Patient) => void
  onViewRecords: (p: Patient) => void
  onAddPrescription: (p: Prescription) => void
}

type Tab = "overview" | "personal" | "medical" | "records" | "prescriptions"

const TABS: { id: Tab; label: string }[] = [
  { id: "overview",      label: "Resumo"          },
  { id: "personal",      label: "Dados Pessoais"  },
  { id: "medical",       label: "Histórico Médico" },
  { id: "records",       label: "Prontuários"     },
  { id: "prescriptions", label: "Receitas"        },
]

const GENDER_MAP: Record<string, string> = { Male: "Masculino", Female: "Feminino", Other: "Outro" }
const MARITAL_MAP: Record<string, string> = {
  Single: "Solteiro(a)", Married: "Casado(a)", Divorced: "Divorciado(a)",
  Widowed: "Viúvo(a)", StableUnion: "União estável",
}
const CHANNEL_MAP: Record<string, string> = {
  WhatsApp: "WhatsApp", Email: "E-mail", SMS: "SMS", Phone: "Telefone",
}
const RX_TYPE_MAP: Record<string, string> = {
  simple: "Simples", special: "Controle Especial", antimicrobial: "Antimicrobiana",
}
const APPT_STATUS_COLOR: Record<string, string> = {
  confirmed: "#059669", completed: "#059669", scheduled: "#2563eb",
  cancelled: "#dc2626", absent: "#dc2626", blocked: "#6b7280", pending: "#d97706",
}

function calcAge(dob: string) {
  const d = new Date(dob), t = new Date()
  let a = t.getFullYear() - d.getFullYear()
  if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--
  return a
}

// ── Small components ───────────────────────────────────────────────
function InfoItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className={styles.infoItem}>
      <dt className={styles.infoLabel}>{label}</dt>
      <dd className={styles.infoValue}>{value || "—"}</dd>
    </div>
  )
}

function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionCardHeader}>
        <h3 className={styles.sectionCardTitle}>{title}</h3>
        {action}
      </div>
      <div className={styles.sectionCardBody}>{children}</div>
    </div>
  )
}

function Chip({ children, color = "neutral" }: { children: React.ReactNode; color?: "red" | "amber" | "blue" | "green" | "neutral" }) {
  return <span className={`${styles.chip} ${styles[`chip${color.charAt(0).toUpperCase() + color.slice(1)}`]}`}>{children}</span>
}

function VitalCard({ label, value, unit, ref: refRange }: { label: string; value?: string | number | null; unit: string; ref?: string }) {
  if (!value) return null
  return (
    <div className={styles.vitalCard}>
      <span className={styles.vitalLabel}>{label}</span>
      <div className={styles.vitalValueRow}>
        <span className={styles.vitalValue}>{value}</span>
        <span className={styles.vitalUnit}>{unit}</span>
      </div>
      {refRange && <span className={styles.vitalRef}>{refRange}</span>}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────
export function PatientProfile({
  patient, records, appointments, prescriptions, currentUser,
  onNavigate, onEditPatient, onViewRecords, onAddPrescription,
}: PatientProfileProps) {
  const [tab, setTab]               = useState<Tab>("overview")
  const [prescribing, setPrescribing] = useState(false)

  const isDoctor = currentUser.role === "doctor"
  const age = calcAge(patient.dob)

  const patientRecords = records
    .filter(r => r.patientId === patient.id)
    .sort((a, b) => b.date.localeCompare(a.date))

  const patientAppts = appointments
    .filter(a => a.patientId === patient.id)
    .sort((a, b) => b.date.localeCompare(a.date))

  const patientRx = prescriptions
    .filter(p => p.patientId === patient.id)
    .sort((a, b) => b.date.localeCompare(a.date))

  const latestRecord  = patientRecords[0]
  const nextAppt      = patientAppts.find(a => a.date >= new Date().toISOString().split("T")[0])
  const recentAppts   = patientAppts.slice(0, 5)

  if (prescribing) {
    return (
      <PrescriptionEditor
        patient={patient}
        currentUser={currentUser}
        onClose={() => setPrescribing(false)}
        onSave={p => { onAddPrescription(p); setPrescribing(false) }}
      />
    )
  }

  return (
    <div className={styles.page}>

      {/* ── HERO HEADER ─────────────────────────────────────────── */}
      <div className={styles.hero}>
        <div className={styles.heroInner}>

          {/* Back button */}
          <button className={styles.heroBack} onClick={() => onNavigate("patients")}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5"
              viewBox="0 0 24 24" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
            Voltar
          </button>

          {/* Patient identity */}
          <div className={styles.heroIdentity}>
            <div className={styles.heroPhotoWrap}>
              {patient.photoUrl
                ? <img src={patient.photoUrl} alt={patient.name} className={styles.heroPhoto} />
                : <Avatar name={patient.name} size="xl" />
              }
              {patient.isVip && <span className={styles.heroVip} title="VIP">★</span>}
            </div>

            <div className={styles.heroInfo}>
              <div className={styles.heroNameRow}>
                <h1 className={styles.heroName}>{patient.name}</h1>
                {patient.socialName && (
                  <span className={styles.heroSocialName}>"{patient.socialName}"</span>
                )}
              </div>
              <p className={styles.heroDemographic}>
                {GENDER_MAP[patient.gender] ?? patient.gender} · {age} anos · {patient.dob ? formatDate(patient.dob) : "—"}
                {patient.occupation ? ` · ${patient.occupation}` : ""}
              </p>
              <p className={styles.heroInsurance}>
                {patient.healthInsurance ?? "Particular"}
                {patient.healthInsuranceNumber ? ` · Nº ${patient.healthInsuranceNumber}` : ""}
                {" · "} CPF: {patient.cpf}
              </p>
              <div className={styles.heroBadges}>
                <span className={`${styles.statusBadge} ${patient.status === "Active" ? styles.statusActive : styles.statusInactive}`}>
                  {patient.status === "Active" ? "Ativo" : "Inativo"}
                </span>
                {patient.preferredChannel && (
                  <span className={styles.channelBadge}>{CHANNEL_MAP[patient.preferredChannel]}</span>
                )}
                {patient.isVip && <span className={styles.vipBadge}>VIP</span>}
              </div>
            </div>
          </div>

          {/* Stat bar */}
          <div className={styles.heroStats}>
            <div className={styles.heroStat}>
              <span className={styles.heroStatValue}>{patientAppts.length}</span>
              <span className={styles.heroStatLabel}>Consultas</span>
            </div>
            <div className={styles.heroStatDiv} />
            <div className={styles.heroStat}>
              <span className={styles.heroStatValue}>{patientRecords.length}</span>
              <span className={styles.heroStatLabel}>Prontuários</span>
            </div>
            <div className={styles.heroStatDiv} />
            <div className={styles.heroStat}>
              <span className={styles.heroStatValue}>{patientRx.length}</span>
              <span className={styles.heroStatLabel}>Receitas</span>
            </div>
            <div className={styles.heroStatDiv} />
            <div className={styles.heroStat}>
              {patient.behaviorScore != null ? (
                <>
                  <span className={styles.heroStatValue} style={{
                    color: patient.behaviorScore >= 70 ? "#4ade80"
                      : patient.behaviorScore >= 40 ? "#fbbf24" : "#f87171"
                  }}>{patient.behaviorScore}</span>
                  <span className={styles.heroStatLabel}>Score</span>
                </>
              ) : (
                <>
                  <span className={styles.heroStatValue}>—</span>
                  <span className={styles.heroStatLabel}>Score</span>
                </>
              )}
            </div>
            <div className={styles.heroStatDiv} />
            <div className={styles.heroStat}>
              <span className={styles.heroStatValue}>
                {patient.lastVisit ? formatDate(patient.lastVisit) : "—"}
              </span>
              <span className={styles.heroStatLabel}>Última visita</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className={styles.heroActions}>
            {isDoctor && (
              <button className={styles.heroActionPrimary} onClick={() => setPrescribing(true)}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"
                  viewBox="0 0 24 24" strokeLinecap="round">
                  <path d="M9 12h6M12 9v6M12 2a10 10 0 100 20A10 10 0 0012 2z" />
                </svg>
                Nova receita
              </button>
            )}
            <button className={styles.heroActionSecondary} onClick={() => onEditPatient(patient)}>
              Editar cadastro
            </button>
          </div>
        </div>
      </div>

      {/* ── TAB BAR ─────────────────────────────────────────────── */}
      <div className={styles.tabBar}>
        <div className={styles.tabBarInner}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`${styles.tabBtn} ${tab === t.id ? styles.tabBtnActive : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === "records"       && patientRecords.length > 0 && <span className={styles.tabCount}>{patientRecords.length}</span>}
              {t.id === "prescriptions" && patientRx.length > 0      && <span className={styles.tabCount}>{patientRx.length}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTENT ─────────────────────────────────────────────── */}
      <div className={styles.content}>

        {/* ══ RESUMO ═══════════════════════════════════════════════ */}
        {tab === "overview" && (
          <div className={styles.overviewGrid}>

            {/* Left column */}
            <div className={styles.overviewLeft}>

              {/* Medical alerts */}
              {(latestRecord?.allergies || latestRecord?.medications) && (
                <div className={styles.alertCard}>
                  <div className={styles.alertCardHeader}>
                    <svg width="16" height="16" fill="none" stroke="#dc2626" strokeWidth="2"
                      viewBox="0 0 24 24" strokeLinecap="round">
                      <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    <span className={styles.alertCardTitle}>Alertas clínicos</span>
                    <span className={styles.alertCardSub}>Baseado no último prontuário</span>
                  </div>
                  {latestRecord.allergies && (
                    <div className={styles.alertRow}>
                      <span className={styles.alertRowLabel}>Alergias</span>
                      <div className={styles.chipRow}>
                        {latestRecord.allergies.split(/[,;]+/).map(a => a.trim()).filter(Boolean).map(a => (
                          <Chip key={a} color="red">{a}</Chip>
                        ))}
                      </div>
                    </div>
                  )}
                  {latestRecord.medications && (
                    <div className={styles.alertRow}>
                      <span className={styles.alertRowLabel}>Medicamentos em uso</span>
                      <div className={styles.chipRow}>
                        {latestRecord.medications.split(/[,;]+/).map(m => m.trim()).filter(Boolean).map(m => (
                          <Chip key={m} color="blue">{m}</Chip>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Next appointment */}
              {nextAppt ? (
                <SectionCard title="Próxima consulta">
                  <div className={styles.nextAppt}>
                    <div className={styles.nextApptDateBox}>
                      <span className={styles.nextApptMonth}>
                        {new Date(nextAppt.date + "T00:00:00").toLocaleString("pt-BR", { month: "short" }).toUpperCase()}
                      </span>
                      <span className={styles.nextApptDay}>
                        {new Date(nextAppt.date + "T00:00:00").getDate()}
                      </span>
                    </div>
                    <div className={styles.nextApptInfo}>
                      <p className={styles.nextApptDoctor}>{nextAppt.doctorName}</p>
                      <p className={styles.nextApptMeta}>{nextAppt.time} · {nextAppt.type}</p>
                    </div>
                    <span
                      className={styles.nextApptStatus}
                      style={{ color: APPT_STATUS_COLOR[nextAppt.status] ?? "#6b7280" }}
                    >
                      {nextAppt.status}
                    </span>
                  </div>
                </SectionCard>
              ) : (
                <SectionCard title="Próxima consulta">
                  <p className={styles.empty}>Nenhuma consulta agendada.</p>
                </SectionCard>
              )}

              {/* Recent appointments */}
              <SectionCard
                title="Últimas consultas"
                action={<button className={styles.cardLink} onClick={() => setTab("records")}>Ver prontuários</button>}
              >
                {recentAppts.length === 0 ? (
                  <p className={styles.empty}>Sem histórico de consultas.</p>
                ) : (
                  <div className={styles.apptList}>
                    {recentAppts.map((a, i) => (
                      <div key={a.id} className={`${styles.apptRow} ${i === recentAppts.length - 1 ? styles.apptRowLast : ""}`}>
                        <span className={styles.apptDate}>{formatDate(a.date)}</span>
                        <div className={styles.apptInfo}>
                          <p className={styles.apptDoctor}>{a.doctorName}</p>
                          <p className={styles.apptType}>{a.type}</p>
                        </div>
                        <span
                          className={styles.apptDot}
                          style={{ background: APPT_STATUS_COLOR[a.status] ?? "#6b7280" }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

            {/* Right column */}
            <div className={styles.overviewRight}>

              {/* Vital signs */}
              <SectionCard
                title="Sinais vitais"
                action={latestRecord
                  ? <span className={styles.cardSub}>{formatDate(latestRecord.date)}</span>
                  : undefined
                }
              >
                {latestRecord?.vitalSigns ? (
                  <div className={styles.vitalsGrid}>
                    <VitalCard label="Pressão Arterial" value={latestRecord.vitalSigns.bloodPressure} unit="mmHg" ref="<120/80" />
                    <VitalCard label="Freq. Cardíaca"   value={latestRecord.vitalSigns.heartRate}     unit="bpm"  ref="60–100" />
                    <VitalCard label="Temperatura"      value={latestRecord.vitalSigns.temperature}   unit="°C"   ref="36–37,5" />
                    <VitalCard label="Peso"             value={latestRecord.vitalSigns.weight}        unit="kg" />
                    <VitalCard label="Altura"           value={latestRecord.vitalSigns.height}        unit="cm" />
                    <VitalCard label="SpO₂"             value={latestRecord.vitalSigns.oxygenSaturation} unit="%" ref=">95%" />
                  </div>
                ) : (
                  <p className={styles.empty}>Sinais vitais não registrados.</p>
                )}
              </SectionCard>

              {/* Quick contact */}
              <SectionCard title="Contato">
                <dl className={styles.contactDl}>
                  <InfoItem label="Celular"    value={patient.phone} />
                  <InfoItem label="E-mail"     value={patient.email} />
                  {patient.emergencyContact && (
                    <InfoItem
                      label="Emergência"
                      value={`${patient.emergencyContact.name} · ${patient.emergencyContact.phone}`}
                    />
                  )}
                  {patient.address && (
                    <InfoItem
                      label="Endereço"
                      value={`${patient.address.street}, ${patient.address.number} — ${patient.address.city}/${patient.address.state}`}
                    />
                  )}
                </dl>
              </SectionCard>

              {/* Score card */}
              {patient.behaviorScore != null && (
                <SectionCard title="Score de comportamento">
                  <div className={styles.scoreRow}>
                    <div className={styles.scoreGauge}>
                      <span
                        className={styles.scoreNum}
                        style={{
                          color: patient.behaviorScore >= 70 ? "#059669"
                            : patient.behaviorScore >= 40 ? "#d97706" : "#dc2626"
                        }}
                      >{patient.behaviorScore}</span>
                      <span className={styles.scoreOf}>/100</span>
                    </div>
                    <div className={styles.scoreBarWrap}>
                      <div className={styles.scoreBarTrack}>
                        <div
                          className={styles.scoreBarFill}
                          style={{
                            width: `${patient.behaviorScore}%`,
                            background: patient.behaviorScore >= 70 ? "#059669"
                              : patient.behaviorScore >= 40 ? "#d97706" : "#dc2626",
                          }}
                        />
                      </div>
                      <p className={styles.scoreDesc}>
                        {patient.behaviorScore >= 70
                          ? "Excelente índice de comparecimento e engajamento."
                          : patient.behaviorScore >= 40
                          ? "Histórico de comparecimento regular."
                          : "Baixo índice de presença nas consultas."}
                      </p>
                    </div>
                  </div>
                </SectionCard>
              )}
            </div>
          </div>
        )}

        {/* ══ DADOS PESSOAIS ═══════════════════════════════════════ */}
        {tab === "personal" && (
          <div className={styles.personalGrid}>
            <SectionCard title="Identificação">
              <dl className={styles.infoGrid}>
                <InfoItem label="Nome completo"      value={patient.name} />
                <InfoItem label="Nome social"        value={patient.socialName} />
                <InfoItem label="CPF"                value={patient.cpf} />
                <InfoItem label="RG"                 value={patient.rg} />
                <InfoItem label="Sexo"               value={GENDER_MAP[patient.gender]} />
                <InfoItem label="Data de nascimento" value={patient.dob ? formatDate(patient.dob) : undefined} />
                <InfoItem label="Idade"              value={`${age} anos`} />
                <InfoItem label="Estado civil"       value={patient.maritalStatus ? MARITAL_MAP[patient.maritalStatus] : undefined} />
                <InfoItem label="Profissão"          value={patient.occupation} />
                <InfoItem label="Naturalidade"       value={patient.birthplace} />
                <InfoItem label="Nacionalidade"      value={patient.nationality} />
                <InfoItem label="Etnia"              value={patient.ethnicity} />
              </dl>
            </SectionCard>

            <SectionCard title="Contato">
              <dl className={styles.infoGrid}>
                <InfoItem label="Celular"                value={patient.phone} />
                <InfoItem label="E-mail"                 value={patient.email} />
                <InfoItem label="Telefone fixo"          value={patient.landline} />
                <InfoItem label="Telefone alternativo"   value={patient.alternativePhone} />
                <InfoItem label="Canal preferido"        value={patient.preferredChannel ? CHANNEL_MAP[patient.preferredChannel] : undefined} />
              </dl>
              {patient.emergencyContact && (
                <>
                  <div className={styles.subSectionTitle}>Contato de emergência</div>
                  <dl className={styles.infoGrid}>
                    <InfoItem label="Nome"       value={patient.emergencyContact.name} />
                    <InfoItem label="Parentesco" value={patient.emergencyContact.relationship} />
                    <InfoItem label="Telefone"   value={patient.emergencyContact.phone} />
                  </dl>
                </>
              )}
            </SectionCard>

            <SectionCard title="Convênio">
              <dl className={styles.infoGrid}>
                <InfoItem label="Operadora" value={patient.healthInsurance ?? "Particular"} />
                <InfoItem label="Número"    value={patient.healthInsuranceNumber} />
                <InfoItem label="Código legado" value={patient.legacyCode} />
              </dl>
            </SectionCard>

            {patient.address && (
              <SectionCard title="Endereço">
                <dl className={styles.infoGrid}>
                  <InfoItem label="CEP"        value={patient.address.zipCode} />
                  <InfoItem label="Logradouro" value={`${patient.address.street}, ${patient.address.number}${patient.address.complement ? ` — ${patient.address.complement}` : ""}`} />
                  <InfoItem label="Bairro"     value={patient.address.neighborhood} />
                  <InfoItem label="Cidade"     value={patient.address.city} />
                  <InfoItem label="Estado"     value={patient.address.state} />
                  <InfoItem label="Referência" value={patient.address.reference} />
                </dl>
              </SectionCard>
            )}

            {(patient.motherName || patient.fatherName || patient.guardianName || patient.spouseName) && (
              <SectionCard title="Filiação e família">
                <dl className={styles.infoGrid}>
                  <InfoItem label="Mãe"              value={patient.motherName} />
                  <InfoItem label="Profissão da mãe" value={patient.motherOccupation} />
                  <InfoItem label="Pai"              value={patient.fatherName} />
                  <InfoItem label="Profissão do pai" value={patient.fatherOccupation} />
                  <InfoItem label="Responsável"      value={patient.guardianName} />
                  <InfoItem label="CPF do responsável" value={patient.guardianCpf} />
                  <InfoItem label="Cônjuge"          value={patient.spouseName} />
                </dl>
              </SectionCard>
            )}

            {patient.observations && (
              <SectionCard title="Observações">
                <p className={styles.obsText}>{patient.observations}</p>
              </SectionCard>
            )}
          </div>
        )}

        {/* ══ HISTÓRICO MÉDICO ═════════════════════════════════════ */}
        {tab === "medical" && (
          !latestRecord ? (
            <div className={styles.emptyState}>
              <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ color: "var(--muted-foreground)", marginBottom: 12 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className={styles.emptyStateTitle}>Nenhum prontuário encontrado</p>
              <p className={styles.emptyStateSub}>O histórico médico será exibido após o primeiro atendimento.</p>
            </div>
          ) : (
            <div className={styles.medicalGrid}>
              <div className={styles.medicalBanner}>
                <div>
                  <p className={styles.medicalBannerLabel}>Referência: último atendimento</p>
                  <p className={styles.medicalBannerDate}>{formatDate(latestRecord.date)} · {latestRecord.doctorName}</p>
                </div>
                <button className={styles.cardLink} onClick={() => setTab("records")}>Ver todos os prontuários</button>
              </div>

              <div className={styles.medicalCols}>
                <div className={styles.medicalLeft}>
                  <SectionCard title="Anamnese">
                    <dl className={styles.infoList}>
                      <InfoItem label="Queixa principal"   value={latestRecord.chiefComplaint} />
                      <InfoItem label="Histórico atual"    value={latestRecord.currentHistory} />
                      <InfoItem label="Hist. pessoal"      value={latestRecord.personalHistory} />
                      <InfoItem label="Hist. familiar"     value={latestRecord.familyHistory} />
                    </dl>
                  </SectionCard>

                  <SectionCard title="Alergias e medicamentos">
                    {latestRecord.allergies ? (
                      <div className={styles.medSection}>
                        <span className={styles.medSectionLabel}>Alergias</span>
                        <div className={styles.chipRow}>
                          {latestRecord.allergies.split(/[,;]+/).map(a => a.trim()).filter(Boolean).map(a => (
                            <Chip key={a} color="red">{a}</Chip>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {latestRecord.medications ? (
                      <div className={styles.medSection}>
                        <span className={styles.medSectionLabel}>Medicamentos em uso</span>
                        <div className={styles.chipRow}>
                          {latestRecord.medications.split(/[,;]+/).map(m => m.trim()).filter(Boolean).map(m => (
                            <Chip key={m} color="blue">{m}</Chip>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {!latestRecord.allergies && !latestRecord.medications && (
                      <p className={styles.empty}>Sem alergias ou medicamentos registrados.</p>
                    )}
                  </SectionCard>

                  {latestRecord.physicalExam && (
                    <SectionCard title="Exame físico">
                      <p className={styles.obsText}>{latestRecord.physicalExam}</p>
                    </SectionCard>
                  )}
                </div>

                <div className={styles.medicalRight}>
                  {latestRecord.vitalSigns && (
                    <SectionCard title="Sinais vitais">
                      <div className={styles.vitalsGrid}>
                        <VitalCard label="Pressão Arterial" value={latestRecord.vitalSigns.bloodPressure} unit="mmHg" ref="<120/80" />
                        <VitalCard label="Freq. Cardíaca"   value={latestRecord.vitalSigns.heartRate}     unit="bpm"  ref="60–100" />
                        <VitalCard label="Temperatura"      value={latestRecord.vitalSigns.temperature}   unit="°C"   ref="36–37,5" />
                        <VitalCard label="Peso"             value={latestRecord.vitalSigns.weight}        unit="kg" />
                        <VitalCard label="Altura"           value={latestRecord.vitalSigns.height}        unit="cm" />
                        <VitalCard label="SpO₂"             value={latestRecord.vitalSigns.oxygenSaturation} unit="%" ref=">95%" />
                      </div>
                    </SectionCard>
                  )}

                  <SectionCard title="Diagnóstico e conduta">
                    <dl className={styles.infoList}>
                      <InfoItem label="Diagnóstico"       value={latestRecord.diagnosis} />
                      <InfoItem label="CID-10"            value={latestRecord.cid10} />
                      <InfoItem label="Conduta"           value={latestRecord.treatmentPlan} />
                      <InfoItem label="Prescrições"       value={latestRecord.prescriptions} />
                      <InfoItem label="Exames solicitados" value={latestRecord.examRequests} />
                      <InfoItem label="Retorno"           value={latestRecord.returnDate ? formatDate(latestRecord.returnDate) : undefined} />
                    </dl>
                  </SectionCard>
                </div>
              </div>
            </div>
          )
        )}

        {/* ══ PRONTUÁRIOS ══════════════════════════════════════════ */}
        {tab === "records" && (
          <div>
            <div className={styles.listHeader}>
              <p className={styles.listHeaderTitle}>{patientRecords.length} prontuário{patientRecords.length !== 1 ? "s" : ""}</p>
              <Button size="sm" onClick={() => onViewRecords(patient)}>Abrir editor</Button>
            </div>
            {patientRecords.length === 0 ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyStateTitle}>Nenhum prontuário registrado</p>
              </div>
            ) : (
              <div className={styles.timeline}>
                {patientRecords.map((r, i) => (
                  <div key={r.id} className={`${styles.timelineItem} ${i === patientRecords.length - 1 ? styles.timelineItemLast : ""}`}>
                    <div className={styles.timelineDotWrap}>
                      <div className={styles.timelineDot} />
                      {i < patientRecords.length - 1 && <div className={styles.timelineLine} />}
                    </div>
                    <div className={styles.timelineCard}>
                      <div className={styles.timelineCardTop}>
                        <div>
                          <p className={styles.timelineDate}>{formatDate(r.date)}</p>
                          <p className={styles.timelineDoctor}>{r.doctorName}</p>
                        </div>
                        <div className={styles.timelineRight}>
                          {r.cid10 && <span className={styles.cidTag}>{r.cid10}</span>}
                          <span className={`${styles.statusTag} ${r.status === "finalized" ? styles.statusTagGreen : styles.statusTagAmber}`}>
                            {r.status === "finalized" ? "Finalizado" : "Em aberto"}
                          </span>
                        </div>
                      </div>
                      <p className={styles.timelineComplaint}>{r.chiefComplaint}</p>
                      {(r.diagnosis || r.allergies) && (
                        <div className={styles.timelineDetails}>
                          {r.diagnosis && <span>Diagnóstico: {r.diagnosis}</span>}
                          {r.allergies && <span>Alergias: {r.allergies}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ RECEITAS ═════════════════════════════════════════════ */}
        {tab === "prescriptions" && (
          <div>
            <div className={styles.listHeader}>
              <p className={styles.listHeaderTitle}>{patientRx.length} receita{patientRx.length !== 1 ? "s" : ""}</p>
              {isDoctor && (
                <Button size="sm" onClick={() => setPrescribing(true)}>+ Nova receita</Button>
              )}
            </div>
            {patientRx.length === 0 ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyStateTitle}>Nenhuma receita emitida</p>
                {isDoctor && (
                  <button className={styles.emptyStateAction} onClick={() => setPrescribing(true)}>
                    Emitir primeira receita
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.timeline}>
                {patientRx.map((rx, i) => (
                  <div key={rx.id} className={`${styles.timelineItem} ${i === patientRx.length - 1 ? styles.timelineItemLast : ""}`}>
                    <div className={styles.timelineDotWrap}>
                      <div className={styles.timelineDot} style={{ background: "#2563eb" }} />
                      {i < patientRx.length - 1 && <div className={styles.timelineLine} />}
                    </div>
                    <div className={styles.timelineCard}>
                      <div className={styles.timelineCardTop}>
                        <div>
                          <p className={styles.timelineDate}>{formatDate(rx.date)}</p>
                          <p className={styles.timelineDoctor}>{rx.doctorName}{rx.doctorCrm ? ` · CRM ${rx.doctorCrm}` : ""}</p>
                        </div>
                        <div className={styles.timelineRight}>
                          <span className={styles.cidTag}>{RX_TYPE_MAP[rx.type]}</span>
                          <span className={`${styles.statusTag} ${rx.status === "emitted" ? styles.statusTagGreen : styles.statusTagAmber}`}>
                            {rx.status === "emitted" ? "Emitida" : "Rascunho"}
                          </span>
                        </div>
                      </div>
                      <div className={styles.rxMedList}>
                        {rx.medications.map((m, mi) => (
                          <div key={mi} className={styles.rxMedRow}>
                            <span className={styles.rxMedNum}>{mi + 1}</span>
                            <div>
                              <p className={styles.rxMedName}>{m.name} {m.concentration} — {m.form}</p>
                              <p className={styles.rxMedPosology}>{m.posology}{m.duration ? ` · ${m.duration}` : ""}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      {rx.cid10 && <p className={styles.rxCid}>CID-10: {rx.cid10}</p>}
                      {rx.observations && <p className={styles.rxObs}>{rx.observations}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
