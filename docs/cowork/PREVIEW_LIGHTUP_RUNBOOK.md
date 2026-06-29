# Runbook — Light up the V2 preview (clone → migrate → seed → flags)

Goal: make the `v2/polish-pass` Vercel preview show the real features, **without touching your production
database**. You'll point the preview at a separate Supabase project (a clone of prod so it has real `schools`
data), apply the V2 migrations, load seeds, confirm privacy with `verify:rls`, then set Vercel env + flags.

Reuse from your existing setup: `ANTHROPIC_API_KEY`, `SCORECARD_API_KEY`. Everything Supabase must be the new
project.

---

## 0. Prereqs (once)
- Repo checked out on branch `v2/polish-pass` (commit `2ae5935`).
- Node deps + Python pipeline env installed: `npm ci` and `pip install -r pipeline/requirements.txt`.
- Supabase CLI installed (`supabase`) and `psql` available.
- A local `.env` you'll fill with the **new** project's values (used only to run the ingest/verify scripts):
  ```
  SUPABASE_URL=...                  # new project
  SUPABASE_SERVICE_ROLE_KEY=...     # new project (service role)
  NEXT_PUBLIC_SUPABASE_URL=...      # same URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY=... # new project anon key
  ANTHROPIC_API_KEY=...             # reuse
  SCORECARD_API_KEY=...             # reuse
  ```

## 1. Create the preview database (pick one)

**A — Clone prod (recommended: keeps real `schools` data, never touches prod):**
- Easiest: Supabase Dashboard → your prod project → **Branching**, or create a new project and restore a
  `pg_dump` of prod into it:
  ```
  pg_dump "postgresql://<PROD_CONNECTION_STRING>" --no-owner --no-privileges -Fc -f prod.dump
  pg_restore --no-owner --no-privileges -d "postgresql://<NEW_PROJECT_CONNECTION_STRING>" prod.dump
  ```
  The clone already has migrations `202606150001`–`202606190001` (V1) + your `schools` rows, so in Step 2 you
  only apply the **V2** migrations (`202606260001` onward).

**B — Fresh empty project:** create a new Supabase project; in Step 2 apply **all** migrations, and in Step 4
you must also load `schools` data (`fit:enrich` / `fit:embed`, or your existing ingest).

## 2. Apply migrations
Link the CLI to the **new** project, then push. (Migrations live in `supabase/migrations/`, applied in
filename order.)
```
supabase link --project-ref <NEW_PROJECT_REF>
supabase db push
```
If you prefer manual control, run each SQL file in order in the Supabase SQL editor / via psql:
```
202606150001_create_schools.sql            # (already present on a clone)
202606170001_phase6_outcome_capture.sql    # (already present on a clone)
202606180001_fit_finder_phase1.sql         # (already present on a clone)
202606180002_fit_finder_phase2_match_function.sql
202606190001_fit_finder_phase3_programs_filters.sql
202606260001_v2_phase0_canada_foundations.sql   # V2 starts here
202606270001_v2_phase3_students_like_you.sql
202606270002_v2_phase5_climb_command_center.sql
202606280001_v2_phase6_compass_corpus.sql
202606280002_v2_phase7_copilot_reports.sql
```
(Optional, on a throwaway DB: `npm run verify:phase0:migration` with `ADMIRA_PHASE0_DATABASE_URL` set — proves
apply+reverse. Already audited live, so optional.)

## 3. Create the document-vault storage bucket (Phase 5)
The migration adds the RLS policies, but the bucket itself must exist. In Supabase → Storage, create a
**private** bucket named exactly:
```
admira-document-vault
```

## 4. Load data / seeds
With your local `.env` pointing at the new project:
```
# Canada foundations (Phase 0)
npm run ingest:canada
# Students-Like-You curated-public seed (Phase 3) — needed or cohorts stay "not enough students"
npm run ingest:sly-seed
# Compass majors/careers (Phase 6) — until loaded, Compass shows "pending dataset"
#   First put real source_url-cited rows into pipeline/data/compass_seed.json, then:
npm run ingest:compass
```
Fresh-project only (Path B): also load `schools` (e.g. `npm run fit:enrich` then `npm run fit:embed`) before
scores/lists/universe will work; `npm run fit:embedding-sanity` to check.

Sanity check the Canada scorer end-to-end: `npm run score:canada-holdout` (expects 19/19).

## 5. Verify privacy on the new DB (do this before exposing the preview)
```
# PowerShell
$env:ADMIRA_RLS_TARGET="staging"; npm run verify:rls
# bash
ADMIRA_RLS_TARGET=staging npm run verify:rls
```
It reads the Supabase vars from your `.env`. Must pass — it confirms anon-write blocks, consent gating,
k-anonymity, and owner isolation on the real database (the checks I ran in audit, now against your project).

## 6. Set Vercel env vars (Preview scope)
Vercel → project → Settings → Environment Variables. Add for the **Preview** environment (and/or the
`v2/polish-pass` branch):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  → the **new** project's values.
- `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL=claude-haiku-4-5-20251001`), `SCORECARD_API_KEY` → reuse.
- Flags = `true`:
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
- Keep **off**: `ADMIRA_SLY_FEEDBACK_ENABLED`, `ADMIRA_REAL_MODEL_ENABLED`,
  `ADMIRA_CAPTURE_ALLOW_UNSIGNED_SUBJECT`.

## 7. Redeploy
Trigger a redeploy of the `v2/polish-pass` preview (Vercel → Deployments → Redeploy, or push a commit). Env
changes only take effect on a new build.

## 8. What you should see (and honest empty states)
- Admit Intelligence score/tier + Profile radar, US **and** Canada (Canada needs the Canada seed).
- Universe pages, Smart List (balanced reach/target/safety), Climb roadmap, Command Center.
- Students-Like-You: real cohorts **only** where ≥5 similar consented/seed records exist — otherwise the
  honest "not enough similar students yet" (that's correct, not a bug).
- Compass: career/earnings only after you seed `compass_seed.json`; otherwise "pending dataset."
- Copilot + Reports (Reports share links work once a report is generated).

---

### Notes
- This is a **preview** on a non-prod DB — safe to toggle and break. Don't run `verify:rls` or seeds against
  prod.
- For the eventual **production** launch: apply the same V2 migrations to prod (they're additive + reversible,
  verified live), create the prod vault bucket, then flip the prod flags **after** `verify:rls` is green —
  that's the standard "schema behind a flag" promotion, and it's Athena's manual step.
- Still open before a real launch: seed `compass_seed.json` with cited rows; the two minor carryovers
  (Phase 1 score/tier rounding, drop the unused `pgcrypto` line); and the Money module (Phase 4) is not built.
