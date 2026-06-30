import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    absolute: "Your College Chances, School by School | Admira",
  },
  description:
    "See your admissions chances at every school and find the ones that fit — for US and Canadian college applicants.",
};

export default function Home() {
  return (
    <main className="marketing-shell">
      <nav className="marketing-nav" aria-label="Admira marketing">
        <Link className="brand-mark" href="/">
          <div className="brand-sigil" aria-hidden="true">
            A
          </div>
          <div className="brand-copy">
            <h1>Admira</h1>
            <p>your college chances</p>
          </div>
        </Link>
        <div className="topbar-actions">
          <Link className="method-link" href="/methodology">
            Methodology
          </Link>
          <Link className="method-link" href="/privacy">
            Privacy
          </Link>
          <Link className="add-button marketing-signin" href="/start">
            Get your read
          </Link>
        </div>
      </nav>

      <section className="marketing-hero">
        <div className="marketing-copy">
          <span className="section-kicker">For the US &amp; Canada</span>
          <h2>Know your chances at every college.</h2>
          <p>
            Set up your profile once, and Admira shows your admissions chances
            at any school, finds the ones that fit you, and helps you build a
            balanced list.
          </p>
          <div className="marketing-actions">
            <Link className="add-button" href="/start">
              Get your read
            </Link>
            <Link className="method-link" href="/methodology">
              See how it works
            </Link>
          </div>
          <div className="marketing-strip" aria-label="What Admira does">
            <span>Chances at every school</span>
            <span>Schools that fit you</span>
            <span>A balanced college list</span>
          </div>
        </div>

        <aside className="sample-read-card" aria-label="Illustrative Admira read">
          <span className="sample-tag">Illustration</span>
          <div className="section-kicker">Sample read</div>
          <h3>A target. Strong academics, fierce field.</h3>
          <div className="sample-read-grid">
            <div>
              <span className="micro-label">Your chance range</span>
              <strong className="sample-range mono">24-38%</strong>
            </div>
            <span className="result-pill target">Target</span>
          </div>
          <div className="sample-rangebar" aria-hidden="true">
            <span />
            <i />
          </div>
          <p className="helper">
            These figures are illustrative only. Your real numbers appear once
            you set up your profile and pick a school.
          </p>
          <div className="sample-fit">
            <span className="micro-label">Fit overlap</span>
            <strong>FIT 71</strong>
          </div>
        </aside>
      </section>
    </main>
  );
}
