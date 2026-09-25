import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  isBlobLocalCacheEnabled,
  normalizeBlobUrl,
  writeBlobCache,
  readBlobCache,
  invalidateBlobCache,
  localBlobProxyPath,
  unwrapLocalBlobUrl,
  rewriteEditorBlobUrls,
  unwrapEditorBlobUrls,
  fetchBlobJsonCached,
} from "../lib/storage/blob-local-cache.js";

const SAMPLE =
  "https://5ltyuhgj5vbqjxug.public.blob.vercel-storage.com/tours/job_x/tour.json";

describe("blob-local-cache", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env.NODE_ENV = prev.NODE_ENV;
    process.env.VERCEL_ENV = prev.VERCEL_ENV;
    process.env.BLOB_LOCAL_CACHE = prev.BLOB_LOCAL_CACHE;
  });

  it("is impossible in production even with BLOB_LOCAL_CACHE=1", () => {
    expect(
      isBlobLocalCacheEnabled({
        NODE_ENV: "production",
        BLOB_LOCAL_CACHE: "1",
      })
    ).toBe(false);
  });

  it("is on by default in development", () => {
    expect(
      isBlobLocalCacheEnabled({
        NODE_ENV: "development",
      })
    ).toBe(true);
  });

  it("normalizes cache-bust query params", () => {
    expect(normalizeBlobUrl(`${SAMPLE}?_=123&t=9`)).toBe(SAMPLE);
  });

  it("round-trips disk cache", () => {
    process.env.NODE_ENV = "development";
    delete process.env.VERCEL_ENV;
    delete process.env.BLOB_LOCAL_CACHE;
    invalidateBlobCache(SAMPLE);
    writeBlobCache(SAMPLE, Buffer.from('{"ok":true}'), "application/json");
    const hit = readBlobCache(SAMPLE);
    expect(hit?.fromCache).toBe(true);
    expect(hit.buffer.toString()).toBe('{"ok":true}');
    invalidateBlobCache(SAMPLE);
    expect(readBlobCache(SAMPLE)).toBeNull();
  });

  it("builds a same-origin proxy path in development", () => {
    process.env.NODE_ENV = "development";
    const p = localBlobProxyPath(SAMPLE);
    expect(p.startsWith("/api/dev/blob-cache?url=")).toBe(true);
  });

  it("fetches tour.json network-first with a cache-buster, disk only as fallback", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.VERCEL_ENV;
    delete process.env.BLOB_LOCAL_CACHE;
    invalidateBlobCache(SAMPLE);
    writeBlobCache(SAMPLE, Buffer.from('{"v":"stale"}'), "application/json");

    const seen = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      seen.push(String(url));
      return new Response('{"v":"fresh"}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    try {
      expect(await fetchBlobJsonCached(SAMPLE)).toEqual({ v: "fresh" });
      expect(seen[0]).toMatch(/[?&]_=\d+/);

      globalThis.fetch = async () => {
        throw new Error("offline");
      };
      expect(await fetchBlobJsonCached(SAMPLE)).toEqual({ v: "fresh" });
    } finally {
      globalThis.fetch = realFetch;
      invalidateBlobCache(SAMPLE);
    }
  });

  it("serves a just-published (authoritative) tour.json over a stale CDN copy", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.VERCEL_ENV;
    delete process.env.BLOB_LOCAL_CACHE;
    invalidateBlobCache(SAMPLE);
    writeBlobCache(SAMPLE, Buffer.from('{"v":"published"}'), "application/json", {
      authoritative: true,
    });
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response('{"v":"cdn-stale"}', { status: 200 });
    };
    try {
      expect(await fetchBlobJsonCached(SAMPLE)).toEqual({ v: "published" });
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = realFetch;
      invalidateBlobCache(SAMPLE);
    }
  });

  it("unwraps proxy paths so publish never stores them", () => {
    process.env.NODE_ENV = "development";
    delete process.env.VERCEL_ENV;
    delete process.env.BLOB_LOCAL_CACHE;
    const scenes = [{ id: "s0", panoramaUrl: SAMPLE }];
    const floorPlans = [{ floor: 0, url: SAMPLE }];
    const rewritten = rewriteEditorBlobUrls(scenes, floorPlans);
    expect(rewritten.scenes[0].panoramaUrl).toContain("/api/dev/blob-cache");
    const back = unwrapEditorBlobUrls(rewritten.scenes, rewritten.floorPlans);
    expect(back.scenes[0].panoramaUrl).toBe(SAMPLE);
    expect(back.floorPlans[0].url).toBe(SAMPLE);
    expect(unwrapLocalBlobUrl(SAMPLE)).toBe(SAMPLE);
  });
});
