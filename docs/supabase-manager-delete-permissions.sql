-- Permissoes administrativas para gestor/admin remover pacientes com vinculos.
-- Execute no SQL Editor do Supabase ou adicione como migration do backend/API.
-- O front-end ja permite a acao; o bloqueio atual acontece no RLS/DELETE do Supabase.

create or replace function public.current_user_is_manager_or_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and lower(ur.role) in ('gestor', 'manager', 'admin', 'administrador')
  );
$$;

grant execute on function public.current_user_is_manager_or_admin() to authenticated;

alter table public.appointments enable row level security;
alter table public.reports enable row level security;
alter table public.patients enable row level security;

drop policy if exists "manager_admin_delete_appointments" on public.appointments;
create policy "manager_admin_delete_appointments"
on public.appointments
for delete
to authenticated
using (public.current_user_is_manager_or_admin());

drop policy if exists "manager_admin_update_appointments" on public.appointments;
create policy "manager_admin_update_appointments"
on public.appointments
for update
to authenticated
using (public.current_user_is_manager_or_admin())
with check (public.current_user_is_manager_or_admin());

drop policy if exists "manager_admin_delete_reports" on public.reports;
create policy "manager_admin_delete_reports"
on public.reports
for delete
to authenticated
using (public.current_user_is_manager_or_admin());

drop policy if exists "manager_admin_delete_patients" on public.patients;
create policy "manager_admin_delete_patients"
on public.patients
for delete
to authenticated
using (public.current_user_is_manager_or_admin());

do $$
begin
  if to_regclass('public.patient_assignments') is not null then
    execute 'alter table public.patient_assignments enable row level security';
    execute 'drop policy if exists "manager_admin_delete_patient_assignments" on public.patient_assignments';
    execute '
      create policy "manager_admin_delete_patient_assignments"
      on public.patient_assignments
      for delete
      to authenticated
      using (public.current_user_is_manager_or_admin())
    ';
  end if;
end $$;
