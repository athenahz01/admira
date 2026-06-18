# Deploying Fitty

Fitty deploys as a Next.js app backed by a Supabase `schools` table. The model artifact is checked in at `lib/model/artifacts.json`; deployment does not retrain the model.

## Required Environment Variables

Set these in local `.env` and in the hosting provider:

```dotenv
SCORECARD_API_KEY=your_scorecard_api_key
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

Optional:

```dotenv
NEXT_PUBLIC_FITTY_ANALYTICS_DEBUG=true
FITTY_OUTCOME_CAPTURE_ENABLED=false
FITTY_CAPTURE_ALLOW_UNSIGNED_SUBJECT=false
FITTY_REAL_MODEL_ENABLED=false
```

Analytics are no-op by default. When the debug flag is enabled, Fitty writes sanitized product events to the browser console only: `page_view`, `profile_completed`, `school_added`, and `methodology_viewed`. The wrapper allowlists non-identifying properties and blocks GPA, SAT, ACT, scores, school identifiers, names, state, email, phone, and zip-like fields.

Outcome capture is disabled by default. Enable `FITTY_OUTCOME_CAPTURE_ENABLED=true` only after Supabase Auth, the Phase 6 migration, and the published consent text are in place. Keep `FITTY_CAPTURE_ALLOW_UNSIGNED_SUBJECT=false` in all hosted environments.

## Supabase Setup

1. Create a Supabase project.
2. Install and authenticate the Supabase CLI.
3. Link the local checkout:

```powershell
supabase login
supabase link --project-ref your-project-ref
```

4. Apply the migration:

```powershell
supabase db push
```

The migration creates `public.schools` with the public admissions fields required by `/api/chance`.

## Populate Schools

Install Python dependencies once:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r pipeline/requirements.txt
```

Run the public data ingest and C7 seed overlay:

```powershell
python pipeline/ingest_scorecard.py
python pipeline/seed_cds_c7.py
```

After both scripts complete, the Supabase `schools` table should contain the seeded Scorecard schools with selectivity tiers, test ranges, and available CDS C7 factors.

## Vercel Deployment

1. Import the repository into Vercel.
2. Set the five required environment variables for Production, Preview, and Development as needed.
3. Use the default Next.js build command:

```powershell
npm run build
```

4. Deploy after the Supabase migration and data population steps have completed.

The browser school search uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The server route `/api/chance` uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to load the selected school before applying the checked-in TypeScript inference artifact.

`FITTY_REAL_MODEL_ENABLED=true` switches `/api/chance` to `lib/model/artifacts.real.json` behind the same request/response contract. Leave it off until `pipeline/train_real.py --source supabase --export-active` has been run on enough consented outcomes and the calibration report has been reviewed.

## Pre-Deploy Verification

Run these from the project root:

```powershell
npm run lint
npx tsc --noEmit
npm run test
npm run test:e2e
npm run build
```

`npm run test:e2e` starts a local Next dev server on port `3100`, uses a tiny fixture for school search, and mocks `/api/chance` so it does not require live Supabase credentials.
