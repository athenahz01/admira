# Go-Live Runbook — Ship V2 to production on the new Supabase project

Single-database setup (old project retired — it had no real users). The new project already has the V2
migrations applied and is seeded (US + Canada schools, program requirements, Students-Like-You seed).
Follow these in order; each step has a "done when" check.

Project: Supabase `ttdzakmrpurohzfktiho` · Repo `athenahz01/admira` · Branch to ship: `v2/polish-pass` → `master`.

---

## Step 0 — Have these handy
From Supabase → Project Settings → **API**:
- Project URL: `https://ttdzakmrpurohzfktiho.supabase.co`
- `anon` public key
- `service_role` secret key

Reuse from before: `ANTHROPIC_API_KEY`, `SCORECARD_API_KEY`.

---

## Step 1 — Confirm the database is ready
In Supabase → **SQL Editor**, run:
```sql
select count(*) from schools;                       -- expect ~150+
select count(*) from schools where country = 'CA';  -- expect 14
select count(*) from program_requirements;          -- expect 22
```
**Done when:** all three return the expected counts.

## Step 2 — Create the document-vault storage bucket (if not already)
Supabase → **Storage** → New bucket → name exactly `admira-document-vault` → **Private**.
**Done when:** the bucket exists and is private. (Needed for Command Center document uploads. The access
rules were already added by the migration.)

## Step 3 — Run the privacy safety gate (`verify:rls`)
Do this **before** real users can reach it. Open a **fresh** PowerShell window (avoids stale/wrong env vars),
`cd C:\AA_Whetstone\fitty`, then set the new project's values and run:
```powershell
$env:ADMIRA_RLS_TARGET="staging"
$env:SUPABASE_URL="https://ttdzakmrpurohzfktiho.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service_role secret>"
$env:NEXT_PUBLIC_SUPABASE_URL="https://ttdzakmrpurohzfktiho.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon public key>"
npm run verify:rls
```
**Done when:** it prints a passing summary (anon-write blocked, consent enforced, k-anonymity, owner
isolation, report-share isolation). If it fails, stop and send me the output — do not flip flags on.

## Step 4 — Set Vercel environment variables
Vercel → your project → **Settings → Environment Variables**.

4a. **Remove/repoint the old Supabase vars** so nothing points at the retired project.

4b. Add these for **Production AND Preview** (same new-project values):
```
SUPABASE_URL=https://ttdzakmrpurohzfktiho.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role secret>
NEXT_PUBLIC_SUPABASE_URL=https://ttdzakmrpurohzfktiho.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
ANTHROPIC_API_KEY=<reuse>
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
SCORECARD_API_KEY=<reuse>
```

4c. Add the feature flags = `true` for **Production AND Preview**:
```
ADMIRA_ADMIT_INTELLIGENCE_ENABLED=true
ADMIRA_CANADA_ENABLED=true
ADMIRA_FIT_FINDER_ENABLED=true
ADMIRA_UNIVERSE_ENABLED=true
ADMIRA_LIST_BUILDER_ENABLED=true
ADMIRA_STUDENTS_LIKE_YOU_ENABLED=true
ADMIRA_OUTCOME_CAPTURE_ENABLED=true
ADMIRA_CLIMB_ENABLED=true
ADMIRA_COMMAND_CENTER_ENABLED=true
ADMIRA_NARRATIVE_ENABLED=true
ADMIRA_COMPASS_ENABLED=true
ADMIRA_COPILOT_ENABLED=true
ADMIRA_REPORTS_ENABLED=true
```

4d. Leave these **off** (do not add as true):
```
ADMIRA_SLY_FEEDBACK_ENABLED          # deferred (leakage risk)
ADMIRA_REAL_MODEL_ENABLED            # not ready
ADMIRA_CAPTURE_ALLOW_UNSIGNED_SUBJECT # dev-only
```
**Done when:** every var above shows the new project values, scoped to Production + Preview.

## Step 5 — Put V2 code on `master` (this is what makes production V2)
Production deploys from `master`, which is still V1. Merge the branch:
- GitHub → **Pull requests → New pull request** → base `master`, compare `v2/polish-pass` → **Create** →
  **Merge**.
- (Or locally:)
  ```powershell
  git checkout master
  git pull origin master
  git merge v2/polish-pass
  git push origin master
  ```
**Done when:** `master` contains commit `83ea6ee`/the V2 history and GitHub shows the merge.

## Step 6 — Confirm the production deploy
- Vercel → **Deployments**: a new **Production** build kicks off from `master`. Wait for it to finish green.
- If it built *before* you set the env vars, hit **Redeploy** so the new env applies.
**Done when:** the latest Production deployment is "Ready" and used the new env.

## Step 7 — Smoke test production
On the production URL, check:
- A US school shows a score + tier + radar.
- A Canadian program shows a score (Canada flag on).
- Smart List generates a balanced list.
- Copilot answers and Reports generates + shares.
- Students-Like-You shows cohorts only where ≥5 seed records match, else "not enough similar students" (correct).
- Compass shows "pending dataset" until you seed it (correct).
**Done when:** the above render without errors.

---

## After launch — keep in mind
- **Backups on:** confirm Supabase automatic backups are enabled for the project now that it's production.
- **`verify:rls` later:** once you have real users, run it against a throwaway clone, not live prod.
- **Compass:** add real, `source_url`-cited rows to `pipeline/data/compass_seed.json` then
  `npm run ingest:compass` to light up career/earnings.
- **Not blocking, on the cleanup list:** Money module (Phase 4) isn't built; Phase 1 score/tier rounding
  boundary; remove the unused `pgcrypto` line in the Phase 0 migration; fix the two Canada-ingest script
  quirks (`load_dotenv` + `--write-supabase` in the npm script).
- **Rollback if needed:** set the prod flags back to `false` (instant, no deploy needed for behavior to go
  dark) — the safest kill switch. The migrations are reversible if you ever need to undo schema.

---

### Quick order (the whole thing in one line)
DB ready (1) → bucket (2) → verify:rls passes (3) → Vercel env + flags (4) → merge to master (5) →
prod deploy/redeploy (6) → smoke test (7).
