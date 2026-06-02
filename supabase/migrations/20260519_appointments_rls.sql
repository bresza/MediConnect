-- ============================================================================
-- RLS policies para `appointments`
--
-- Contexto: o portal do paciente do MediConnect precisa que o paciente logado
-- consiga (1) ler seus proprios agendamentos, (2) criar agendamento novo via
-- botao "Agendar", (3) atualizar (reagendamento / cancelamento) o proprio.
-- Sem esta migracao, o POST de `/rest/v1/appointments` falha com:
--   code   = 42501
--   message= new row violates row-level security policy for table "appointments"
--
-- Convencoes do projeto:
--   - `public.patients(id, user_id, ...)` - `user_id` referencia `auth.users.id`.
--   - `public.user_roles(user_id, role)` - role ∈ {admin, gestor, medico,
--     secretaria, paciente}.
--   - `public.appointments.created_by` recebe `auth.uid()` no payload.
--
-- Aplique este script no SQL Editor do projeto Supabase (yuanqfswhberkoevtmfr).
-- Roda dentro de uma transacao e e idempotente (drop antes de create).
-- ============================================================================

BEGIN;

-- 1) Helper: papel do usuario logado, com SECURITY DEFINER para nao quebrar
--    quando uma policy mais restritiva impedir SELECT direto em `user_roles`.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  ORDER BY
    CASE role
      WHEN 'admin'      THEN 1
      WHEN 'gestor'     THEN 2
      WHEN 'medico'     THEN 3
      WHEN 'secretaria' THEN 4
      WHEN 'paciente'   THEN 5
      ELSE 99
    END
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, anon;

-- 2) Garante que RLS esta ligada na tabela.
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- 3) Limpa policies antigas com os mesmos nomes (idempotencia).
DROP POLICY IF EXISTS "appointments_select_self_patient"  ON public.appointments;
DROP POLICY IF EXISTS "appointments_insert_self_patient"  ON public.appointments;
DROP POLICY IF EXISTS "appointments_update_self_patient"  ON public.appointments;
DROP POLICY IF EXISTS "appointments_select_self_doctor"   ON public.appointments;
DROP POLICY IF EXISTS "appointments_update_self_doctor"   ON public.appointments;
DROP POLICY IF EXISTS "appointments_all_staff"            ON public.appointments;

-- 4) Paciente: le os proprios agendamentos.
CREATE POLICY "appointments_select_self_patient"
ON public.appointments
FOR SELECT
TO authenticated
USING (
  patient_id IN (
    SELECT p.id FROM public.patients p WHERE p.user_id = auth.uid()
  )
);

-- 5) Paciente: cria agendamento apenas para si proprio.
--    O WITH CHECK garante que o `patient_id` enviado pertence ao paciente
--    logado. `created_by` precisa coincidir com `auth.uid()` para evitar
--    spoofing do campo no payload.
CREATE POLICY "appointments_insert_self_patient"
ON public.appointments
FOR INSERT
TO authenticated
WITH CHECK (
  patient_id IN (
    SELECT p.id FROM public.patients p WHERE p.user_id = auth.uid()
  )
  AND (created_by IS NULL OR created_by = auth.uid())
);

-- 6) Paciente: atualiza apenas os proprios agendamentos (reagendar/cancelar).
CREATE POLICY "appointments_update_self_patient"
ON public.appointments
FOR UPDATE
TO authenticated
USING (
  patient_id IN (
    SELECT p.id FROM public.patients p WHERE p.user_id = auth.uid()
  )
)
WITH CHECK (
  patient_id IN (
    SELECT p.id FROM public.patients p WHERE p.user_id = auth.uid()
  )
);

-- 7) Medico: le e atualiza agendamentos onde e o profissional escalado.
--    O projeto usa a convencao `doctors.id = auth.users.id` (vide
--    `withDoctorLink` no frontend), entao basta comparar `doctor_id`
--    com `auth.uid()`.
CREATE POLICY "appointments_select_self_doctor"
ON public.appointments
FOR SELECT
TO authenticated
USING (
  public.current_user_role() = 'medico'
  AND doctor_id = auth.uid()
);

CREATE POLICY "appointments_update_self_doctor"
ON public.appointments
FOR UPDATE
TO authenticated
USING (
  public.current_user_role() = 'medico'
  AND doctor_id = auth.uid()
)
WITH CHECK (
  public.current_user_role() = 'medico'
  AND doctor_id = auth.uid()
);

-- 8) Staff administrativo (admin/gestor/secretaria): tudo liberado.
--    Mantemos uma unica policy "ALL" para reduzir a quantidade de regras.
CREATE POLICY "appointments_all_staff"
ON public.appointments
FOR ALL
TO authenticated
USING (
  public.current_user_role() IN ('admin', 'gestor', 'secretaria')
)
WITH CHECK (
  public.current_user_role() IN ('admin', 'gestor', 'secretaria')
);

COMMIT;

-- ============================================================================
-- Smoke test (executar separadamente, autenticado como o paciente)
--
-- select auth.uid();
-- select id, user_id, full_name from public.patients where user_id = auth.uid();
-- insert into public.appointments (patient_id, doctor_id, scheduled_at,
--                                  duration_minutes, appointment_type, notes,
--                                  created_by)
-- values ('<patient_id_acima>', '<doctor_id>', now() + interval '1 day', 30,
--         'presencial', '[Tipo: consultation]', auth.uid());
-- ============================================================================
