-- ============================================================================
-- Pacientes: equipe (admin/gestor/médico/secretária/financeiro) enxerga todos
-- os cadastros, inclusive com acesso ao portal (user_id preenchido).
--
-- Sem esta policy, apenas patients_select_self funciona para o próprio paciente
-- e a lista da equipe fica incompleta (ex.: Ana Lima aparece no portal mas
-- não na tela Pacientes do administrador).
--
-- Idempotente — aplique no SQL Editor do Supabase.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.is_staff_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND lower(trim(ur.role::text)) IN (
        'admin',
        'administrador',
        'gestor',
        'manager',
        'medico',
        'doctor',
        'secretaria',
        'secretary',
        'financeiro',
        'financial'
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_staff_user() TO authenticated;

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patients_staff_select" ON public.patients;
CREATE POLICY "patients_staff_select"
ON public.patients
FOR SELECT
TO authenticated
USING (public.is_staff_user());

DROP POLICY IF EXISTS "patients_staff_insert" ON public.patients;
CREATE POLICY "patients_staff_insert"
ON public.patients
FOR INSERT
TO authenticated
WITH CHECK (public.is_staff_user());

DROP POLICY IF EXISTS "patients_staff_update" ON public.patients;
CREATE POLICY "patients_staff_update"
ON public.patients
FOR UPDATE
TO authenticated
USING (public.is_staff_user())
WITH CHECK (public.is_staff_user());

COMMIT;
