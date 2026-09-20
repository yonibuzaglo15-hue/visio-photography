"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  UploadCloud,
  Link2,
  Loader2,
  FolderOpen,
  ChevronDown,
  Terminal,
} from "lucide-react";
import { ADMIN, glassPanel, AGENT_META } from "./theme.js";

const AGENT_LOG_LABEL = {
  ariel: "אריאל",
  tour: "סוכן סיור וירטואלי",
  video: "סוכן וידאו",
  creative: "סוכן קריאייטיב",
};

export default function IntakeHub({ onJobUpdated }) {
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [files, setFiles] = useState([]);
  const [urls, setUrls] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState([]);
  const [liveJob, setLiveJob] = useState(null);
  const fileRef = useRef(null);
  const logEndRef = useRef(null);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/pipeline/jobs");
      const data = await res.json();
      if (data.ok) {
        setJobs(data.jobs || []);
        if (!selectedJobId && data.jobs?.[0]) {
          setSelectedJobId(data.jobs[0].id);
        }
      }
    } catch { /* ignore */ }
  }, [selectedJobId]);

  const pollJob = useCallback(async () => {
    if (!selectedJobId) return;
    try {
      const res = await fetch(`/api/pipeline/jobs/${selectedJobId}`);
      const data = await res.json();
      if (data.ok && data.job) {
        setLiveJob(data.job);
        const jobLogs = data.job.logs || [];
        setLogs(jobLogs);
        onJobUpdated?.(data.job);
      }
    } catch { /* ignore */ }
  }, [selectedJobId, onJobUpdated]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    pollJob();
    const t = setInterval(pollJob, 2500);
    return () => clearInterval(t);
  }, [pollJob]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    setFiles(Array.from(e.dataTransfer.files || []));
    setError("");
  };

  const upload = async () => {
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

    try {
      const form = new FormData();
      form.append("jobId", selectedJobId);
      files.forEach((f) => form.append("files", f));
      urls.split("\n").filter(Boolean).forEach((u) => form.append("urls", u.trim()));

      const res = await fetch("/api/pipeline/upload", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || `שגיאה ${res.status}`);
      }

      setFiles([]);
      setUrls("");
      await loadJobs();
      await pollJob();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const selectedJob = jobs.find((j) => j.id === selectedJobId);
  const agentLines = liveJob?.agents
    ? Object.entries(liveJob.agents).map(([id, a]) => ({
        id,
        label: AGENT_LOG_LABEL[id] || id,
        status: a.status,
        message: a.message,
        progress: a.progress,
      }))
    : [];

  return (
    <div className="visio-intake-hub">
      <div style={{ ...glassPanel, padding: "24px 28px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <UploadCloud size={20} color={ADMIN.gold} strokeWidth={1.5} />
          <div>
            <div style={{ fontFamily: ADMIN.fontDisplay, fontSize: 18, letterSpacing: 3, color: ADMIN.text }}>
              אזור קליטת פרויקט
            </div>
            <div style={{ fontSize: 12, color: ADMIN.muted, marginTop: 2 }}>
              העלאה ישירה ל-Pipeline · POST /api/pipeline/upload
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 10, letterSpacing: 2, color: ADMIN.goldDim, display: "block", marginBottom: 8 }}>
            JOB / BOOKING
          </label>
          <div style={{ position: "relative" }}>
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              style={{
                width: "100%",
                appearance: "none",
                background: "rgba(0,0,0,0.4)",
                border: `1px solid ${ADMIN.border}`,
                color: ADMIN.text,
                padding: "12px 40px 12px 14px",
                fontSize: 13,
                outline: "none",
              }}
            >
              <option value="">— בחר הזמנה —</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.booking?.name || j.id} · {j.booking?.address || ""} · {j.status}
                </option>
              ))}
            </select>
            <ChevronDown size={16} color={ADMIN.muted} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          </div>
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
            JPG · PNG · WebP · פנורמות 360°
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
              background: "rgba(0,0,0,0.4)",
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

        {error && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", fontSize: 12, color: ADMIN.error }}>
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={upload}
          disabled={uploading}
          className="visio-admin-btn-primary"
          style={{ marginTop: 16, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          {uploading ? <Loader2 size={16} className="visio-spin" /> : <UploadCloud size={16} />}
          {uploading ? "מעלה ומפעיל Pipeline..." : "העלה והפעל Pipeline"}
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
              <div key={a.id} style={{ padding: "10px 12px", background: "rgba(0,0,0,0.35)", border: `1px solid ${ADMIN.border}` }}>
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
              <div key={i} className="visio-console-line">
                <span className="visio-console-time">{new Date(l.at).toLocaleTimeString("he-IL")}</span>
                <span className="visio-console-agent">[{AGENT_LOG_LABEL[l.agent] || l.agent}]</span>
                <span>{l.message}</span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
