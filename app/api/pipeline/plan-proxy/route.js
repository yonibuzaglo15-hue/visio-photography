import { NextResponse } from "next/server";
import { requireAllowedApi } from "@/lib/auth/require.js";
import {
  fetchBlobCached,
  isAllowedBlobHost,
  unwrapLocalBlobUrl,
} from "@/lib/storage/blob-local-cache.js";

/**
 * Same-origin proxy for floor-plan images so the editor can sample pixels
 * (content mask) without CORS tainting. Auth required. Host allow-listed.
 * Uses the local Blob disk cache in development.
 */
export async function GET(request) {
  const gate = await requireAllowedApi(request);
  if (gate.errorResponse) return gate.errorResponse;

  // Editor may pass a rewritten /api/dev/blob-cache?url=… path — unwrap first.
  const raw = request.nextUrl.searchParams.get("url");
  const url = raw ? unwrapLocalBlobUrl(raw) : null;
  if (!url) {
    return NextResponse.json({ ok: false, error: "url required" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid url" }, { status: 400 });
  }

  if (parsed.protocol !== "https:") {
    return NextResponse.json({ ok: false, error: "https only" }, { status: 400 });
  }

  if (!isAllowedBlobHost(parsed.toString())) {
    return NextResponse.json({ ok: false, error: "host not allowed" }, { status: 400 });
  }

  try {
    const hit = await fetchBlobCached(parsed.toString(), { timeoutMs: 30_000 });
    if (!hit) {
      return NextResponse.json(
        { ok: false, error: "upstream fetch failed" },
        { status: 502 }
      );
    }
    return new NextResponse(hit.buffer, {
      status: 200,
      headers: {
        "Content-Type": hit.contentType || "image/jpeg",
        "Cache-Control": "private, max-age=3600",
        "X-Visio-Blob-Cache": hit.fromCache ? "HIT" : "MISS",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err.message || "proxy failed" },
      { status: 502 }
    );
  }
}
