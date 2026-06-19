import type { Metadata } from "next";

import { FittyApp } from "./fitty-app";

export const metadata: Metadata = {
  title: {
    absolute: "Fit and Honest Chance | Fitty",
  },
  description:
    "Fitty renders school fit evidence beside honest college admissions chance ranges.",
};

export default function Home() {
  return <FittyApp />;
}
