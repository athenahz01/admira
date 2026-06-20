import type { Metadata } from "next";

import { AdmiraApp } from "./admira-app";

export const metadata: Metadata = {
  title: {
    absolute: "Fit and Honest Chance | Admira",
  },
  description:
    "Admira renders school fit evidence beside honest college admissions chance ranges.",
};

export default function Home() {
  return <AdmiraApp />;
}
