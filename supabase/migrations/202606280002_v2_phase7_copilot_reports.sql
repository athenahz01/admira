-- V2 Phase 7: Admira Copilot report shares.
-- Reversible down path:
--   pipeline/audit/v2_phase7_copilot_reports_down.sql

create table if not exists public.report_shares (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null,
  token_hash text not null unique check (length(token_hash) >= 64),
  report_payload jsonb not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists report_shares_subject_idx
  on public.report_shares (subject_id);

create index if not exists report_shares_active_token_idx
  on public.report_shares (token_hash)
  where revoked_at is null;

alter table public.report_shares enable row level security;

drop policy if exists "report shares owner can read" on public.report_shares;
create policy "report shares owner can read"
on public.report_shares
for select
to authenticated
using (subject_id = auth.uid());

drop policy if exists "report shares owner can create" on public.report_shares;
create policy "report shares owner can create"
on public.report_shares
for insert
to authenticated
with check (subject_id = auth.uid());

drop policy if exists "report shares owner can update" on public.report_shares;
create policy "report shares owner can update"
on public.report_shares
for update
to authenticated
using (subject_id = auth.uid())
with check (subject_id = auth.uid());

drop policy if exists "report shares owner can delete" on public.report_shares;
create policy "report shares owner can delete"
on public.report_shares
for delete
to authenticated
using (subject_id = auth.uid());
