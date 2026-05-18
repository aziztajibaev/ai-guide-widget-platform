import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { getAdminProject, updateProject } from "@/lib/store";

export const dynamic = "force-dynamic";

const projectSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  domain: z.string().max(200).nullable().optional(),
  theme: z
    .object({
      accent: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
      logoText: z.string().min(1).max(40).optional()
    })
    .optional()
});

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await getAdminProject(session);

  if (!project) {
    return NextResponse.json({ error: "No project exists." }, { status: 404 });
  }

  return NextResponse.json(project);
}

export async function PATCH(request: Request) {
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

  const parsed = projectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const current = await getAdminProject(session);
  if (!current) {
    return NextResponse.json({ error: "No project exists." }, { status: 404 });
  }

  const project = await updateProject(current.publicId, parsed.data);
  return NextResponse.json(project);
}
