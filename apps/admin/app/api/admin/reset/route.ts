import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { getAdminProject, resetProjectToSeed } from "@/lib/store";

export const dynamic = "force-dynamic";

const resetSchema = z.object({
  confirm: z.literal("RESET_DEMO")
});

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Type RESET_DEMO to reset the demo." }, { status: 400 });
  }

  const current = await getAdminProject(session);
  if (!current || current.publicId !== "demo-project") {
    return NextResponse.json({ error: "Reset is available only for the demo project." }, { status: 400 });
  }

  const project = await resetProjectToSeed(session);
  if (!project) {
    return NextResponse.json({ error: "Demo seed data is missing." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, project });
}
