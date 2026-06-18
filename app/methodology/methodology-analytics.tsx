"use client";

import { useEffect } from "react";

import { trackEvent } from "@/lib/analytics";

export function MethodologyAnalytics() {
  useEffect(() => {
    trackEvent("page_view", { path: "/methodology" });
    trackEvent("methodology_viewed", { path: "/methodology" });
  }, []);

  return null;
}
