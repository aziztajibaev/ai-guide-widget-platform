import { NextResponse } from "next/server";
import { z } from "zod";
import { corsHeaders } from "@/lib/cors";
import { chooseGuideWithAi } from "@/lib/openai";
import { getKnowledgeDocuments } from "@/lib/store";

export const dynamic = "force-dynamic";

const askSchema = z.object({
  projectId: z.string().min(1),
  question: z.string().min(1).max(500),
  path: z.string().optional().default(""),
  pageLanguage: z.string().max(32).optional().default(""),
  mode: z.enum(["start", "next"]).optional().default("start"),
  completedSteps: z
    .array(
      z.object({
        target: z.string(),
        message: z.string(),
        robotState: z.enum(["idle", "talking", "pointing", "pointing-left", "pointing-right", "thinking", "success", "error"]),
        placement: z.enum(["auto", "top", "right", "bottom", "left"]),
        waitFor: z.enum(["click", "focus", "visible", "manual"])
      })
    )
    .max(20)
    .optional()
    .default([]),
  metadata: z
    .array(
      z.object({
        ref: z.string().optional(),
        selector: z.string(),
        role: z.string().optional(),
        label: z.string().optional(),
        text: z.string().optional(),
        tagName: z.string()
      })
    )
    .max(120)
    .optional()
    .default([])
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders });
  }

  const parsed = askSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400, headers: corsHeaders });
  }

  const documents = await getKnowledgeDocuments(parsed.data.projectId);

  if (!documents) {
    return NextResponse.json({ error: "Project not found" }, { status: 404, headers: corsHeaders });
  }

  const decision = await chooseGuideWithAi({
    projectId: parsed.data.projectId,
    question: parsed.data.question,
    documents,
    path: parsed.data.path,
    pageLanguage: parsed.data.pageLanguage,
    metadata: parsed.data.metadata,
    completedSteps: parsed.data.completedSteps,
    mode: parsed.data.mode
  });
  const guide = decision.guide;

  if (decision.answer) {
    return NextResponse.json(
      {
        type: "answer",
        source: decision.source,
        message: decision.answer
      },
      { headers: corsHeaders }
    );
  }

  if (!guide) {
    return NextResponse.json(
      {
        type: "fallback",
        source: decision.source,
        message:
          parsed.data.mode === "next"
            ? "Done. I do not see another safe step on this screen."
            : "I could not find a safe visible element for that task. Try asking in a different way."
      },
      { headers: corsHeaders }
    );
  }

  return NextResponse.json(
    {
      type: "guide",
      source: decision.source,
      message: guide.steps[0]?.message ?? guide.title,
      guide
    },
    { headers: corsHeaders }
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
