import { AGENTS } from "../agents/types.js";
import { addLog, getJob, setAgentState, updateJob } from "./store.js";

const SUB_AGENTS = [AGENTS.TOUR, AGENTS.VIDEO, AGENTS.CREATIVE];
const TERMINAL = new Set(["done", "skipped", "error"]);

/**
 * Re-evaluate job status after an agent completes (sync or via webhook).
 */
export async function maybeFinalizeJob(jobId) {
  const job = await getJob(jobId);
  if (!job) return null;

  const agents = job.agents || {};
  const allTerminal = SUB_AGENTS.every((id) => TERMINAL.has(agents[id]?.status));
  const anyError = SUB_AGENTS.some((id) => agents[id]?.status === "error");
  const anyRunning = SUB_AGENTS.some((id) => agents[id]?.status === "running");

  if (anyRunning || !allTerminal) {
    await setAgentState(jobId, AGENTS.ARIEL, {
      status: "running",
      progress: 70,
      message: anyRunning ? "ממתין לסיום עיבוד (Make.com)" : "עיבוד פעיל",
    });
    await updateJob(jobId, { status: "processing", phase: "b" });
    return getJob(jobId);
  }

  const finalStatus = anyError ? "error" : "ready";
  const finalPhase = anyError ? "b" : "c";

  await updateJob(jobId, { status: finalStatus, phase: finalPhase });

  await setAgentState(jobId, AGENTS.ARIEL, {
    status: "done",
    progress: 100,
    message: finalStatus === "ready" ? "נכס מוכן לשיווק" : "עיבוד הסתיים עם שגיאות",
    completedAt: new Date().toISOString(),
  });

  const fresh = await getJob(jobId);
  const o = fresh.outputs || {};
  await addLog(
    jobId,
    AGENTS.ARIEL,
    finalStatus === "ready"
      ? `מוכן: סיור=${o.tourUrl ? "✓" : "—"}, וידאו=${o.videoUrl ? "✓" : "—"}, גרפיקה=${o.graphicsUrls?.length || 0}`
      : "שגיאה בעיבוד — בדוק לוג סוכנים"
  );

  return getJob(jobId);
}
