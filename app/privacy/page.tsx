import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    absolute: "Privacy & Consent | Admira",
  },
  description:
    "Admira privacy, consent, and terms for optional outcome data sharing.",
};

const effectiveDate = "June 22, 2026";
const policyVersion = "privacy-consent-2026-06-22";

const collectedFields = [
  "Applicant profile fields you submit: cycle year, GPA, course rigor, SAT, ACT, test submission status, activities tier, intended major, application round, and demonstrated interest.",
  "Application outcomes you submit: school, outcome, application round, and cycle year.",
  "Consent records needed to show what you agreed to and when.",
];

const neverCollected = [
  "Race and ethnicity are never collected or used.",
  "Admira does not sell personal data.",
  "Browsing, searching schools, and getting chance ranges do not collect personal data.",
];

export default function PrivacyPage() {
  return (
    <main className="admira-shell">
      <div className="admira-frame methodology-frame policy-frame">
        <header className="app-topbar">
          <div className="brand-mark">
            <div className="brand-sigil" aria-hidden="true">
              A
            </div>
            <div className="brand-copy">
              <h1>Privacy</h1>
              <p>consent and terms</p>
            </div>
          </div>
          <div className="topbar-actions">
            <Link className="method-link" href="/">
              Back to Admira
            </Link>
            <Link className="method-link" href="/methodology">
              Methodology
            </Link>
          </div>
        </header>

        <section className="methodology-hero" aria-labelledby="privacy-title">
          <div>
            <div className="section-kicker">Policy record</div>
            <h2 id="privacy-title" className="methodology-title">
              Privacy & Consent Policy
            </h2>
            <p className="method-copy">
              Product copy for how Admira handles optional outcome sharing. This
              page is not a substitute for legal review.
            </p>
          </div>
          <div className="methodology-stamp" aria-label="Current policy version">
            <span>Effective date</span>
            <strong>{effectiveDate}</strong>
            <small>Version {policyVersion}</small>
          </div>
        </section>

        <nav className="policy-anchor-list" aria-label="Policy sections">
          <a href="#collected">What is collected</a>
          <a href="#never">Never collected</a>
          <a href="#controls">Your controls</a>
          <a href="#minors">Minors</a>
          <a href="#terms">Terms</a>
        </nav>

        <div className="methodology-grid">
          <section className="method-panel" id="collected">
            <div className="section-kicker">With consent only</div>
            <h3 className="section-title">What Admira collects.</h3>
            <p className="method-copy">
              Admira stores optional outcome data only after you sign in and
              explicitly record consent. Sharing is optional. Admira works fully
              without it.
            </p>
            <ul className="method-list">
              {collectedFields.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          </section>

          <section className="method-panel" id="never">
            <div className="section-kicker">Boundaries</div>
            <h3 className="section-title">What is never collected or used.</h3>
            <ul className="method-list">
              {neverCollected.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="method-panel">
            <div className="section-kicker">Purpose</div>
            <h3 className="section-title">Why outcome sharing exists.</h3>
            <p className="method-copy">
              Admira uses consented applicant profiles and self-reported
              application outcomes to improve admission-chance calibration. It
              does not turn sharing into a requirement, and it does not promise a
              more precise result for any individual student.
            </p>
          </section>

          <section className="method-panel">
            <div className="section-kicker">Analytics</div>
            <h3 className="section-title">Analytics are off by default.</h3>
            <p className="method-copy">
              When analytics debugging is enabled, Admira logs only
              non-identifying product events. It never logs scores, GPA,
              identifiers, email, school names, state, address, or location.
            </p>
          </section>

          <section className="method-panel" id="controls">
            <div className="section-kicker">Your controls</div>
            <h3 className="section-title">Export, revoke, or delete.</h3>
            <p className="method-copy">
              Signed-in users can export their data, revoke consent, or delete
              their stored outcome data from Admira&apos;s data controls.
              Revoking consent stops future storage. Deleting data is permanent
              and leaves only a minimal deletion record.
            </p>
            <div className="policy-control-links">
              <Link className="method-link" href="/#outcome-capture">
                Outcome capture
              </Link>
              <Link className="method-link" href="/#data-controls">
                Data controls
              </Link>
            </div>
          </section>

          <section className="method-panel">
            <div className="section-kicker">Storage and access</div>
            <h3 className="section-title">Stored with account-level protection.</h3>
            <p className="method-copy">
              Outcome records are stored under the signed-in user&apos;s own
              consented records and protected by row-level security. Access is
              limited to the user and server-side service operations needed to
              provide export, revoke, delete, and calibration workflows.
            </p>
          </section>

          <section className="method-panel limitation-panel" id="minors">
            <div className="section-kicker">Minors</div>
            <h3 className="section-title">Students under 18 should review first.</h3>
            <p className="method-copy">
              Students under 18 should review this policy with a parent or
              guardian before sharing any outcome data. Users under 13 are not
              permitted to share outcome data without verifiable parental consent.
            </p>
            {/* Legal review needed for COPPA, FERPA, and state privacy laws before enabling capture in production. */}
          </section>

          <section className="method-panel">
            <div className="section-kicker">Contact</div>
            <h3 className="section-title">Data requests.</h3>
            <p className="method-copy">
              Contact placeholder: privacy@admira.example. Replace this before
              enabling outcome capture in production.
            </p>
          </section>
        </div>

        <section className="calibration-record" id="terms" aria-labelledby="terms-title">
          <div>
            <div className="section-kicker">Terms</div>
            <h2 id="terms-title" className="section-title">
              Terms for using Admira.
            </h2>
            <p className="method-copy">
              Admira is planning support, not a guarantee, application decision,
              financial aid quote, legal advice, or school endorsement.
            </p>
          </div>
          <ul className="method-list">
            <li>
              Use ranges as planning signals. They are not promises of admission.
            </li>
            <li>
              Use FIT as profile overlap. It is not an admission probability.
            </li>
            <li>
              Submit only your own information or information you are authorized
              to submit.
            </li>
            <li>
              Do not use Admira to collect, infer, or submit race, ethnicity, or
              other information outside the allowed fields.
            </li>
            <li>
              Do not abuse, scrape, disrupt, or try to bypass Admira&apos;s access
              controls.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
