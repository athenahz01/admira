import type { Metadata } from "next";

import { FittyApp } from "./fitty-app";

export const metadata: Metadata = {
  title: {
    absolute: "Admissions Almanac | Fitty",
  },
  description:
    "Fitty renders honest college admissions odds as public-data prior ranges with levers, gaps, and uncertainty disclosures.",
};

export default function Home() {
  return <FittyApp />;
}
