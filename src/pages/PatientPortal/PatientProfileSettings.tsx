import { useEffect, useRef, useState } from "react"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Button } from "../../components/ui/Button/Button"
import { Input } from "../../components/ui/Input/Input"
import { attachPatientPhoto, uploadPatientPhoto } from "../../services/patientPhoto"
import { updatePatient } from "../../services/patients"
import type { CommunicationChannel, Patient } from "../../types"
import { formatCpfBR, formatDate } from "../../utils"
import styles from "./PatientProfileSettings.module.css"

interface PatientProfileSettingsProps {
  patient: Patient
  onSaved: (patient: Patient) => void
}

interface ProfileForm {
  name: string
  socialName: string
  email: string
  phone: string
  dob: string
  preferredChannel: CommunicationChannel
}

function toForm(patient: Patient): ProfileForm {
  return {
    name: patient.name ?? "",
    socialName: patient.socialName ?? "",
    email: patient.email ?? "",
    phone: patient.phone ?? "",
    dob: patient.dob ?? "",
    preferredChannel: patient.preferredChannel ?? "WhatsApp",
  }
}

export function PatientProfileSettings({ patient, onSaved }: PatientProfileSettingsProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<ProfileForm>(() => toForm(patient))
  const [photoPreview, setPhotoPreview] = useState<string | undefined>(patient.photoUrl)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    attachPatientPhoto(patient)
      .then((withPhoto) => {
        if (!alive) return
        setPhotoPreview(withPhoto.photoUrl)
      })
      .catch(() => undefined)
    return () => { alive = false }
  }, [patient])

  useEffect(() => {
    setForm(toForm(patient))
    setPhotoPreview(patient.photoUrl)
    setPhotoFile(null)
  }, [patient])

  function updateField<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSuccess(null)
  }

  function handlePhotoPick(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setError("Selecione um arquivo de imagem válido.")
      return
    }
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setError(null)
    setSuccess(null)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      let photoUrl = photoPreview
      if (photoFile) {
        photoUrl = await uploadPatientPhoto(patient.id, photoFile)
      }

      const updated: Patient = {
        ...patient,
        name: form.name.trim() || patient.name,
        socialName: form.socialName.trim() || undefined,
        email: form.email.trim() || patient.email,
        phone: form.phone.trim() || patient.phone,
        dob: form.dob || patient.dob,
        preferredChannel: form.preferredChannel,
        photoUrl,
      }

      const saved = await updatePatient(updated)
      onSaved(saved)
      setPhotoFile(null)
      setPhotoPreview(saved.photoUrl)
      setSuccess("Perfil atualizado com sucesso.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o perfil.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <section className={styles.photoSection}>
        <div className={styles.photoFrame}>
          <Avatar name={form.name || patient.name} photoUrl={photoPreview} size="xl" />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className={styles.fileInput}
            onChange={(e) => handlePhotoPick(e.target.files?.[0])}
          />
        </div>
        <div className={styles.photoActions}>
          <h3>Foto de perfil</h3>
          <p>Use uma foto nítida para facilitar seu atendimento na recepção.</p>
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={saving}>
            Alterar foto
          </Button>
        </div>
      </section>

      <section className={styles.formSection}>
        <div className={styles.formGrid}>
          <Input
            label="Nome completo"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            required
          />
          <Input
            label="Nome social"
            value={form.socialName}
            onChange={(e) => updateField("socialName", e.target.value)}
            hint="Opcional"
          />
          <Input
            label="E-mail"
            type="email"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
          />
          <Input
            label="Telefone"
            value={form.phone}
            onChange={(e) => updateField("phone", e.target.value)}
          />
          <Input
            label="Data de nascimento"
            type="date"
            value={form.dob}
            onChange={(e) => updateField("dob", e.target.value)}
          />
          <div className={styles.selectWrap}>
            <label htmlFor="preferred-channel">Canal preferido</label>
            <select
              id="preferred-channel"
              value={form.preferredChannel}
              onChange={(e) => updateField("preferredChannel", e.target.value as CommunicationChannel)}
            >
              <option value="WhatsApp">WhatsApp</option>
              <option value="SMS">SMS</option>
              <option value="Email">E-mail</option>
              <option value="Phone">Telefone</option>
            </select>
          </div>
        </div>

        <div className={styles.readonlyBlock}>
          <div>
            <span>CPF</span>
            <strong>{patient.cpf ? formatCpfBR(patient.cpf) : "—"}</strong>
          </div>
          <div>
            <span>Cadastro desde</span>
            <strong>{patient.createdAt ? formatDate(patient.createdAt) : "—"}</strong>
          </div>
          <div>
            <span>Convênio</span>
            <strong>{patient.healthInsurance || "Particular"}</strong>
          </div>
        </div>

        {error && <p className={styles.error} role="alert">{error}</p>}
        {success && <p className={styles.success} role="status">{success}</p>}

        <div className={styles.actions}>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </section>
    </div>
  )
}
