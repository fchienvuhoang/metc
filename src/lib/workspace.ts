import type { BankWorkspace } from "@prisma/client";

export function publicCampaignListPath(workspace: BankWorkspace) {
  return workspace === "BIDV" ? "/thien-phap/bidv" : "/thien-phap";
}

export function publicCampaignPath(code: string, workspace: BankWorkspace = "VIB") {
  return `${publicCampaignListPath(workspace)}/${encodeURIComponent(code)}`;
}
