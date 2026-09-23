"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { upload } from "@vercel/blob/client";
import {
  UploadCloud,
  Link2,
  Loader2,
  FolderOpen,
  ChevronDown,
  Terminal,
  RotateCcw,
} from "lucide-react";
import { ADMIN, glassPanel, AGENT_META } from "./theme.js";
import { jobDropdownLabel } from "@/lib/pipeline/job-details.js";

const AGENT_LOG_LABEL = {
  ariel: "אריאל",
  tour: "סוכן סיור וירטואלי",
  video: "סוכן וידאו",
  creative: "סוכן קריאייטיב",
};

const MAX_RETRIES = 3;
const PROGRESS_SLOT_HEIGHT = 40;

function safeFileName(name) {
  return String(name || "photo.jpg").replace(/[^a-zA-Z0-9._\u0590-\u05FF-]/g, "_");
}

function intakeSignature(jobs) {
  return (jobs || [])
    .map(
      (j) =>
        `${j.id}:${j.status}:${j.updatedAt || ""}:${j.files?.all?.length ?? 0}:${j.details?.property?.street || ""}:${j.details?.agency?.agentId || ""}`
    )
    .join("|");
}

function liveJobSignature(job) {
  if (!job) return "";
  const agents = job.agents
    ? Object.entries(job.agents)
        .map(([id, a]) => `${id}:${a.status}:${a.progress ?? 0}:${a.message || ""}`)
        .join(",")
    : "";
  return `${job.id}:${job.status}:${job.files?.all?.length ?? 0}:${job.logs?.length ?? 0}:${agents}`;
}

async function uploadOneToBlob(jobId, file, onProgress) {
  const pathname = `uploads/${jobId}/${safeFileName(file.name)}`;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      onProgress?.({ attempt, percentage: 0 });
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/pipeline/blob",
        clientPayload: JSON.stringify({ jobId }),
        multipart: file.size > 4 * 1024 * 1024,
        contentType: file.type || "image/jpeg",
        onUploadProgress: (ev) => {
          const pct = typeof ev?.percentage === "number"
            ? ev.percentage
            : ev?.total
              ? (100 * (ev.loaded || 0)) / ev.total
              : 0;
          onProgress?.({ attempt, percentage: pct });
        },
      });
      onProgress?.({ attempt, percentage: 100 });
      let width;
      let height;
      try {
        const bmp = await createImageBitmap(file);
        width = bmp.width;
        height = bmp.height;
        bmp.close?.();
      } catch {
        /* server will Range-fetch headers if missing */
      }
      return {
        name: safeFileName(file.name),
        url: blob.url,
        contentType: file.type || "image/jpeg",
        size: file.size,
        width,
        height,
      };
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
  }
  throw lastErr || new Error("upload failed");
}

/**
 * @param {{
 *   focusJobId?: string,
 *   focusNonce?: number,
 *   refreshToken?: number,
 *   sectionRef?: React.Ref,
 *   onJobUpdated?: (job: object) => void,
 *   onUploadFinished?: () => void,
 * }} props
 */
