import { NextResponse } from "next/server";
import { z } from "zod";
import { corsHeaders } from "@/lib/cors";
import { addEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

const eventSchema = z.object({
  projectId: z.string().min(1),
  type: z.string().min(1).max(80),
  guideSlug: z.string().optional(),
  stepIndex: z.number().int().min(0).optional(),
  path: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders });
  }

  const parsed = eventSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400, headers: corsHeaders });
  }

  const ok = await addEvent({
    projectPublicId: parsed.data.projectId,
    type: parsed.data.type,
    guideSlug: parsed.data.guideSlug,
    stepIndex: parsed.data.stepIndex,
    path: parsed.data.path,
    metadata: parsed.data.metadata
  });

  if (!ok) {
    return NextResponse.json({ error: "Project not found" }, { status: 404, headers: corsHeaders });
  }

  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
