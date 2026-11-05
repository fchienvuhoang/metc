import { createHash } from "node:crypto";

const VIB_STATEMENT_SUBJECT = "Sao kê tài khoản";
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_URL = "https://gmail.googleapis.com/gmail/v1/users/me";

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  filename?: string;
  mimeType?: string;
  headers?: GmailHeader[];
  body?: { attachmentId?: string; data?: string; size?: number };
  parts?: GmailPart[];
};
type GmailMessage = {
  id: string;
  internalDate?: string;
  payload?: GmailPart;
};

export type VibEmailStatement = {
  fileBuffer: Buffer;
  fileName: string;
  fingerprint: string;
  messageId: string;
  receivedAt: Date | null;
  sender: string | null;
};

export function isVibEmailConfigured() {
  return Boolean(
    process.env.GMAIL_CLIENT_ID && process.env.GMAIL_SECRET && process.env.GMAIL_RF_TOKEN,
  );
}

export async function getLatestVibStatementFromEmail(): Promise<VibEmailStatement> {
  const accessToken = await getGmailAccessToken();
  const query = `subject:"${VIB_STATEMENT_SUBJECT}" has:attachment filename:xlsx`;
  const list = await gmailRequest<{ messages?: Array<{ id: string }> }>(
    `/messages?q=${encodeURIComponent(query)}&maxResults=20`,
    accessToken,
  );

  for (const item of list.messages ?? []) {
    const message = await gmailRequest<GmailMessage>(
      `/messages/${encodeURIComponent(item.id)}?format=full`,
      accessToken,
    );
    const subject = getHeader(message.payload?.headers, "subject")?.trim();
    if (subject !== VIB_STATEMENT_SUBJECT) continue;

    const attachment = findExcelAttachment(message.payload);
    if (!attachment) continue;

    const fileBuffer = attachment.data
      ? decodeBase64Url(attachment.data)
      : attachment.attachmentId
        ? decodeBase64Url(
            (
              await gmailRequest<{ data?: string }>(
                `/messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(attachment.attachmentId)}`,
                accessToken,
              )
            ).data ?? "",
          )
        : Buffer.alloc(0);

    if (fileBuffer.length === 0) continue;
    if (fileBuffer.length > MAX_ATTACHMENT_BYTES) {
      throw new Error("File Excel đính kèm trong email VIB vượt quá dung lượng 10 MB.");
    }

    const receivedAt = message.internalDate ? new Date(Number(message.internalDate)) : null;
    return {
      fileBuffer,
      fileName: sanitizeFileName(attachment.filename),
      fingerprint: createHash("sha256").update(fileBuffer).digest("hex"),
      messageId: message.id,
      receivedAt: receivedAt && !Number.isNaN(receivedAt.getTime()) ? receivedAt : null,
      sender: getHeader(message.payload?.headers, "from") ?? null,
    };
  }

  throw new Error(
    `Không tìm thấy email mới có tiêu đề chính xác “${VIB_STATEMENT_SUBJECT}” và file Excel .xlsx đính kèm.`,
  );
}

async function getGmailAccessToken() {
  const clientId = requiredEnv("GMAIL_CLIENT_ID");
  const clientSecret = requiredEnv("GMAIL_SECRET");
  const refreshToken = requiredEnv("GMAIL_RF_TOKEN");
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(
      "Google từ chối thông tin Gmail OAuth. Hãy kiểm tra client ID, client secret, refresh token và quyền gmail.readonly.",
    );
  }
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Google không trả về access token Gmail.");
  return json.access_token;
}

async function gmailRequest<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${GMAIL_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("Refresh token chưa có quyền đọc Gmail (gmail.readonly).");
    }
    throw new Error(`Không đọc được Gmail (HTTP ${response.status}).`);
  }
  return response.json() as Promise<T>;
}

function findExcelAttachment(part: GmailPart | undefined): {
  filename: string;
  attachmentId?: string;
  data?: string;
} | null {
  if (!part) return null;
  if (part.filename?.toLowerCase().endsWith(".xlsx")) {
    return {
      filename: part.filename,
      attachmentId: part.body?.attachmentId,
      data: part.body?.data,
    };
  }
  for (const child of part.parts ?? []) {
    const attachment = findExcelAttachment(child);
    if (attachment) return attachment;
  }
  return null;
}

function getHeader(headers: GmailHeader[] | undefined, name: string) {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value;
}

function decodeBase64Url(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      "Chức năng Gmail chưa được cấu hình. Cần GMAIL_CLIENT_ID, GMAIL_SECRET và GMAIL_RF_TOKEN.",
    );
  }
  return value;
}

function sanitizeFileName(value: string) {
  const fileName = value.replace(/[\\/\0]/g, "_").trim();
  return fileName || "VIB_SaoKeTaiKhoan.xlsx";
}
