import { connection } from "next/server";
import { notFound } from "next/navigation";
import { RetreatCampaignTabs } from "@/components/retreat-campaign-tabs";
import { getCachedPublicCampaignData } from "@/lib/public-campaign";
import { RETREAT_CODES } from "@/lib/retreat-campaign";

export const metadata = {
  title: "Hộ trì các khóa thiền tại Hà Nội | MettaCitta",
  description: "Tra cứu 7 thiện pháp hộ trì khóa thiền KT00–KT06 trên cùng một trang.",
};

export default async function RetreatPage() {
  await connection();
  const results = await Promise.all(RETREAT_CODES.map(code => getCachedPublicCampaignData(code, "BIDV")));
  const campaigns = results.filter(item => item !== null);
  if (!campaigns.length) notFound();
  return <RetreatCampaignTabs campaigns={campaigns} />;
}
