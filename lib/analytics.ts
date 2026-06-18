export type AnalyticsEventName =
  | "page_view"
  | "profile_completed"
  | "school_added"
  | "methodology_viewed";

type AnalyticsPrimitive = string | number | boolean;
type AnalyticsProperties = Record<string, AnalyticsPrimitive | null | undefined>;

const allowedPropertyKeys = new Set([
  "application_round",
  "has_test_signal",
  "path",
  "result_count",
  "surface",
]);

const blockedPropertyPattern =
  /act|email|gpa|name|phone|sat|school|score|state|unitid|zip/i;

export function trackEvent(
  event: AnalyticsEventName,
  properties: AnalyticsProperties = {},
) {
  if (
    typeof window === "undefined" ||
    process.env.NEXT_PUBLIC_FITTY_ANALYTICS_DEBUG !== "true"
  ) {
    return;
  }

  console.info("[fitty-analytics]", {
    event,
    properties: sanitizeAnalyticsProperties(properties),
  });
}

export function sanitizeAnalyticsProperties(properties: AnalyticsProperties) {
  return Object.fromEntries(
    Object.entries(properties).filter(([key, value]) => {
      if (
        value === null ||
        value === undefined ||
        !allowedPropertyKeys.has(key) ||
        blockedPropertyPattern.test(key)
      ) {
        return false;
      }

      return ["string", "number", "boolean"].includes(typeof value);
    }),
  ) as Record<string, AnalyticsPrimitive>;
}
