create table if not exists public.schools (
  unitid integer primary key,
  name text not null,
  state text,
  setting text check (setting in ('city', 'suburb', 'town', 'rural')),
  size integer,
  admit_rate numeric check (admit_rate is null or (admit_rate >= 0 and admit_rate <= 1)),
  sat_25 integer,
  sat_75 integer,
  act_25 integer,
  act_75 integer,
  gpa_avg numeric null,
  test_policy text not null default 'unknown' check (test_policy in ('required', 'optional', 'blind', 'unknown')),
  ed_admit_rate numeric null check (ed_admit_rate is null or (ed_admit_rate >= 0 and ed_admit_rate <= 1)),
  rd_admit_rate numeric null check (rd_admit_rate is null or (rd_admit_rate >= 0 and rd_admit_rate <= 1)),
  c7_factors jsonb default '{}'::jsonb,
  selectivity_tier text check (selectivity_tier in ('elite', 'highly_selective', 'selective', 'accessible')),
  updated_at timestamptz default now()
);

create index if not exists schools_selectivity_tier_idx
  on public.schools (selectivity_tier);

create index if not exists schools_state_idx
  on public.schools (state);
