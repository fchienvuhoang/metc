import { normalizeTransferText } from "@/lib/text";

export function campaignTransferContent(name: string, code: string) {
  const normalizedName = normalizeTransferText(name);
  const transferName = normalizedName.replace(/^(?:cung duong|cd)\s+/, "");
  return `Parami group cd ${transferName || code.trim()} - ${code.trim()}`;
}
