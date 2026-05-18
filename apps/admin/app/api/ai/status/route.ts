import { NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { getAdminSession } from "@/lib/auth";
import { getProjectAiProviderStatus } from "@/lib/openai";
import { getAdminProject } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const project = await getAdminProject(session);

  return NextResponse.json(await getProjectAiProviderStatus(project?.publicId), { headers: corsHeaders });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
