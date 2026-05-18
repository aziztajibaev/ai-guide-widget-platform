import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { getAdminProject, upsertGuide } from "@/lib/store";

export const dynamic = "force-dynamic";

const stepSchema = z.object({
  target: z.string().min(1),
  message: z.string().min(1),
  robotState: z.enum([
    "idle",
    "talking",
    "pointing",
    "pointing-left",
    "pointing-right",
    "thinking",
    "success",
    "error"
  ]),
  placement: z.enum(["auto", "top", "right", "bottom", "left"]),
  waitFor: z.enum(["click", "focus", "visible", "manual"])
});

const guideSchema = z.object({
  projectId: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  intent: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  urlPattern: z.string().optional().nullable(),
  steps: z.array(stepSchema).min(1)
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

  const parsed = guideSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const project = await getAdminProject(session);
  if (!project || project.publicId !== parsed.data.projectId) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const guide = await upsertGuide({
    projectPublicId: project.publicId,
    slug: parsed.data.slug,
    title: parsed.data.title,
    intent: parsed.data.intent,
    aliases: parsed.data.aliases,
    urlPattern: parsed.data.urlPattern || null,
    steps: parsed.data.steps
  });

  if (!guide) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, guide });
}
