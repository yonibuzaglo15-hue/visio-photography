import { NextResponse } from "next/server";
import {
  fetchBlobCached,
  isAllowedBlobHost,
  isBlobLocalCacheEnabled,
} from "@/lib/storage/blob-local-cache.js";

/**
 * Dev-only media proxy: serves Blob assets from the local disk cache.
 * Populates the cache on first miss. Disabled in production.
 *
 * Public (no auth) so /tour/[jobId] can load panoramas through localhost
 * instead of hitting Vercel Blob on every refresh.
 */
export async function GET(request) {
  if (!isBlobLocalCacheEnabled()) {
    return NextResponse.json(
      { ok: false, error: "blob local cache disabled" },
      { status: 404 }
    );
  }

  const url = request.nextUrl.searchParams.get("url");
  if (!url || !isAllowedBlobHost(url)) {
    return NextResponse.json({ ok: false, error: "url not allowed" }, { status: 400 });
  }

  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
  const hit = await fetchBlobCached(url, { forceRefresh, timeoutMs: 60_000 });
  if (!hit) {
    return NextResponse.json({ ok: false, error: "fetch failed" }, { status: 502 });
  }

  return new NextResponse(hit.buffer, {
    status: 200,
    headers: {
      "Content-Type": hit.contentType,
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Visio-Blob-Cache": hit.fromCache ? "HIT" : "MISS",
      // Allow canvas / crossOrigin Image loads from the same origin.
      "Access-Control-Allow-Origin": "*",
    },
  });
}