export default function IntakeHub({
  focusJobId,
  focusNonce = 0,
  refreshToken = 0,
  sectionRef,
  onJobUpdated,
  onUploadFinished,
}) {
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [files, setFiles] = useState([]);
  const [urls, setUrls] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileProgress, setFileProgress] = useState(null);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState([]);
  const [liveJob, setLiveJob] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const fileRef = useRef(null);
  const dropzoneRef = useRef(null);
  const jobsSigRef = useRef("");
  const liveSigRef = useRef("");
  const selectedJobIdRef = useRef(selectedJobId);
  selectedJobIdRef.current = selectedJobId;

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/pipeline/jobs");
      const data = await res.json();
      if (!data.ok) return;
      const intake = (data.jobs || []).filter((j) => j.status === "intake");
      const sig = intakeSignature(intake);
      if (sig === jobsSigRef.current) return;
      jobsSigRef.current = sig;
      setJobs(intake);
      // Keep selected id even if it left intake (e.g. moved to processing).
    } catch {
      /* ignore */
    }
  }, []);

  const refreshLiveJob = useCallback(async () => {
    const id = selectedJobIdRef.current;
    if (!id) return;
    try {
      const res = await fetch(`/api/pipeline/jobs/${id}`);
      const data = await res.json();
      if (!data.ok || !data.job) return;
      const sig = liveJobSignature(data.job);
      if (sig === liveSigRef.current) return;
      liveSigRef.current = sig;
      setLiveJob(data.job);
      setLogs(data.job.logs || []);
      onJobUpdated?.(data.job);
    } catch {
      /* ignore */
    }
  }, [onJobUpdated]);

  // Initial load + event-driven refresh (refreshToken from parent).
  useEffect(() => {
    loadJobs();
  }, [loadJobs, refreshToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/branding/catalog");
        const data = await res.json();
        if (!cancelled && data.ok) setCatalog(data.catalog);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tab focus → refresh once.
  useEffect(() => {
    const onFocus = () => {
      loadJobs();
      refreshLiveJob();
    };
    const onVis = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loadJobs, refreshLiveJob]);

  // Explicit "קליטת קבצים" only — select + scroll once per nonce.
  useEffect(() => {
    if (!focusJobId || !focusNonce) return;
    setSelectedJobId(focusJobId);
    loadJobs().then(() => setSelectedJobId(focusJobId));
    requestAnimationFrame(() => {
      (sectionRef?.current || dropzoneRef.current)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [focusJobId, focusNonce, loadJobs, sectionRef]);

  // Soft live updates only while selected job is processing (≤10s).
  useEffect(() => {
    if (!selectedJobId) return;
    refreshLiveJob();
    const status = liveJob?.id === selectedJobId ? liveJob.status : null;
    if (status !== "processing") return undefined;
    const t = setInterval(refreshLiveJob, 10_000);
    return () => clearInterval(t);
  }, [selectedJobId, liveJob?.id, liveJob?.status, refreshLiveJob]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    setFiles(Array.from(e.dataTransfer.files || []));
    setError("");
  };

  const uploadAll = async () => {
    if (!selectedJobId) {
      setError("בחר Job מהרשימה");
      return;
    }
    if (files.length === 0 && !urls.trim()) {
      setError("הוסף קבצים או לינקים");
      return;
    }

    setUploading(true);
    setError("");
    setFileProgress({ index: 0, total: files.length || 1, name: "", percentage: 0, attempt: 1 });

    try {
      const uploaded = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setFileProgress({
          index: i,
          total: files.length,
          name: file.name,
          percentage: 0,
          attempt: 1,
        });
        const entry = await uploadOneToBlob(selectedJobId, file, ({ attempt, percentage }) => {
          setFileProgress({
            index: i,
            total: files.length,
            name: file.name,
            percentage,
            attempt,
          });
        });
        uploaded.push(entry);
      }

      const urlList = urls
        .split("\n")
        .map((u) => u.trim())
        .filter(Boolean)
        .map((u) => ({ name: u.split("/").pop() || "link", url: u }));

      const res = await fetch("/api/pipeline/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: selectedJobId,
          files: [...uploaded, ...urlList],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `שגיאה ${res.status}`);
      }

      setFiles([]);
      setUrls("");
      if (data.job) {
        liveSigRef.current = liveJobSignature(data.job);
        setLiveJob(data.job);
        setLogs(data.job.logs || []);
      }
      await loadJobs();
      onUploadFinished?.(data.job);
    } catch (e) {
      setError(e.message || "העלאה נכשלה");
    } finally {
      setUploading(false);
      setFileProgress(null);
    }
  };

  const selectedJob =
    jobs.find((j) => j.id === selectedJobId) ||
    (liveJob?.id === selectedJobId ? liveJob : null);

  // Keep dropdown option for selected job even after it leaves intake.
  const dropdownJobs = (() => {
    if (!selectedJobId) return jobs;
    if (jobs.some((j) => j.id === selectedJobId)) return jobs;
    if (liveJob?.id === selectedJobId) return [...jobs, liveJob];
    return jobs;
  })();

  const agentLines = liveJob?.agents
    ? Object.entries(liveJob.agents).map(([id, a]) => ({
        id,
        label: AGENT_LOG_LABEL[id] || id,
        status: a.status,
        message: a.message,
        progress: a.progress,
      }))
    : [];

  const overallPct =
    fileProgress && fileProgress.total
      ? ((fileProgress.index + fileProgress.percentage / 100) / fileProgress.total) * 100
      : 0;

  return (
    <div className="visio-intake-hub" ref={sectionRef}>
      <div ref={dropzoneRef} style={{ ...glassPanel, padding: "24px 28px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <UploadCloud size={20} color={ADMIN.gold} strokeWidth={1.5} />
          <div>
            <div style={{ fontFamily: ADMIN.fontDisplay, fontSize: 18, letterSpacing: 3, color: ADMIN.text }}>
              אזור קליטת פרויקט
            </div>
            <div style={{ fontSize: 12, color: ADMIN.muted, marginTop: 2 }}>
              העלאה ישירה לדפדפן → Vercel Blob · קבצים גדולים עם progress + retry
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 10, letterSpacing: 2, color: ADMIN.goldDim, display: "block", marginBottom: 8 }}>
            JOB / BOOKING (קליטה)
          </label>
          <div style={{ position: "relative" }}>
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              style={{
                width: "100%",
                appearance: "none",
                background: "var(--visio-input-bg)",
                border: `1px solid ${ADMIN.border}`,
                color: ADMIN.text,
                padding: "12px 40px 12px 14px",
                fontSize: 13,
                outline: "none",
              }}
            >
              <option value="">— בחר הזמנה —</option>
              {dropdownJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {jobDropdownLabel(j, catalog)} · {j.status}
                </option>
              ))}
            </select>
            <ChevronDown size={16} color={ADMIN.muted} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          </div>
          {jobs.length === 0 && !selectedJobId && (
            <div style={{ fontSize: 11, color: ADMIN.muted, marginTop: 8 }}>
              אין jobs בסטטוס קליטה. צרו ״הזמנת בדיקה״ ברשימת Jobs למטה.
            </div>
          )}
          {selectedJob && (
            <div style={{ fontSize: 11, color: ADMIN.muted, marginTop: 8 }}>
              ID: <span style={{ color: ADMIN.gold, fontFamily: "monospace" }}>{selectedJob.id}</span>
              {selectedJob.bookingId && <> · Booking: {selectedJob.bookingId}</>}
            </div>
          )}
        </div>

        <div
          className={`visio-dropzone${dragOver ? " active" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => { setFiles(Array.from(e.target.files || [])); setError(""); }}
          />
          <FolderOpen size={28} color={ADMIN.gold} strokeWidth={1.25} />
          <div style={{ fontSize: 14, color: ADMIN.text, marginTop: 12 }}>
            גרור תמונות לכאן או לחץ לבחירה
          </div>
          <div style={{ fontSize: 11, color: ADMIN.muted, marginTop: 6 }}>
            JPG · PNG · WebP · פנורמות 8K (עד ~50MB לקובץ)
          </div>
          {files.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: ADMIN.gold }}>
              {files.length} קבצים נבחרו
            </div>
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={{ fontSize: 10, letterSpacing: 2, color: ADMIN.goldDim, display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <Link2 size={12} /> לינקים מ-Google Drive / ענן
          </label>
          <textarea
            rows={2}
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder="שורה לכל לינק..."
            style={{
              width: "100%",
              background: "var(--visio-input-bg)",
              border: `1px solid ${ADMIN.border}`,
              color: ADMIN.text,
              padding: 12,
              fontSize: 12,
              resize: "none",
              outline: "none",
              fontFamily: "monospace",
            }}
          />
        </div>

        {/* Reserved slot — always same height so progress does not shift layout */}
        <div style={{ marginTop: 14, height: PROGRESS_SLOT_HEIGHT, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {fileProgress ? (
            <>
              <div style={{ fontSize: 11, color: ADMIN.muted, marginBottom: 6, display: "flex", justifyContent: "space-between", gap: 8, minHeight: 16 }}>
                <span dir="ltr" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {fileProgress.index + 1}/{fileProgress.total} · {fileProgress.name || "…"}
                </span>
                <span style={{ flexShrink: 0 }}>
                  {Math.round(fileProgress.percentage)}%
                  {fileProgress.attempt > 1 && (
                    <span style={{ marginInlineStart: 8 }}>
                      <RotateCcw size={10} style={{ display: "inline", verticalAlign: "middle" }} /> ניסיון {fileProgress.attempt}
                    </span>
                  )}
                </span>
              </div>
              <div style={{ height: 6, background: ADMIN.border, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, overallPct)}%`, background: ADMIN.gold, transition: "width .15s linear" }} />
              </div>
            </>
          ) : (
            <div style={{ height: 6 }} aria-hidden />
          )}
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--visio-error-bg)", border: "1px solid var(--visio-error-border)", fontSize: 12, color: ADMIN.error }}>
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={uploadAll}
          disabled={uploading}
          className="visio-admin-btn-primary"
          style={{ marginTop: 16, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          {uploading ? <Loader2 size={16} className="visio-spin" /> : <UploadCloud size={16} />}
          {uploading ? "מעלה ל-Blob ומפעיל Pipeline..." : "העלה והפעל Pipeline"}
        </button>
      </div>

      <div style={{ ...glassPanel, padding: "20px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Terminal size={18} color={ADMIN.gold} strokeWidth={1.5} />
          <span style={{ fontFamily: ADMIN.fontDisplay, fontSize: 15, letterSpacing: 3, color: ADMIN.text }}>
            לוג מערכת — אריאל
          </span>
          <span className="visio-pulse-dot" />
        </div>

        {agentLines.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8, marginBottom: 14 }}>
            {agentLines.map((a) => (
              <div key={a.id} style={{ padding: "10px 12px", background: "var(--visio-input-bg)", border: `1px solid ${ADMIN.border}` }}>
                <div style={{ fontSize: 10, color: AGENT_META[a.id]?.color || ADMIN.muted, marginBottom: 4 }}>{a.label}</div>
                <div style={{ fontSize: 11, color: ADMIN.text }}>{a.message || a.status}</div>
                {a.progress > 0 && (
                  <div style={{ marginTop: 6, height: 2, background: ADMIN.border }}>
                    <div style={{ height: "100%", width: `${a.progress}%`, background: AGENT_META[a.id]?.color || ADMIN.gold, transition: "width .3s" }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="visio-console">
          {logs.length === 0 ? (
            <div style={{ color: ADMIN.muted, fontSize: 12 }}>ממתין לפעילות סוכנים...</div>
          ) : (
            logs.slice(-20).map((l, i) => (
              <div key={`${l.at}-${i}`} className="visio-console-line">
                <span className="visio-console-time">{new Date(l.at).toLocaleTimeString("he-IL")}</span>
                <span className="visio-console-agent">[{AGENT_LOG_LABEL[l.agent] || l.agent}]</span>
                <span>{l.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
