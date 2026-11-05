import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getWorkspaceFromRequest } from "@/lib/auth";
import { importVibStatement } from "@/lib/importer";
import {
  invalidatePublicCampaignCache,
  warmPublicCampaignCaches,
} from "@/lib/public-campaign";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    await getWorkspaceFromRequest(request);
    const file = formData.get("statementFile");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Vui lòng chọn file sao kê VIB." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ error: "Chỉ hỗ trợ file Excel .xlsx xuất từ VIB." }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File sao kê vượt quá dung lượng 10 MB." }, { status: 400 });
    }

    const result = await importVibStatement(Buffer.from(await file.arrayBuffer()), file.name);
    if (result.insertedRows > 0) {
      const affectedCodes = invalidatePublicCampaignCache(result.affectedCampaignCodes);
      await warmPublicCampaignCaches(affectedCodes);
    }

    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
