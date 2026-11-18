import type { BankWorkspace } from "@prisma/client";

export function publicCampaignListPath(workspace: BankWorkspace) {
  return workspace === "BIDV" ? "/thien-phap/acb" : "/thien-phap";
}

export function publicCampaignPath(code: string, workspace: BankWorkspace = "VIB") {
  return `${publicCampaignListPath(workspace)}/${encodeURIComponent(code)}`;
}

// Preserve the BIDV tenant key and all existing relationships after the bank switch.
export function workspaceBankName(workspace: BankWorkspace) {
  return workspace === "BIDV" ? "ACB" : "VIB";
}
