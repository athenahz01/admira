# Fitty Phase 6 Privacy, Retention, and Threat Model

Fitty's real-outcome moat is opt-in only. The production capture path is disabled unless `FITTY_OUTCOME_CAPTURE_ENABLED=true`.

## Data Collected With Consent

Fitty stores only modeling inputs needed for admission-outcome calibration:

- Applicant profile: GPA, course rigor bucket, SAT, ACT, test-submission flag, activity tier, intended major, application round, demonstrated-interest bucket, and cycle year.
- Application outcome: school `unitid`, admitted/denied/waitlisted/deferred, application round, and cycle year.
- Consent record: subject id, consent version, consent text, purpose, consent timestamp, and revocation timestamp.
- Access log: subject id, action, row count, reason, actor, and timestamp.

Race and ethnicity are never collected, stored, logged, modeled, or accepted by the capture schemas, even with consent.

## Consent Gate

No applicant profile or application outcome row can be inserted unless an active `consent_records` row exists for the same `subject_id` and purpose. This is enforced twice:

- API layer: outcome capture routes require an authenticated subject and explicit `consent_record_id`.
- Database layer: `require_active_modeling_consent()` rejects inserts or updates when consent is missing, belongs to a different subject, or has `revoked_at` set.

Consent can be revoked through `/api/outcomes/revoke-consent`. Revocation blocks future profile/outcome storage. Deletion is separate and purges existing rows.

## Data Subject Controls

- Export: `GET /api/outcomes/export-my-data` returns the subject's consent records, applicant profiles, application outcomes, and access logs.
- Delete: `DELETE /api/outcomes/delete-my-data` hard-deletes the subject's consent records. Profile and outcome rows cascade. Access logs for that subject are then deleted too.

Deletion is intentionally a hard delete because the captured rows are for modeling, not account operations.

## Retention Policy

Production retention should be short and purpose-limited:

- Keep consented modeling rows only while consent remains active and while they are needed for calibration/retraining.
- Reconfirm consent when the consent text version changes.
- Honor deletion requests immediately through the hard-delete endpoint.
- Review stale consent records at least annually.

The checked-in migration does not create a scheduled retention job because Supabase project scheduling differs by deployment. Operators should add a scheduled job or external worker that flags or deletes stale revoked records according to their published policy.

## Access and Secrets

- Outcome APIs use `SUPABASE_SERVICE_ROLE_KEY` only on the server.
- Browser code never receives service-role credentials.
- The default production subject identity path requires a Supabase user bearer token.
- `FITTY_CAPTURE_ALLOW_UNSIGNED_SUBJECT=true` is blocked in production and exists only for local audits/tests.
- Row Level Security is enabled on all Phase 6 tables, with authenticated users limited to their own `subject_id`.

## Threat Model

Primary risks:

- Unauthorized cross-user reads.
- Storage without consent.
- Overcollection of sensitive attributes.
- Service-role secret exposure.
- Deletion or export abuse by a caller impersonating another subject.
- Model leakage from accidental demographic fields.

Controls:

- RLS owner policies on all capture tables.
- Server-side service-role access only.
- Strict schemas and recursive forbidden-key checks for race and ethnicity.
- Database trigger requiring active consent for profile/outcome rows.
- Hard-delete endpoint scoped to authenticated subject id.
- Access logs for consent, profile creation, outcome creation, export, revocation, and deletion.
- Real training script requires `subject_id` and `consent_record_id` on every row and never includes race/ethnicity features.

Residual risk:

- Production deployments must connect subject identity to Supabase Auth or an equivalent verified identity provider. Header-only unsigned subject ids are local-audit only.
- Calibration tables are only as reliable as the volume and representativeness of consented outcomes.
