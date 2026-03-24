import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Section } from "../../components/ui/Section/Section"
import { Input } from "../../components/ui/Input/Input"
import { Select } from "../../components/ui/Select/Select"
import { Button } from "../../components/ui/Button/Button"
import styles from "./Settings.module.css"

const MENU_ITEMS = ["Clínica", "Profissionais", "Usuários", "Notificações", "Integrações"]

export function Settings() {
  return (
    <div>
      <Topbar title="Configurações" subtitle="Preferências da clínica" />

      <div className={styles.layout}>
        <Card className={styles.menuCard}>
          {MENU_ITEMS.map((item, i) => (
            <button
              key={item}
              className={`${styles.menuBtn} ${i === 0 ? styles.menuBtnActive : ""}`}
            >
              {item}
            </button>
          ))}
        </Card>

        <Card className={styles.contentCard}>
          <Section title="Dados da clínica">
            <div className={styles.grid2}>
              <Input label="Nome da clínica" defaultValue="Clínica Central" />
              <Input label="CNPJ" placeholder="00.000.000/0000-00" />
              <Input label="Telefone" placeholder="(00) 0000-0000" />
              <Input label="E-mail" type="email" placeholder="contato@clinica.com" />
              <Input label="Endereço" className={styles.colSpan2} />
            </div>
          </Section>

          <Section title="Preferências do sistema">
            <div className={styles.grid2}>
              <Select label="Idioma" options={["Português (BR)", "English"]} />
              <Select label="Fuso horário" options={["America/Sao_Paulo", "America/Manaus"]} />
              <Select label="Formato de data" options={["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]} />
            </div>
          </Section>

          <div className={styles.saveRow}>
            <Button>Salvar configurações</Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
