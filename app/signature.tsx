"use client";

// The Admira signature data-viz set — one perfected, reusable trio used
// identically on every "verdict" surface (school read, dashboard top-read,
// Climb moves). Presentation only: every component renders the numbers it is
// handed; it computes no figure of its own beyond picking a max/min label for
// the radar's plain-language read. Tokens only; reduced-motion honored.

import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const handler = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener?.("change", handler);
    return () => query.removeEventListener?.("change", handler);
  }, []);
  return reduced;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value * 100));
}

export type RangeScale = "percent" | "score";

function formatPoint(value: number, scale: RangeScale) {
  const rounded = Math.round(value * 100);
  return scale === "score" ? `${rounded}` : `${rounded}%`;
}

// ── RangeBar ─────────────────────────────────────────────────────────────────
// The hero data-viz. A 0/50/100 axis, tier-tinted zones, the modeled interval as
// an animated fill, and a most-likely tick — with a hover/focus tooltip and a
// text equivalent. low/high/point are 0..1 (probability) or score/100.
export function RangeBar({
  low,
  high,
  point,
  label,
  scale = "percent",
  testId = "range-band",
}: {
  low: number;
  high: number;
  point: number;
  label: string;
  scale?: RangeScale;
  testId?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const left = clampPercent(low);
  const right = clampPercent(high);
  const width = Math.max(1.5, right - left);
  const tickLeft = clampPercent(point);

  const rangeText = `${formatPoint(low, scale)} to ${formatPoint(high, scale)}`;
  const pointText = formatPoint(point, scale);
  const aria = `${label}: most-likely ${pointText}, modeled range ${rangeText}.`;
  const tooltip =
    scale === "score"
      ? `Now ${pointText} · projected ${rangeText}`
      : `Most-likely ~${pointText} · modeled range ${rangeText}`;
  const axis = scale === "score" ? ["0", "50", "100"] : ["0%", "50%", "100%"];

  return (
    <div
      className="rangebar"
      data-testid={testId}
      data-reduced={reduced ? "true" : undefined}
      role="img"
      aria-label={aria}
      tabIndex={0}
    >
      <div className="rangebar-track" aria-hidden="true">
        <span className="rangebar-zones" />
        <span className="rangebar-mid" />
        <span
          className="rangebar-fill"
          style={{ left: `${left}%`, width: `${width}%` }}
        />
        <span className="rangebar-tick" style={{ left: `${tickLeft}%` }} />
        <span
          className="rangebar-tooltip mono"
          style={{ left: `${tickLeft}%` }}
          role="presentation"
        >
          {tooltip}
        </span>
      </div>
      <div className="rangebar-axis mono" aria-hidden="true">
        <span>{axis[0]}</span>
        <span>{axis[1]}</span>
        <span>{axis[2]}</span>
      </div>
    </div>
  );
}

// ── VerdictBlock ─────────────────────────────────────────────────────────────
// The identity: a tier chip in tier color, a Bricolage one-liner, an optional
// mono metric, and driver chips with up/down arrows in semantic color. Identical
// on every surface.
export type VerdictDriver = {
  label: string;
  direction: "up" | "down" | "neutral";
};

export function mapDriverDirection(
  direction: "positive" | "negative" | "neutral" | string,
): VerdictDriver["direction"] {
  if (direction === "positive") return "up";
  if (direction === "negative") return "down";
  return "neutral";
}

export function VerdictBlock({
  tone,
  chipLabel,
  headline,
  metric,
  drivers,
  sample,
}: {
  tone: string;
  chipLabel: string;
  headline: string;
  metric?: string;
  drivers?: VerdictDriver[];
  sample?: boolean;
}) {
  return (
    <div className="verdict-block" data-testid="verdict-block">
      <div className="verdict-block-head">
        <span className="label-pill tier-pill" data-tier={tone}>
          {chipLabel}
        </span>
        {sample ? <span className="tag">Illustration</span> : null}
        {metric ? <strong className="verdict-block-metric mono">{metric}</strong> : null}
      </div>
      <p className="verdict-block-line">{headline}</p>
      {drivers && drivers.length > 0 ? (
        <ul className="verdict-driver-chips" aria-label="What moves this read">
          {drivers.map((driver, index) => (
            <li
              key={`${driver.label}-${index}`}
              className="verdict-driver-chip"
              data-direction={driver.direction}
            >
              {driver.direction === "up" ? (
                <ArrowUp size={13} aria-hidden="true" />
              ) : driver.direction === "down" ? (
                <ArrowDown size={13} aria-hidden="true" />
              ) : null}
              <span>{driver.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ── FitRadar ─────────────────────────────────────────────────────────────────
// The existing Recharts radar, perfected: teal you / indigo-dashed reference,
// animated draw (instant under reduced-motion), labeled axes, and a plain
// one-line read picked from the real axis values. The text-equivalent axis list
// stays alongside in the caller for a11y.
export type RadarAxis = { key: string; label: string; value: number; reference: number };

export function radarOneLineRead(axes: RadarAxis[]): string {
  const known = axes.filter((axis) => Number.isFinite(axis.value));
  if (known.length === 0) {
    return "Not enough data for a read yet.";
  }
  const strongest = known.reduce((best, axis) => (axis.value > best.value ? axis : best));
  const weakest = known.reduce((worst, axis) => (axis.value < worst.value ? axis : worst));
  if (strongest.key === weakest.key) {
    return `Even across ${known.length} axes.`;
  }
  return `Strongest on ${strongest.label}; stretch on ${weakest.label}.`;
}

export function FitRadar({
  axes,
  label = "Fit radar",
}: {
  axes: RadarAxis[];
  label?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const data = axes.map((axis) => ({
    axis: axis.label,
    value: axis.value,
    reference: axis.reference,
  }));
  const aria = `${label}. ${axes
    .map((axis) => `${axis.label} ${axis.value} out of 100`)
    .join(", ")}.`;

  return (
    <div className="fit-radar-block">
      <div className="fit-radar-chart" role="img" aria-label={aria}>
        <ResponsiveContainer width="100%" height={250}>
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
            <Radar
              name="Typical admit"
              dataKey="reference"
              stroke="var(--school-indigo)"
              fill="transparent"
              strokeDasharray="5 5"
              isAnimationActive={!reduced}
              animationDuration={250}
              animationEasing="ease-out"
            />
            <Radar
              name="You"
              dataKey="value"
              stroke="var(--fit-teal)"
              fill="var(--fit-green)"
              fillOpacity={0.28}
              isAnimationActive={!reduced}
              animationDuration={250}
              animationEasing="ease-out"
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <p className="fit-radar-read" data-testid="fit-radar-read">
        {radarOneLineRead(axes)}
      </p>
      <div className="radar-legend">
        <span>
          <i className="legend-dot student" />
          You
        </span>
        <span>
          <i className="legend-dot typical" />
          Typical admit
        </span>
      </div>
    </div>
  );
}
