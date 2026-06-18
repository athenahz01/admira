import type { Metadata } from "next";
import { JetBrains_Mono, Literata, Public_Sans } from "next/font/google";
import "./globals.css";

const literata = Literata({
  variable: "--font-almanac-heading",
  subsets: ["latin"],
});

const publicSans = Public_Sans({
  variable: "--font-almanac-body",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-almanac-data",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Fitty | Admissions Almanac",
    template: "%s | Fitty",
  },
  description:
    "Honest college admissions odds rendered as public-data prior ranges, levers, and uncertainty disclosures.",
  applicationName: "Fitty",
  openGraph: {
    title: "Fitty | Admissions Almanac",
    description:
      "College admissions planning ranges grounded in public data, with clear limits on what cannot be known.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${literata.variable} ${publicSans.variable} ${jetBrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body
        className="antialiased"
      >
        {children}
      </body>
    </html>
  );
}
