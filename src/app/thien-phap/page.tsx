import { PublicCampaignList } from "@/components/public-campaign-list";

export const metadata = {
  title: "Các thiện pháp đang thực hiện | MettaCitta",
  description: "Danh sách các thiện pháp đang được MettaCitta thực hiện.",
};

export default function ActiveCampaignsPage() {
  return <PublicCampaignList workspace="VIB" />;
}
