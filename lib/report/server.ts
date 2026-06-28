import "server-only";

export function reportsEnabled() {
  return process.env.ADMIRA_REPORTS_ENABLED === "true";
}
