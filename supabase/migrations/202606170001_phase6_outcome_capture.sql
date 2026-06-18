create extension if not exists pgcrypto;

create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null,
  consent_version text not null,
  consent_text text not null,
  purpose text not null default 'real_outcome_modeling',
  consented_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (length(consent_text) >= 40),
  check (purpose in ('real_outcome_modeling'))
);

create table if not exists public.applicant_profiles (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null,
  consent_record_id uuid not null references public.consent_records(id) on delete cascade,
  cycle_year integer not null check (cycle_year between 2020 and 2100),
  gpa numeric check (gpa is null or (gpa >= 0 and gpa <= 5)),
  course_rigor text check (
    course_rigor is null or course_rigor in ('standard', 'honors', 'ap_ib_dual', 'most_rigorous', 'unknown')
  ),
  sat_score integer check (sat_score is null or (sat_score between 400 and 1600)),
  act_score integer check (act_score is null or (act_score between 1 and 36)),
  test_submitted boolean not null default true,
  activities_tier text check (
    activities_tier is null or activities_tier in ('none', 'school', 'regional', 'state', 'national', 'unknown')
  ),
  intended_major text,
  application_round text not null default 'regular' check (application_round in ('regular', 'early')),
  demonstrated_interest text check (
    demonstrated_interest is null or demonstrated_interest in ('none', 'light', 'moderate', 'strong', 'unknown')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.application_outcomes (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null,
  profile_id uuid not null references public.applicant_profiles(id) on delete cascade,
  consent_record_id uuid not null references public.consent_records(id) on delete cascade,
  unitid integer not null references public.schools(unitid),
  outcome text not null check (outcome in ('admitted', 'denied', 'waitlisted', 'deferred')),
  application_round text not null check (application_round in ('regular', 'early')),
  cycle_year integer not null check (cycle_year between 2020 and 2100),
  created_at timestamptz not null default now()
);

create table if not exists public.data_access_logs (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null,
  actor text not null default current_user,
  action text not null check (action in ('consent_recorded', 'profile_created', 'outcome_created', 'exported', 'deleted', 'consent_revoked')),
  row_count integer not null default 0 check (row_count >= 0),
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists consent_records_subject_idx
  on public.consent_records (subject_id);

create index if not exists applicant_profiles_subject_idx
  on public.applicant_profiles (subject_id);

create index if not exists applicant_profiles_consent_idx
  on public.applicant_profiles (consent_record_id);

create index if not exists application_outcomes_subject_idx
  on public.application_outcomes (subject_id);

create index if not exists application_outcomes_profile_idx
  on public.application_outcomes (profile_id);

create index if not exists application_outcomes_unitid_idx
  on public.application_outcomes (unitid);

create index if not exists data_access_logs_subject_idx
  on public.data_access_logs (subject_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists applicant_profiles_touch_updated_at on public.applicant_profiles;
create trigger applicant_profiles_touch_updated_at
before update on public.applicant_profiles
for each row execute function public.touch_updated_at();

create or replace function public.require_active_modeling_consent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_subject uuid;
begin
  if not exists (
    select 1
    from public.consent_records consent
    where consent.id = new.consent_record_id
      and consent.subject_id = new.subject_id
      and consent.purpose = 'real_outcome_modeling'
      and consent.revoked_at is null
  ) then
    raise exception 'active consent_record is required before storing modeling data';
  end if;

  if tg_table_name = 'application_outcomes' then
    select subject_id into profile_subject
    from public.applicant_profiles
    where id = new.profile_id
      and consent_record_id = new.consent_record_id;

    if profile_subject is null or profile_subject <> new.subject_id then
      raise exception 'application outcome must belong to the same consented subject and profile';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists applicant_profiles_require_consent on public.applicant_profiles;
create trigger applicant_profiles_require_consent
before insert or update on public.applicant_profiles
for each row execute function public.require_active_modeling_consent();

drop trigger if exists application_outcomes_require_consent on public.application_outcomes;
create trigger application_outcomes_require_consent
before insert or update on public.application_outcomes
for each row execute function public.require_active_modeling_consent();

alter table public.consent_records enable row level security;
alter table public.applicant_profiles enable row level security;
alter table public.application_outcomes enable row level security;
alter table public.data_access_logs enable row level security;

drop policy if exists "consent owner can read" on public.consent_records;
create policy "consent owner can read"
on public.consent_records
for select
to authenticated
using (subject_id = auth.uid());

drop policy if exists "consent owner can create" on public.consent_records;
create policy "consent owner can create"
on public.consent_records
for insert
to authenticated
with check (subject_id = auth.uid());

drop policy if exists "profile owner can read" on public.applicant_profiles;
create policy "profile owner can read"
on public.applicant_profiles
for select
to authenticated
using (subject_id = auth.uid());

drop policy if exists "profile owner can create" on public.applicant_profiles;
create policy "profile owner can create"
on public.applicant_profiles
for insert
to authenticated
with check (subject_id = auth.uid());

drop policy if exists "profile owner can delete" on public.applicant_profiles;
create policy "profile owner can delete"
on public.applicant_profiles
for delete
to authenticated
using (subject_id = auth.uid());

drop policy if exists "outcome owner can read" on public.application_outcomes;
create policy "outcome owner can read"
on public.application_outcomes
for select
to authenticated
using (subject_id = auth.uid());

drop policy if exists "outcome owner can create" on public.application_outcomes;
create policy "outcome owner can create"
on public.application_outcomes
for insert
to authenticated
with check (subject_id = auth.uid());

drop policy if exists "outcome owner can delete" on public.application_outcomes;
create policy "outcome owner can delete"
on public.application_outcomes
for delete
to authenticated
using (subject_id = auth.uid());

drop policy if exists "access log owner can read" on public.data_access_logs;
create policy "access log owner can read"
on public.data_access_logs
for select
to authenticated
using (subject_id = auth.uid());
