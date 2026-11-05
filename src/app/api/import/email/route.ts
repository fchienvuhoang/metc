import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getWorkspaceFromRequest } from "@/lib/auth";
import { importVibStatement } from "@/lib/importer";
import { decimalToNumber } from "@/lib/money";
import { getPrisma } from "@/lib/prisma";
import {
  invalidatePublicCampaignCache,
  warmPublicCampaignCaches,
} from "@/lib/public-campaign";
import { getLatestVibStatementFromEmail, isVibEmailConfigured } from "@/lib/vib-email";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    await getWorkspaceFromRequest(request);
    return NextResponse.json({ configured: isVibEmailConfigured() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await getWorkspaceFromRequest(request);
    const statement = await getLatestVibStatementFromEmail();
    const prisma = getPrisma();
    const sourceLabel = `Email VIB ${statement.fingerprint.slice(0, 16)} - ${statement.fileName}`;
    const existingBatch = await prisma.importBatch.findFirst({
      where: { workspace: "VIB", sourceLabel },
      include: { account: { select: { accountNumber: true } } },
      orderBy: { importedAt: "desc" },
    });

    if (existingBatch) {
      return NextResponse.json({
        batchId: existingBatch.id,
        sourceLabel: existingBatch.sourceLabel,
        totalRows: existingBatch.totalRows,
        insertedRows: existingBatch.insertedRows,
        duplicateRows: existingBatch.duplicateRows,
        unmatchedRows: existingBatch.unmatchedRows,
        accountNumber: existingBatch.account?.accountNumber ?? null,
        closingBalance: decimalToNumber(existingBatch.closingBalance),
        affectedCampaignCodes: [],
        alreadyImported: true,
        emailReceivedAt: statement.receivedAt?.toISOString() ?? null,
        emailSender: statement.sender,
      });
    }

    const result = await importVibStatement(statement.fileBuffer, sourceLabel);
    if (result.insertedRows > 0) {
      const affectedCodes = invalidatePublicCampaignCache(result.affectedCampaignCodes);
      await warmPublicCampaignCaches(affectedCodes);
    }

    return NextResponse.json({
      ...result,
      alreadyImported: false,
      emailReceivedAt: statement.receivedAt?.toISOString() ?? null,
      emailSender: statement.sender,
    });
  } catch (error) {
    return apiError(error);
  }
}
