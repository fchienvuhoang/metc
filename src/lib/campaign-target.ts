import { z } from "zod";

export const campaignTargetSchema = z.number().finite().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional();

export function campaignProgress(income: number, target: number | null | undefined) {
  if (!target || target <= 0) return null;
  const percent = Math.max(0, income / target * 100);
  return { percent, barPercent: Math.min(100, percent), remaining: Math.max(0, target - income) };
}
