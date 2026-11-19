import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PublicCampaignView } from "@/components/public-campaign-view";
import { getCachedPublicCampaignData } from "@/lib/public-campaign";
import { RETREAT_CODES } from "@/lib/retreat-campaign";
import { BrandLogo } from "@/components/brand-logo";

export const metadata = {
  title: "Hộ trì các khóa thiền tại Hà Nội | MettaCitta",
  description: "Tra cứu 7 thiện pháp hộ trì khóa thiền KT00–KT06 trên cùng một trang.",
};

export default async function RetreatPage() {
  await connection();
  const results = await Promise.all(RETREAT_CODES.map(code => getCachedPublicCampaignData(code, "BIDV")));
  const campaigns = results.filter(item => item !== null);
  if (!campaigns.length) notFound();
  return (
    <div className="min-h-screen bg-[#fff8fb] text-[#4a1838]">
      <header className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <BrandLogo className="h-20 w-20" priority />
        <h1 className="mt-4 text-2xl font-bold sm:text-3xl">Hộ trì các khóa thiền tại Hà Nội</h1>
        <p className="mt-2 text-sm leading-6 text-[#75606e]">Hộ trì 03 khóa tu học tại Hà Nội — cuối năm 2026, đầu năm 2027.</p>
        <nav aria-label="Các thiện pháp khóa thiền" className="mt-5 flex flex-wrap gap-2">
          {campaigns.map(campaign => (
            <a key={campaign.code} href={`#${campaign.code}`} className="rounded-lg border border-[#edcddb] bg-white px-3 py-2 text-sm hover:border-[#a3315f]">
              <span className="mr-2 font-semibold uppercase">{campaign.code}</span>{campaign.name}
            </a>
          ))}
        </nav>
      </header>
      <div className="space-y-8 pb-8">
        {campaigns.map(campaign => (
          <section id={campaign.code} key={campaign.code} aria-label={`${campaign.code} · ${campaign.name}`} className="scroll-mt-4 border-t border-[#edcddb]">
            <PublicCampaignView data={campaign} embedded />
          </section>
        ))}
      </div>
    </div>
  );
}
