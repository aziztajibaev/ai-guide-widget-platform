import { NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { getPublicWidgetConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

function normalizeHostname(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
}

function requestHostname(request: Request) {
  for (const header of ["origin", "referer"]) {
    const value = request.headers.get(header);
    if (!value) continue;
    try {
      return new URL(value).hostname.toLowerCase();
    } catch {
      return normalizeHostname(value);
    }
  }

  return null;
}

function isAllowedDomain(configuredDomain: string | null, request: Request) {
  if (!configuredDomain) {
    return true;
  }

  const allowed = normalizeHostname(configuredDomain);
  const hostname = requestHostname(request);

  if (!hostname) {
    return true;
  }

  if (allowed === "localhost") {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  }

  return hostname === allowed || hostname.endsWith(`.${allowed}`);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400, headers: corsHeaders });
  }

  const config = await getPublicWidgetConfig(projectId);

  if (!config) {
    return NextResponse.json({ error: "Project not found" }, { status: 404, headers: corsHeaders });
  }

  if (!isAllowedDomain(config.domain, request)) {
    return NextResponse.json({ error: "Origin is not allowed for this project" }, { status: 403, headers: corsHeaders });
  }

  return NextResponse.json(config, {
    headers: {
      ...corsHeaders,
      "Cache-Control": "public, max-age=30"
    }
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
