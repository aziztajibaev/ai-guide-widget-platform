import { NextResponse } from "next/server";
import { z } from "zod";
import { aiProviderIds } from "@/lib/ai-providers";
import { corsHeaders } from "@/lib/cors";
import { getAdminSession } from "@/lib/auth";
import { getProjectAiProviderStatus } from "@/lib/openai";
import {
  getAdminProject,
  getAiProviderConnections,
  setActiveAiProvider,
  upsertAiProviderConnection
} from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const providerSchema = z.object({
  provider: z.union([z.enum(aiProviderIds), z.literal("rules")]),
  apiKey: z.string().max(5000).optional(),
  model: z.string().min(1).max(160).optional(),
  enabled: z.boolean().optional(),
  makeActive: z.boolean().optional()
});

async function providerDashboardPayload(session: { projectId?: string | null }) {
  const project = await getAdminProject(session);
  const connections = await getAiProviderConnections(session);

  if (!project || !connections) {
    return null;
  }

  return {
    ...(await getProjectAiProviderStatus(project.publicId)),
    activeProvider: connections.activeProvider,
    providers: connections.providers
  };
}

export async function GET() {
  const session = await getAdminSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const payload = await providerDashboardPayload(session);

  if (!payload) {
    return NextResponse.json({ error: "No project exists." }, { status: 404, headers: corsHeaders });
  }

  return NextResponse.json(payload, { headers: corsHeaders });
}

export async function POST(request: Request) {
  const session = await getAdminSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders });
  }

  const parsed = providerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400, headers: corsHeaders });
  }

  if (parsed.data.provider === "rules") {
    const updated = await setActiveAiProvider(session, "rules");

    if (!updated) {
      return NextResponse.json({ error: "No project exists." }, { status: 404, headers: corsHeaders });
    }

    return NextResponse.json(await providerDashboardPayload(session), { headers: corsHeaders });
  }

  const hasConnectionUpdate =
    parsed.data.apiKey !== undefined ||
    parsed.data.model !== undefined ||
    parsed.data.enabled !== undefined ||
    parsed.data.makeActive !== undefined;

  const updated = hasConnectionUpdate
    ? await upsertAiProviderConnection(session, {
        provider: parsed.data.provider,
        apiKey: parsed.data.apiKey,
        model: parsed.data.model,
        enabled: parsed.data.enabled,
        makeActive: parsed.data.makeActive
      })
    : await setActiveAiProvider(session, parsed.data.provider);

  if (!updated) {
    return NextResponse.json(
      { error: "Add a token before making this provider active." },
      { status: 400, headers: corsHeaders }
    );
  }

  return NextResponse.json(await providerDashboardPayload(session), { headers: corsHeaders });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
