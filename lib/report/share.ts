import { createHash, randomBytes } from "node:crypto";

export function createReportShareToken() {
  return randomBytes(32).toString("base64url");
}

export function hashReportShareToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function reportSharePath(token: string) {
  return `/api/reports/share/${encodeURIComponent(token)}`;
}
