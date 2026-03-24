import { useState } from "react"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Button } from "../../components/ui/Button/Button"
import { Input } from "../../components/ui/Input/Input"
import { Select } from "../../components/ui/Select/Select"
import { Section } from "../../components/ui/Section/Section"
import type { PageId } from "../../types"
import styles from "./Registration.module.css"

interface RegistrationProps { onNavigate: (page: PageId) => void }

const TOTAL_STEPS   = 3
const STEP_LABELS   = ["Dados pessoais", "Documentos", "Contato e social"]

export function Registration({ onNavigate }: RegistrationProps) {
  const [step, setStep]       = useState(1)
  const [docType, setDocType] = useState("CPF")

  return (
    <div>
      <Topbar
        title="Cadastro de Paciente"
        subtitle="Preencha os dados para criar o prontuário"
        action={<Button variant="ghost" onClick={() => onNavigate("patients")}>Cancelar</Button>}
      />

      <Card className={styles.formCard}>
        {/* Stepper */}
        <div className={styles.stepper}>
          {STEP_LABELS.map((label, i) => {
            const n      = i + 1
            const done   = n < step
            const active = n === step
            return (
              <div key={label} className={`${styles.step} ${i < 2 ? styles.flex1 : ""}`}>
                <div className={styles.stepInner}>
                  <div className={`${styles.stepCircle} ${done || active ? styles.stepCircleActive : styles.stepCircleInactive}`}>
                    {done ? "✓" : n}
                  </div>
                  <span className={`${styles.stepLabel} ${active ? styles.stepLabelActive : styles.stepLabelInactive}`}>
                    {label}
                  </span>
                </div>
                {i < 2 && <div className={`${styles.stepLine} ${done ? styles.stepLineDone : styles.stepLineUndone}`} />}
              </div>
            )
          })}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <>
            <Section title="Identificação">
              <div className={`${styles.grid2} ${styles.marginTop}`}>
                <Input label="Nome completo" required placeholder="Nome como no documento" className={styles.colSpan2} />
                <Input label="Nome social" placeholder="Como prefere ser chamado(a)" />
                <Select label="Sexo" required options={["Masculino", "Feminino", "Outro"]} />
              </div>
              <div className={`${styles.grid3} ${styles.marginTop}`}>
                <Input label="Data de nascimento" type="date" required />
                <Select label="Estado civil" options={["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)", "União estável"]} />
                <Input label="Profissão" placeholder="Ex: Professor" />
              </div>
            </Section>
            <Section title="Origem e etnia">
              <div className={styles.grid4}>
                <Select label="Raça (IBGE)" options={["Branca", "Preta", "Parda", "Amarela", "Indígena"]} />
                <Select label="Etnia" options={["Brasileiro", "Afro-brasileiro", "Indígena", "Outro"]} />
                <Select label="Naturalidade" options={["Aracaju/SE", "Salvador/BA", "São Paulo/SP", "Outro"]} />
                <Select label="Nacionalidade" options={["Brasileiro(a)", "Estrangeiro(a)"]} />
              </div>
            </Section>
            <Section title="Filiação">
              <div className={styles.grid4}>
                <Input label="Nome da mãe" className={styles.colSpan2} />
                <Input label="Profissão da mãe" />
                <Input label="Profissão do pai" />
                <Input label="Nome do pai" className={styles.colSpan2} />
              </div>
            </Section>
          </>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <>
            <Section title="Documento principal">
              <div className={styles.grid3}>
                <Select label="Tipo" options={["CPF", "RG", "CNH", "Passaporte"]} value={docType}
                  onChange={(e) => setDocType(e.target.value)} />
                <Input label="Número" required placeholder={docType === "CPF" ? "000.000.000-00" : "Número"} />
                {docType === "RG"        && <Select label="Órgão emissor" options={["SSP/SE", "SSP/SP", "SSP/BA"]} />}
                {docType === "CNH"       && <Input label="Validade" type="date" />}
                {docType === "Passaporte"&& <Input label="País emissor" placeholder="Brasil" />}
              </div>
              <div className={`${styles.docBox} ${styles.marginTop}`}>
                <p className={styles.docBoxTitle}>Documentos adicionais</p>
                <div className={styles.docBoxGrid}>
                  <Input label="Cartão SUS" placeholder="000 0000 0000 0000" />
                  <Input label="Nº do convênio" placeholder="Número da carteirinha" />
                  <Select label="Convênio" options={["SUS", "Unimed", "Bradesco Saúde", "Amil", "Particular"]} />
                </div>
              </div>
            </Section>
            <Section title="Endereço">
              <div className={styles.gridAddress}>
                <Input label="CEP" placeholder="00000-000" />
                <Input label="Logradouro" placeholder="Rua, Avenida, etc." />
                <Input label="Nº" placeholder="Nº" />
              </div>
              <div className={styles.gridAddressBottom}>
                <Input label="Complemento" placeholder="Apto, Bloco..." />
                <Input label="Bairro" />
                <Input label="Cidade" />
                <Select label="UF" options={["SE","SP","RJ","BA","MG","PR","RS","SC","GO"]} />
              </div>
            </Section>
          </>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <>
            <Section title="Contatos">
              <div className={styles.grid3}>
                <Input label="Celular" required placeholder="(00) 00000-0000" />
                <Input label="Telefone fixo" placeholder="(00) 0000-0000" />
                <Input label="E-mail" type="email" placeholder="exemplo@email.com" />
              </div>
            </Section>
            <Section title="Contato de emergência">
              <div className={styles.grid3}>
                <Input label="Nome" placeholder="Nome completo" />
                <Input label="Parentesco" placeholder="Ex: Cônjuge, Filho(a)" />
                <Input label="Telefone" placeholder="(00) 00000-0000" />
              </div>
            </Section>
            <Section title="Preferências de comunicação (LGPD)">
              <div className={styles.grid2}>
                <Select label="Canal preferido" options={["WhatsApp", "E-mail", "SMS", "Telefone"]} />
                <Select label="Frequência" options={["Apenas lembretes essenciais", "Lembretes + confirmações", "Todos os contatos"]} />
              </div>
              <div className={styles.lgpdBox}>
                <p className={styles.lgpdText}>
                  <strong>LGPD:</strong> Os dados coletados são usados exclusivamente para fins de atendimento médico.
                  O paciente pode solicitar exclusão a qualquer momento.
                </p>
              </div>
            </Section>
            <Section title="Observações gerais">
              <textarea
                placeholder="Informações relevantes, alergias, observações..."
                rows={3}
                className={styles.textarea}
              />
            </Section>
          </>
        )}

        {/* Footer */}
        <div className={styles.formFooter}>
          <Button variant="ghost" onClick={() => step > 1 ? setStep((s) => s - 1) : onNavigate("patients")}>
            {step > 1 ? "← Anterior" : "Cancelar"}
          </Button>
          <div className={styles.formFooterRight}>
            <span className={styles.stepCount}>Etapa {step} de {TOTAL_STEPS}</span>
            <Button onClick={() => step < TOTAL_STEPS ? setStep((s) => s + 1) : onNavigate("patients")}>
              {step < TOTAL_STEPS ? "Próximo →" : "Salvar paciente"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
