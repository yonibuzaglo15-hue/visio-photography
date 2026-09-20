import { routeFiles, splitByAgent } from "./classify.js";
import { runTourAgent } from "./tour-agent.js";
import { runVideoAgent } from "./video-agent.js";
import { runCreativeAgent } from "./creative-agent.js";
import { addLog, getJob, setAgentState, updateJob, updateOutputs } from "../pipeline/store.js";
import { maybeFinalizeJob } from "../pipeline/finalize.js";
import { AGENTS } from "./types.js";

export async function arielIntake(jobId, rawFiles) {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  const routed = routeFiles(rawFiles);
  const split = splitByAgent(routed);

  await setAgentState(jobId, AGENTS.ARIEL, {
    status: "running",
    progress: 20,
    message: `מיון ${routed.length} קבצים`,
    startedAt: new Date().toISOString(),
  });
  await addLog(
    jobId,
    AGENTS.ARIEL,
    `מיון: ${split.panoramas.length} פנורמות, ${split.photos.length} תמונות רגילות`
  );

  await updateJob(jobId, {
    status: "intake",
    phase: "a",
    files: {
      all: routed,
      panoramas: split.panoramas,
      photos: split.photos,
    },
  });

  await setAgentState(jobId, AGENTS.ARIEL, {
    status: "done",
    progress: 100,
    message: "קליטה הושלמה — מעבר לעיבוד",
    completedAt: new Date().toISOString(),
  });

  return { routed, split };
}

export async function arielProcess(jobId) {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  const { panoramas, photos } = job.files;
  const booking = job.booking;

  await updateJob(jobId, { status: "processing", phase: "b" });
  await setAgentState(jobId, AGENTS.ARIEL, {
    status: "running",
    progress: 10,
    message: "מפעיל תתי-סוכנים",
    startedAt: new Date().toISOString(),
  });
  await addLog(jobId, AGENTS.ARIEL, "מתחיל עיבוד מקבילי: Tour + Video + Creative");

  const [tourResult, videoResult, creativeResult] = await Promise.all([
    runTourAgent(jobId, panoramas || []),
    runVideoAgent(jobId, photos || [], booking),
    runCreativeAgent(jobId, photos || [], booking),
  ]);

  const outputs = {
    tourUrl: tourResult.tourUrl || null,
    tourJsonUrl: tourResult.tourJsonUrl || null,
    videoUrl: videoResult.videoUrl || null,
    graphicsUrls: creativeResult.graphicsUrls || [],
    script: videoResult.script || null,
  };

  await updateOutputs(jobId, outputs);

  const finalized = await maybeFinalizeJob(jobId);

  return {
    outputs,
    tourResult,
    videoResult,
    creativeResult,
    job: finalized,
  };
}

export async function runPipeline(jobId, rawFiles) {
  await arielIntake(jobId, rawFiles);
  return arielProcess(jobId);
}

export { AGENT_META, AGENTS, PHASE_LABELS, STATUS_LABELS } from "./types.js";
