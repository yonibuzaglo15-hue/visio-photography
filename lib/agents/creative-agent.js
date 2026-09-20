import { addLog, getJob, setAgentState } from "../pipeline/store.js";
import { AGENTS } from "./types.js";

function callbackUrl(agent) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  return `${base}/api/pipeline/webhook/${agent}`;
}

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
export async function runCreativeAgent(jobId, photos, booking) {
  await setAgentState(jobId, AGENTS.CREATIVE, {
    status: "running",
    progress: 10,
    message: "מכין בקשה ל-Make.com",
    startedAt: new Date().toISOString(),
  });
  await addLog(jobId, AGENTS.CREATIVE, `קיבל ${photos.length} תמונות לעיבוד`);

  if (photos.length === 0) {
    await setAgentState(jobId, AGENTS.CREATIVE, {
      status: "skipped",
      progress: 100,
      message: "אין תמונות — דילוג",
      completedAt: new Date().toISOString(),
    });
    return { graphicsUrls: [], pending: false };
  }

  const job = await getJob(jobId);
  const bookingId = job?.bookingId || jobId;
  const imageUrls = photos.map((p) => p.url).filter(Boolean);

  const webhookUrl = process.env.MAKE_CREATIVE_WEBHOOK_URL;
  if (!webhookUrl) {
    await setAgentState(jobId, AGENTS.CREATIVE, {
      status: "done",
      progress: 100,
      message: "מוכן — הגדר MAKE_CREATIVE_WEBHOOK_URL",
      completedAt: new Date().toISOString(),
    });
    await addLog(jobId, AGENTS.CREATIVE, "MAKE_CREATIVE_WEBHOOK_URL לא מוגדר");
    return { graphicsUrls: imageUrls, pending: false, provider: "placeholder" };
  }

  const payload = {
    jobId,
    bookingId,
    imageUrls,
    photos: photos.map((p) => ({ name: p.name, url: p.url })),
    staging: true,
    callbackUrl: callbackUrl("creative"),
  };

  try {
    await setAgentState(jobId, AGENTS.CREATIVE, {
      progress: 40,
      message: "שולח ל-Make.com להשבחה וסטייג'ינג",
    });

    await dispatchToMake(webhookUrl, payload);

    await setAgentState(jobId, AGENTS.CREATIVE, {
      status: "running",
      progress: 50,
      message: "ממתין ל-Make.com — עיבוד גרפיקה",
    });
    await addLog(jobId, AGENTS.CREATIVE, `נשלח ל-Make.com (${imageUrls.length} תמונות) — ממתין ל-webhook`);

    return { graphicsUrls: [], pending: true, provider: "make" };
  } catch (err) {
    await setAgentState(jobId, AGENTS.CREATIVE, {
      status: "error",
      progress: 100,
      message: `שגיאה בשליחה ל-Make: ${err.message}`,
      completedAt: new Date().toISOString(),
    });
    await addLog(jobId, AGENTS.CREATIVE, `שגיאת Make: ${err.message}`);
    return { graphicsUrls: [], pending: false, error: err.message };
  }
}
