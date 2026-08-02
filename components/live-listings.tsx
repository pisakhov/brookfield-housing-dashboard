"use client";

import { useEffect, useState } from "react";
import { ArrowSquareOut, Clock } from "@phosphor-icons/react";

type Listing = {
  id: string;
  url: string;
  image: string | null;
  address: string;
  price: number;
  priceFormatted: string;
  beds: number | null;
  baths: number | null;
  area: number | null;
  daysOnZillow: number | null;
  homeType: string;
  statusText: string;
  broker: string | null;
};

type ListingsPayload = { status: "ready" | "initializing"; fetchedAt: string | null; listings: Listing[] };

export function LiveListings({ compact = false }: { compact?: boolean }) {
  const [payload, setPayload] = useState<ListingsPayload | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/listings", { cache: "no-store" });
        if (!response.ok) throw new Error(`Listings returned ${response.status}`);
        const result = await response.json() as ListingsPayload;
        if (active) { setPayload(result); setError(false); }
      } catch {
        if (active) setError(true);
      }
    };
    void load();
    const timer = window.setInterval(load, 5 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const listings = compact ? payload?.listings.slice(0, 6) : payload?.listings;
  return (
    <section className="listings-section" aria-labelledby="listings-title">
      <div className="listings-heading">
        <div>
          <h2 id="listings-title">Homes under $500K right now</h2>
          <p>Live Brookfield search results, refreshed every 48 hours and linked to Zillow.</p>
        </div>
        {payload?.status === "ready" && payload.fetchedAt && (
          <div className="listings-freshness"><Clock size={15} /> Checked {new Date(payload.fetchedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
        )}
      </div>
      {!payload && !error && <div className="listing-skeletons" aria-label="Loading current listings"><i /><i /><i /></div>}
      {(error || payload?.status === "initializing") && (
        <div className="listings-empty"><strong>{error ? "Current listings are temporarily unavailable." : "The first listing refresh is running."}</strong><p>The official market indicators remain available, and a failed refresh never overwrites the last valid listing snapshot.</p></div>
      )}
      {payload?.status === "ready" && listings && listings.length > 0 && (
        <>
          <div className="listing-count"><strong>{payload.listings.length}</strong> matching homes found{compact && payload.listings.length > listings.length ? `; showing ${listings.length}` : ""}</div>
          <div className="listing-grid">
            {listings.map((listing) => (
              <a className="listing-card" href={listing.url} target="_blank" rel="noopener noreferrer" key={listing.id}>
                <div className="listing-image">
                  {listing.image ? <img src={listing.image} alt={`Listing at ${listing.address}`} loading="lazy" referrerPolicy="no-referrer" /> : <span>Photo unavailable</span>}
                  <em>{listing.statusText}</em>
                </div>
                <div className="listing-body">
                  <div className="listing-price"><strong>{listing.priceFormatted}</strong><ArrowSquareOut size={18} /></div>
                  <p>{listing.address}</p>
                  <div className="listing-facts">
                    {listing.beds != null && <span><b>{listing.beds}</b> bd</span>}
                    {listing.baths != null && <span><b>{listing.baths}</b> ba</span>}
                    {listing.area != null && <span><b>{listing.area.toLocaleString()}</b> sq ft</span>}
                  </div>
                  <div className="listing-meta"><span>{listing.daysOnZillow == null ? "New listing" : `${listing.daysOnZillow} ${listing.daysOnZillow === 1 ? "day" : "days"} on Zillow`}</span><span>{listing.broker || "Broker listed"}</span></div>
                </div>
              </a>
            ))}
          </div>
          <p className="listing-disclaimer">These live cards are not an official Zillow Research series and do not enter any custom score. Availability and details can change. Verify each property on the linked Zillow page.</p>
        </>
      )}
    </section>
  );
}
