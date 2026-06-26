-- ============================================================================
-- Portal do paciente: vincular user_id e ler laudos liberados
--
-- Corrige casos em que patients.user_id aponta para conta antiga e o paciente
-- não enxerga laudos (RLS / REST retorna 0 linhas).
-- Idempotente — aplique no SQL Editor do Supabase.
-- ============================================================================

BEGIN;

-- Leitura/atualização do próprio cadastro (inclui match por e-mail do JWT)
DROP POLICY IF EXISTS "patients_select_self" ON public.patients;
CREATE POLICY "patients_select_self"
ON public.patients
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR id = auth.uid()
  OR lower(trim(coalesce(email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
);

DROP POLICY IF EXISTS "patients_update_self" ON public.patients;
CREATE POLICY "patients_update_self"
ON public.patients
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR id = auth.uid()
  OR lower(trim(coalesce(email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
)
WITH CHECK (user_id = auth.uid());

-- Vincula patients.user_id ao usuário autenticado (por e-mail ou vínculo legado)
CREATE OR REPLACE FUNCTION public.link_my_patient_record()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auth_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  auth_uid   uuid := auth.uid();
  found_id   uuid;
BEGIN
  IF auth_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.id INTO found_id
  FROM public.patients p
  WHERE p.user_id = auth_uid
     OR p.id = auth_uid
     OR (
       auth_email <> ''
       AND lower(trim(coalesce(p.email, ''))) = auth_email
     )
  ORDER BY
    CASE
      WHEN p.user_id = auth_uid THEN 0
      WHEN p.id = auth_uid THEN 1
      ELSE 2
    END,
    p.created_at DESC NULLS LAST
  LIMIT 1;

  IF found_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.patients
  SET user_id = auth_uid
  WHERE id = found_id
    AND user_id IS DISTINCT FROM auth_uid;

  RETURN found_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_my_patient_record() TO authenticated;

-- Laudos liberados do paciente logado (ignora RLS da tabela reports)
CREATE OR REPLACE FUNCTION public.get_my_patient_reports()
RETURNS SETOF public.reports
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.*
  FROM public.reports r
  INNER JOIN public.patients p ON p.id = r.patient_id
  WHERE (
    p.user_id = auth.uid()
    OR p.id = auth.uid()
    OR lower(trim(coalesce(p.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  )
  AND lower(trim(coalesce(r.status::text, ''))) IN (
    'finalized', 'sent', 'delivered', 'completed'
  )
AND coalesce(r.exam, '') NOT IN (
    'Registro Clínico',
    'Receita Médica',
    'Registro Financeiro'
  )
  ORDER BY r.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_patient_reports() TO authenticated;

COMMIT;
