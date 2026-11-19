"use client";

import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { PublicCampaignView } from "@/components/public-campaign-view";
import type { PublicCampaignData } from "@/lib/public-campaign";

export function RetreatCampaignTabs({ campaigns }: { campaigns: PublicCampaignData[] }) {
  const [activeCode, setActiveCode] = useState(campaigns[0]?.code);

  useEffect(() => {
    function readHash() {
      const code = window.location.hash.slice(1);
      if (campaigns.some(campaign => campaign.code === code)) setActiveCode(code);
    }
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, [campaigns]);

  function selectTab(code: string) {
    setActiveCode(code);
    window.history.replaceState(null, "", `#${code}`);
  }

  return (
    <div className="min-h-screen bg-[#fff8fb] text-[#4a1838]">
      <header className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <BrandLogo className="h-20 w-20" priority />
        <h1 className="mt-4 text-2xl font-bold sm:text-3xl">Hộ trì các khóa thiền tại Hà Nội</h1>
        <p className="mt-2 text-sm leading-6 text-[#75606e]">Hộ trì 03 khóa tu học tại Hà Nội — cuối năm 2026, đầu năm 2027.</p>
        <div role="tablist" aria-label="Các thiện pháp khóa thiền" className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
          {campaigns.map((campaign, index) => (
            <button
              key={campaign.code}
              id={`tab-${campaign.code}`}
              type="button"
              role="tab"
              aria-selected={activeCode === campaign.code}
              aria-controls={`panel-${campaign.code}`}
              tabIndex={activeCode === campaign.code ? 0 : -1}
              onClick={() => selectTab(campaign.code)}
              onKeyDown={event => {
                let next = index;
                if (event.key === "ArrowRight") next = (index + 1) % campaigns.length;
                else if (event.key === "ArrowLeft") next = (index + campaigns.length - 1) % campaigns.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = campaigns.length - 1;
                else return;
                event.preventDefault();
                selectTab(campaigns[next].code);
                document.getElementById(`tab-${campaigns[next].code}`)?.focus();
              }}
              className="min-w-0 rounded-xl border-2 border-[#edcddb] bg-white p-3 text-left text-sm shadow-sm transition-colors hover:border-[#a3315f] hover:bg-[#fceef4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a3315f] aria-selected:border-[#4c173b] aria-selected:bg-[#4c173b] aria-selected:text-white aria-selected:shadow-md sm:p-4"
            >
              <span className="block text-xs font-bold uppercase tracking-wide opacity-80">{campaign.code}</span>
              <span className="mt-1.5 block break-words whitespace-normal font-semibold leading-5">{campaign.name}</span>
            </button>
          ))}
        </div>
      </header>
      {campaigns.map(campaign => (
        <section
          key={campaign.code}
          id={`panel-${campaign.code}`}
          role="tabpanel"
          aria-labelledby={`tab-${campaign.code}`}
          hidden={activeCode !== campaign.code}
          tabIndex={0}
          className="border-t border-[#edcddb] pb-8 focus-visible:outline-2 focus-visible:outline-[#a3315f]"
        >
          {activeCode === campaign.code ? <PublicCampaignView key={campaign.code} data={campaign} embedded /> : null}
        </section>
      ))}
    </div>
  );
}
