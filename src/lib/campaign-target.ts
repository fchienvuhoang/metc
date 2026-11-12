import { z } from "zod";

export const campaignTargetSchema = z.number().finite().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional();

export function formatCampaignTarget(value: string | number) {
  const digits = String(value).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function parseCampaignTarget(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

export function campaignProgress(income: number, target: number | null | undefined) {
  if (!target || target <= 0) return null;
  const percent = Math.max(0, income / target * 100);
  return { percent, barPercent: Math.min(100, percent), remaining: Math.max(0, target - income) };
}
