import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import {
  createReadonlySessionToken,
  getReadonlySessionMaxAge,
  READONLY_SESSION_COOKIE,
  verifyReadonlyAccessKey,
  verifyReadonlyPassword,
} from "@/lib/readonly-auth";

const schema = z.object({
  accessKey: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    if (!verifyReadonlyAccessKey(input.accessKey) || !verifyReadonlyPassword(input.password)) {
      return NextResponse.json({ error: "Mật khẩu không đúng." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(READONLY_SESSION_COOKIE, await createReadonlySessionToken(input.accessKey), {
      httpOnly: true,
      maxAge: getReadonlySessionMaxAge(),
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
