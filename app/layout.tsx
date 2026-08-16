import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { getCurrentMarket } from "@/lib/current-market";
import "./globals.css";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const { config } = getCurrentMarket();
  return {
    title: { default: `${config.city.name} Buyer Decision Suite`, template: `%s | ${config.city.name} Buyer Suite` },
    description: `Six transparent ${config.city.name}, Connecticut housing indicators built from official Zillow Research and FRED/Freddie Mac data.`,
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}><body>{children}</body></html>;
}
