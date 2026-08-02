"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HouseLine, MapPin } from "@phosphor-icons/react";

const pages = [
  { href: "/", label: "Market balance" },
  { href: "/offer-leverage", label: "Offer leverage" },
  { href: "/budget-reach", label: "$500K reach" },
  { href: "/affordability-stress", label: "Monthly stress" },
  { href: "/buy-vs-rent", label: "Buy vs rent" },
  { href: "/buy-now-vs-wait", label: "Buy now or wait" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="site-header">
      <div className="topbar">
        <Link className="brand" href="/" aria-label="Brookfield Buyer Decision Suite home">
          <span className="brand-mark"><HouseLine size={18} weight="bold" /></span>
          <span>Brookfield Buyer Suite</span>
        </Link>
        <div className="location"><MapPin size={16} weight="fill" /> Brookfield, CT</div>
      </div>
      <nav className="suite-nav" aria-label="Buyer decision indicators">
        <div className="suite-nav-inner">
          {pages.map((page) => (
            <Link key={page.href} href={page.href} aria-current={pathname === page.href ? "page" : undefined}>
              {page.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
