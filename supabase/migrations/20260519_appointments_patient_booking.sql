-- ============================================================================
-- Portal do paciente: agendar consulta + ver horarios disponiveis
--
-- Aplique no SQL Editor do Supabase (projeto yuanqfswhberkoevtmfr).
-- Idempotente. Sem este script, o front recebe 403 em:
--   POST /rest/v1/appointments          (criar agendamento)
--   GET  /rest/v1/doctors               (listar medicos)
--   GET  /rest/v1/doctor_availability   (grade / slots)
--   GET  /rest/v1/appointments?doctor_id=... (horarios ocupados)
--
-- Pre-requisito: public.patients.user_id = auth.users.id para cada paciente.
-- ============================================================================

BEGIN;

-- Helper: o paciente logado "e dono" deste patient_id?
-- Cobre:
--   (a) patients.user_id = auth.uid()  (vinculo normal)
--   (b) patients.id = auth.uid()     (legado: PK do paciente = id do usuario)
CREATE OR REPLACE FUNCTION public.patient_id_belongs_to_auth_user(p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_id
      AND (
        p.user_id = auth.uid()
        OR p.id = auth.uid()
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.patient_id_belongs_to_auth_user(uuid) TO authenticated;

-- Paciente precisa ler o proprio registro em `patients` (resolver id no portal).
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "patients_select_self" ON public.patients;
DROP POLICY IF EXISTS "patients_select_self" ON public.patients;
DROP POLICY IF EXISTS "patients_update_self" ON public.patients;
DROP POLICY IF EXISTS "patients_insert_self" ON public.patients;

CREATE POLICY "patients_select_self"
ON public.patients
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR id = auth.uid()
  OR lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

-- Vincular user_id ao proprio cadastro (ex.: PATCH apos login).
CREATE POLICY "patients_update_self"
ON public.patients
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR id = auth.uid()
  OR lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
)
WITH CHECK (user_id = auth.uid());

-- Criar cadastro minimo na primeira vez que o paciente agenda.
CREATE POLICY "patients_insert_self"
ON public.patients
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- appointments
-- ---------------------------------------------------------------------------
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "appointments_patient_select" ON public.appointments;
DROP POLICY IF EXISTS "appointments_patient_insert" ON public.appointments;
DROP POLICY IF EXISTS "appointments_patient_update" ON public.appointments;
DROP POLICY IF EXISTS "appointments_select_scheduling" ON public.appointments;

-- 1) Paciente le seus proprios agendamentos (necessario para a tela voltar
--    a consulta logo apos o POST e para listar a agenda no portal).
CREATE POLICY "appointments_patient_select"
ON public.appointments
FOR SELECT
TO authenticated
USING (public.patient_id_belongs_to_auth_user(patient_id));

-- 2) Paciente cria agendamento para si (created_by deve ser o usuario logado).
CREATE POLICY "appointments_patient_insert"
ON public.appointments
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND public.patient_id_belongs_to_auth_user(patient_id)
);

-- 3) Paciente reagenda / cancela o proprio.
CREATE POLICY "appointments_patient_update"
ON public.appointments
FOR UPDATE
TO authenticated
USING (public.patient_id_belongs_to_auth_user(patient_id))
WITH CHECK (public.patient_id_belongs_to_auth_user(patient_id));

-- 4) Qualquer usuario autenticado pode ler horarios ja ocupados (nao cancelados)
--    para calcular slots livres ao agendar. Nao altera INSERT/UPDATE de terceiros.
CREATE POLICY "appointments_select_scheduling"
ON public.appointments
FOR SELECT
TO authenticated
USING (status IS DISTINCT FROM 'cancelled');

-- ---------------------------------------------------------------------------
-- doctors, doctor_availability, doctor_exceptions (somente leitura)
-- ---------------------------------------------------------------------------
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "doctors_select_authenticated" ON public.doctors;
CREATE POLICY "doctors_select_authenticated"
ON public.doctors
FOR SELECT
TO authenticated
USING (true);

ALTER TABLE public.doctor_availability ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "doctor_availability_select_authenticated" ON public.doctor_availability;
CREATE POLICY "doctor_availability_select_authenticated"
ON public.doctor_availability
FOR SELECT
TO authenticated
USING (true);

ALTER TABLE public.doctor_exceptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "doctor_exceptions_select_authenticated" ON public.doctor_exceptions;
CREATE POLICY "doctor_exceptions_select_authenticated"
ON public.doctor_exceptions
FOR SELECT
TO authenticated
USING (true);

COMMIT;

-- ============================================================================
-- Diagnostico rapido se ainda falhar depois da policy aplicada
-- (executar autenticado como o paciente):
--
--   select auth.uid();
--   select id, user_id, full_name from public.patients
--     where user_id = auth.uid();
--
-- Se o segundo SELECT volta vazio, o paciente nao tem row em `patients` com
-- `user_id = auth.uid()` -> a vinculacao precisa ser corrigida antes
-- (geralmente no fluxo de cadastro/login do paciente).
-- ============================================================================
