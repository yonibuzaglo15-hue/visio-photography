import { NextResponse } from "next/server";
import { getJob } from "@/lib/pipeline/store.js";
import { requireAllowedApi } from "@/lib/auth/require.js";
import {
  detectPlanDots,
  isLocalCvAvailable,
  suggestPlanLinks,
} from "@/lib/tour/plan-assist.js";
import { fetchBlobCached } from "@/lib/storage/blob-local-cache.js";

const BLOB_HOST = "5ltyuhgj5vbqjxug.public.blob.vercel-storage.com";

function planUrlFromJob(job, floor) {
  const plans = job?.outputs?.floorPlans;
  if (!Array.isArray(plans) || !plans.length) return null;
  const f = Number.isFinite(Number(floor)) ? Number(floor) : null;
  const match =
    (f != null && plans.find((p) => Number(p.floor) === f)) || plans[0];
  return match?.url || null;
}

function unwrapProxyUrl(url) {
  if (!url) return null;
  try {
    if (url.includes("/api/dev/blob-cache")) {
      const u = new URL(url, "http://local");
      return u.searchParams.get("url") || url;
    }
  } catch {
    /* ignore */
  }
  return url;
}

function assertAllowedPlanUrl(url) {
  const raw = unwrapProxyUrl(url);
  if (!raw) return null;
  let host;
  try {
    host = new URL(raw).hostname;
  } catch {
    return null;
  }
  if (host !== BLOB_HOST && !host.endsWith(".public.blob.vercel-storage.com")) {
    return null;
  }
  return raw;
}

async function loadPlanBuffer(planUrl) {
  const allowed = assertAllowedPlanUrl(planUrl);
  if (!allowed) throw new Error("כתובת תוכנית לא מורשית");
  const cached = await fetchBlobCached(allowed, { timeoutMs: 30_000 });
  if (!cached?.buffer?.length) throw new Error("לא ניתן לטעון את התוכנית");
  return { buffer: cached.buffer, url: allowed };
}

/**
 * Local OpenCV assist — detect capture dots / suggest wall-aware links.
 * Suggestions only; the editor never writes them as final without confirmation.
 */
export async function POST(request, ctx) {
  const params = await ctx.params;
  const gate = await requireAllowedApi(request);
  if (gate.errorResponse) return gate.errorResponse;

  if (!isLocalCvAvailable()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "סיוע מקומי לתוכנית זמין רק במחשב עם OpenCV (python3 + cv2). לא רץ בפרודקשן.",
      },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const action = body?.action;
    const job = await getJob(params.id);
    const planUrl = body?.planUrl || planUrlFromJob(job, body?.floor);
    if (!planUrl) {
      return NextResponse.json(
        { ok: false, error: "אין תוכנית קומה ל-job זה" },
        { status: 400 }
      );
    }
    const { buffer, url } = await loadPlanBuffer(planUrl);

    if (action === "detect") {
      const result = await detectPlanDots(buffer);
      if (!result?.ok) {
        return NextResponse.json(
          { ok: false, error: result?.error || "זיהוי נכשל" },
          { status: 500 }
        );
      }
      return NextResponse.json({
        ok: true,
        action: "detect",
        planUrl: url,
        width: result.width,
        height: result.height,
        dotCount: result.dotCount,
        dots: result.dots,
      });
    }

    if (action === "suggestLinks") {
      const positions = Array.isArray(body?.positions) ? body.positions : [];
      if (positions.length < 2) {
        return NextResponse.json(
          { ok: false, error: "צריך לפחות שני מיקומים מאושרים" },
          { status: 400 }
        );
      }
      const result = await suggestPlanLinks(buffer, positions);
      if (!result?.ok) {
        return NextResponse.json(
          { ok: false, error: result?.error || "הצעת קישורים נכשלה" },
          { status: 500 }
        );
      }
      return NextResponse.json({
        ok: true,
        action: "suggestLinks",
        planUrl: url,
        linkCount: result.linkCount,
        diagonalCount: result.diagonalCount,
        links: result.links,
      });
    }

    return NextResponse.json(
      { ok: false, error: "action חייב להיות detect או suggestLinks" },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err.message || "שגיאה" },
      { status: 500 }
    );
  }
}
