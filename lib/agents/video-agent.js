import { addLog, getJob, setAgentState, updateOutputs } from "../pipeline/store.js";
import { AGENTS } from "./types.js";

function buildScript(booking, photos) {
  const address = booking.address || "הנכס";
  return `ברוכים הבאים ל${address}.
סיור וירטואלי מקצועי של VISIO Photography.
${photos.length} חללים מצולמים באיכות פרימיום.
לפרטים נוספים — צרו קשר היום.`;
}

function callbackUrl(agent) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  return `${base}/api/pipeline/webhook/${agent}`;
}

/**
 * POST to Make.com — async processing; completion via webhook.
 */
async function dispatchToMake(webhookUrl, payload) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.MAKE_WEBHOOK_SECRET
        ? { "X-Visio-Secret": process.env.MAKE_WEBHOOK_SECRET }
        : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Make webhook failed (${res.status}): ${text}`);
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = { accepted: true };
  }
  return body;
}

/**
 * @param {string} jobId
 * @param {Array} photos
 * @param {Object} booking
 */
export async function runVideoAgent(jobId, photos, booking) {
  await setAgentState(jobId, AGENTS.VIDEO, {
    status: "running",
    progress: 10,
    message: "מכין בקשה ל-Make.com",
    startedAt: new Date().toISOString(),
  });
  await addLog(jobId, AGENTS.VIDEO, `קיבל ${photos.length} תמונות לסרטון`);

  if (photos.length === 0) {
    await setAgentState(jobId, AGENTS.VIDEO, {
      status: "skipped",
      progress: 100,
      message: "אין תמונות — דילוג",
      completedAt: new Date().toISOString(),
    });
    return { videoUrl: null, script: null, pending: false };
  }

  const job = await getJob(jobId);
  const bookingId = job?.bookingId || jobId;
  const imageUrls = photos.map((p) => p.url).filter(Boolean);
  const script = buildScript(booking, photos);

  const webhookUrl = process.env.MAKE_VIDEO_WEBHOOK_URL;
  if (!webhookUrl) {
    await updateOutputs(jobId, { script });
    await setAgentState(jobId, AGENTS.VIDEO, {
      status: "done",
      progress: 100,
      message: "תסריט מוכן — הגדר MAKE_VIDEO_WEBHOOK_URL",
      completedAt: new Date().toISOString(),
    });
    await addLog(jobId, AGENTS.VIDEO, "MAKE_VIDEO_WEBHOOK_URL לא מוגדר");
    return { videoUrl: null, script, pending: false };
  }

  const payload = {
    jobId,
    bookingId,
    imageUrls,
    photos: photos.map((p) => ({ name: p.name, url: p.url })),
    script,
    callbackUrl: callbackUrl("video"),
  };

  try {
    await setAgentState(jobId, AGENTS.VIDEO, {
      progress: 40,
      message: "שולח ל-Make.com לייצור וידאו",
    });

    await dispatchToMake(webhookUrl, payload);
    await updateOutputs(jobId, { script });

    await setAgentState(jobId, AGENTS.VIDEO, {
      status: "running",
      progress: 50,
      message: "ממתין ל-Make.com — עיבוד וידאו",
    });
    await addLog(jobId, AGENTS.VIDEO, `נשלח ל-Make.com (${imageUrls.length} תמונות) — ממתין ל-webhook`);

    return { videoUrl: null, script, pending: true, provider: "make" };
  } catch (err) {
    await setAgentState(jobId, AGENTS.VIDEO, {
      status: "error",
      progress: 100,
      message: `שגיאה בשליחה ל-Make: ${err.message}`,
      completedAt: new Date().toISOString(),
    });
    await addLog(jobId, AGENTS.VIDEO, `שגיאת Make: ${err.message}`);
    return { videoUrl: null, script, pending: false, error: err.message };
  }
}
