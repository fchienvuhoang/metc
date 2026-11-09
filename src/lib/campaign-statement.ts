import type { CampaignSummary } from "@/lib/dashboard";
import { publicCampaignPath } from "@/lib/workspace";

export function campaignStatementsText(campaigns: CampaignSummary[], appOrigin: string) {
  const selected = [...new Map(campaigns.map((campaign) => [campaign.id, campaign])).values()];
  if (!selected.length) return "";
  if (selected.some((campaign) => campaign.workspace !== selected[0].workspace)) {
    throw new Error("Chỉ gộp sao kê các thiện pháp trong cùng ngân hàng.");
  }
  const origin = appOrigin.replace(/\/$/, "");
  if (selected.length === 1) {
    const campaign = selected[0];
    return campaignStatementText(campaign, `${origin}${publicCampaignPath(campaign.code, campaign.workspace)}`);
  }
  const formatMoney = (amount: number) => new Intl.NumberFormat("vi-VN", {
    style: "currency", currency: "VND", maximumFractionDigits: 0,
  }).format(amount);
  const details = selected.map((campaign, index) => {
    const code = campaign.code.trim().toLocaleUpperCase("vi-VN");
    return `${index + 1}. ${code}: ${campaign.name.toLocaleUpperCase("vi-VN")}
💰 Tịnh tài đã ghi nhận: ${formatMoney(campaign.income)}
🔎 Chi tiết thu chi: ${origin}${publicCampaignPath(campaign.code, campaign.workspace)}`;
  }).join("\n\n");
  const totalIncome = selected.reduce((total, campaign) => total + campaign.income, 0);
  return `🏦 CẬP NHẬT SAO KÊ ${selected.length} THIỆN PHÁP · ${currentVietnamStatementDate()}

KÍNH CHÚC QUÝ VỊ NGÀY MỚI AN VUI TRONG CHÁNH PHÁP, THUẬN DUYÊN TẠO CÁC THIỆN NGHIỆP, VUN BỒI VÀ LÀM VIÊN MÃN CÁC PĀRAMĪ.
🙏 Kính mời quý vị cùng theo dõi thông tin thu chi mới nhất của các thiện pháp:

${details}

💰 Tổng tịnh tài đã ghi nhận của ${selected.length} thiện pháp: ${formatMoney(totalIncome)}

🌺 Sādhu! Sādhu! Sādhu! — Lành thay! Lành thay! Lành thay!
🌺 Idaṃ me puññaṃ nibbānassa paccayo hotu. — Nguyện phước báu này của tôi là duyên lành đưa đến Niết-bàn.
🌺 Buddhasāsanaṃ ciraṃ tiṭṭhatu. — Nguyện Giáo pháp của Đức Phật trường tồn lâu dài.`;
}

function campaignStatementText(campaign: CampaignSummary, publicUrl: string) {
  const date = currentVietnamStatementDate();
  const code = campaign.code.trim().toLocaleUpperCase("vi-VN");
  const income = new Intl.NumberFormat("vi-VN", {
    style: "currency", currency: "VND", maximumFractionDigits: 0,
  }).format(campaign.income);

  return `🏦 CẬP NHẬT SAO KÊ THIỆN PHÁP ${code} · ${date}

KÍNH CHÚC QUÝ VỊ NGÀY MỚI AN VUI TRONG CHÁNH PHÁP, THUẬN DUYÊN TẠO CÁC THIỆN NGHIỆP, VUN BỒI VÀ LÀM VIÊN MÃN CÁC PĀRAMĪ.
🙏 Kính mời quý vị cùng theo dõi thông tin thu chi mới nhất của thiện pháp ${code}: ${campaign.name.toLocaleUpperCase("vi-VN")}

💰 Số tịnh tài quý vị đồng phát tâm đóng góp hiện được ghi nhận là: ${income}
🔎 Thông tin chi tiết của từng khoản tịnh tài được cập nhật tại: ${publicUrl}

🌺 Sādhu! Sādhu! Sādhu! — Lành thay! Lành thay! Lành thay!
🌺 Idaṃ me puññaṃ nibbānassa paccayo hotu. — Nguyện phước báu này của tôi là duyên lành đưa đến Niết-bàn.
🌺 Buddhasāsanaṃ ciraṃ tiṭṭhatu. — Nguyện Giáo pháp của Đức Phật trường tồn lâu dài.`;
}

function currentVietnamStatementDate() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.day}.${values.month}.${values.year}`;
}

