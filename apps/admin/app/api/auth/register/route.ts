import { NextResponse } from "next/server";
import { z } from "zod";
import {
  adminCookieOptions,
  adminSessionCookieName,
  createAdminSessionToken,
  registerAdminUser
} from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(120),
  projectName: z.string().min(2).max(120).optional()
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await registerAdminUser(parsed.data);
  if (!user) {
    return NextResponse.json({ error: "User already exists" }, { status: 409 });
  }

  const response = NextResponse.json({ ok: true, email: user.email });
  response.cookies.set(
    adminSessionCookieName,
    createAdminSessionToken(user.email, user.projectId),
    adminCookieOptions()
  );
  return response;
}
