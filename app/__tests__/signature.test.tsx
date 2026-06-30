import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  RangeBar,
  VerdictBlock,
  mapDriverDirection,
  radarOneLineRead,
  type RadarAxis,
} from "../signature";

describe("RangeBar", () => {
  it("renders the props' numbers in the a11y text, tooltip, and axis labels", () => {
    const html = renderToStaticMarkup(
      createElement(RangeBar, {
        low: 0.24,
        high: 0.38,
        point: 0.31,
        label: "MIT chance range",
      }),
    );
    // a11y text equivalent carries the same numbers as the chart.
    expect(html).toContain('role="img"');
    expect(html).toContain("most-likely 31%");
    expect(html).toContain("modeled range 24% to 38%");
    // hover/focus tooltip restates them.
    expect(html).toContain("Most-likely ~31%");
    // 0/50/100 axis ticks.
    expect(html).toContain(">0%<");
    expect(html).toContain(">50%<");
    expect(html).toContain(">100%<");
    // keyboard-focusable.
    expect(html).toContain('tabindex="0"');
    // the interval geometry comes from the props, not a hardcoded width.
    expect(html).toContain("rangebar-fill");
    expect(html).toContain("left:24%");
  });

  it("formats the score scale for Climb deltas", () => {
    const html = renderToStaticMarkup(
      createElement(RangeBar, {
        low: 0.03,
        high: 0.06,
        point: 0.06,
        label: "score move",
        scale: "score",
        testId: "climb-range-band",
      }),
    );
    expect(html).toContain('data-testid="climb-range-band"');
    expect(html).toContain("Now 6 · projected 3 to 6");
    expect(html).toContain("most-likely 6, modeled range 3 to 6");
  });
});

describe("VerdictBlock", () => {
  it("maps the tier tone to the chip and renders headline, metric, and arrowed drivers", () => {
    const html = renderToStaticMarkup(
      createElement(VerdictBlock, {
        tone: "reach",
        chipLabel: "Reach",
        headline: "A genuine reach for your profile.",
        metric: "34/100",
        drivers: [
          { label: "Academics", direction: "up" },
          { label: "Selectivity", direction: "down" },
        ],
      }),
    );
    expect(html).toContain('data-tier="reach"');
    expect(html).toContain("Reach");
    expect(html).toContain("A genuine reach for your profile.");
    expect(html).toContain("34/100");
    expect(html).toContain('data-direction="up"');
    expect(html).toContain('data-direction="down"');
    expect(html).toContain("Academics");
    expect(html).toContain("Selectivity");
  });

  it("labels marketing samples as Illustration", () => {
    const html = renderToStaticMarkup(
      createElement(VerdictBlock, {
        tone: "target",
        chipLabel: "Target",
        headline: "A target.",
        sample: true,
      }),
    );
    expect(html).toContain("Illustration");
  });
});

describe("radarOneLineRead", () => {
  it("picks the real strongest and weakest axes from the data", () => {
    const axes: RadarAxis[] = [
      { key: "academics", label: "Academics", value: 82, reference: 80 },
      { key: "test", label: "Test", value: 40, reference: 78 },
      { key: "fit", label: "Fit", value: 60, reference: 55 },
    ];
    expect(radarOneLineRead(axes)).toBe("Strongest on Academics; stretch on Test.");
  });

  it("handles an empty axis set", () => {
    expect(radarOneLineRead([])).toContain("Not enough data");
  });
});

describe("mapDriverDirection", () => {
  it("maps engine driver directions to arrow directions", () => {
    expect(mapDriverDirection("positive")).toBe("up");
    expect(mapDriverDirection("negative")).toBe("down");
    expect(mapDriverDirection("neutral")).toBe("neutral");
  });
});
