import { NextResponse } from "next/server";
import { z } from "zod";
import {
  adminCookieOptions,
  adminSessionCookieName,
  createAdminSessionToken,
  verifyAdminCredentials
} from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const verified = await verifyAdminCredentials(parsed.data.email, parsed.data.password);
  if (!verified) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, email: verified.email });
  response.cookies.set(
    adminSessionCookieName,
    createAdminSessionToken(verified.email, verified.projectId),
    adminCookieOptions()
  );
  return response;
}
