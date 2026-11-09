import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getWorkspaceFromRequest } from "@/lib/auth";
import { importBankStatement } from "@/lib/importer";
import {
  invalidatePublicCampaignCache,
  warmPublicCampaignCaches,
} from "@/lib/public-campaign";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const workspace = await getWorkspaceFromRequest(request);
    const file = formData.get("statementFile");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: `Vui lòng chọn file sao kê ${workspace}.` }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ error: `Chỉ hỗ trợ file Excel .xlsx xuất từ ${workspace}.` }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File sao kê vượt quá dung lượng 10 MB." }, { status: 400 });
    }

    const result = await importBankStatement(Buffer.from(await file.arrayBuffer()), file.name, workspace, typeof formData.get("password") === "string" ? String(formData.get("password")) : undefined);
    if (result.insertedRows > 0) {
      const affectedCodes = invalidatePublicCampaignCache(result.affectedCampaignCodes, workspace);
      await warmPublicCampaignCaches(affectedCodes, workspace);
    }

    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
