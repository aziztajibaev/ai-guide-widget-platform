import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { getAdminProject, upsertDocument } from "@/lib/store";

export const dynamic = "force-dynamic";

const documentSchema = z.object({
  projectId: z.string().min(1),
  id: z.string().optional(),
  title: z.string().min(1).max(120),
  content: z.string().min(1).max(12000),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  enabled: z.boolean().default(true)
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

  const parsed = documentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const project = await getAdminProject(session);
  if (!project || project.publicId !== parsed.data.projectId) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const document = await upsertDocument({
    projectPublicId: project.publicId,
    id: parsed.data.id,
    title: parsed.data.title,
    content: parsed.data.content,
    tags: parsed.data.tags,
    enabled: parsed.data.enabled
  });

  if (!document) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, document });
}
