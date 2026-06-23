import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const UPSTREAM_HEADER_ALLOWLIST = new Set([
  "accept",
  "accept-profile",
  "apikey",
  "authorization",
  "content-profile",
  "content-type",
  "prefer",
  "range",
  "range-unit",
  "x-client-info",
  "x-supabase-api-version",
]);

type ProxyRequestPayload = {
  path?: string;
  method?: string;
  headers?: Record<string, string>;
  bodyBase64?: string | null;
};

function buildProxyError(message: string, status = 500) {
  return NextResponse.json({ error: "network_error", message }, { status });
}

function getTargetUrl(targetPath: string | undefined) {
  if (!supabaseUrl) {
    return { error: buildProxyError("Supabase URL is missing from server environment.") };
  }

  if (!targetPath || !targetPath.startsWith("/rest/v1/")) {
    return { error: buildProxyError("Proxy target path is invalid.", 400) };
  }

  const baseUrl = new URL(supabaseUrl);
  const targetUrl = new URL(targetPath, baseUrl);
  if (targetUrl.origin !== baseUrl.origin) {
    return { error: buildProxyError("Proxy target origin is not allowed.", 400) };
  }

  return { targetUrl };
}

async function forwardSupabaseRequest(payload: ProxyRequestPayload) {
  const normalizedMethod = (payload.method ?? "GET").toUpperCase();
  const { targetUrl, error } = getTargetUrl(payload.path);
  if (error) return error;

  const upstreamHeaders = new Headers();
  for (const [key, value] of Object.entries(payload.headers ?? {})) {
    if (UPSTREAM_HEADER_ALLOWLIST.has(key.toLowerCase())) {
      upstreamHeaders.set(key, value);
    }
  }

  const body =
    normalizedMethod === "GET" || normalizedMethod === "HEAD" || !payload.bodyBase64
      ? undefined
      : Uint8Array.from(Buffer.from(payload.bodyBase64, "base64"));

  try {
    const upstreamResponse = await fetch(targetUrl.toString(), {
      method: normalizedMethod,
      headers: upstreamHeaders,
      body,
      cache: "no-store",
      redirect: "manual",
    });

    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.delete("content-length");
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("transfer-encoding");
    responseHeaders.set("x-guimfinancial-supabase-rest-proxy", "1");

    const responseBody =
      normalizedMethod === "HEAD" ? null : await upstreamResponse.arrayBuffer();

    return new NextResponse(responseBody, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (requestError) {
    const message =
      requestError instanceof Error ? requestError.message : "Unknown proxy request failure.";
    return buildProxyError(`Cannot reach Supabase from proxy: ${message}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as ProxyRequestPayload;
    return forwardSupabaseRequest(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid proxy payload.";
    return buildProxyError(message, 400);
  }
}
