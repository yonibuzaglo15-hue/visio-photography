"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Inbox,
  Zap,
  CheckCircle2,
  List,
  ChevronDown,
  ChevronUp,
  Globe,
  Film,
  Image,
  Plus,
  Network,
  Loader2,
  AlertTriangle,
  Pencil,
} from "lucide-react";
import { ADMIN, glassPanel, AGENT_META } from "./admin/theme.js";
import JobDetailsForm from "./admin/JobDetailsForm.jsx";
import {
  ensureJobDetails,
  jobDisplaySubtitle,
  jobDisplayTitle,
} from "@/lib/pipeline/job-details.js";

const STATUS_MAP = {
  intake: { label: "קליטת קבצים", color: ADMIN.gold, Icon: Inbox },
  processing: { label: "עיבוד פעיל", color: ADMIN.accent, Icon: Zap },
  ready: { label: "מוכן לשיווק", color: ADMIN.success, Icon: CheckCircle2 },
  error: { label: "שגיאה", color: ADMIN.error, Icon: AlertTriangle },
};

const PHASES = [
  { key: "a", label: "קליטה" },
  { key: "b", label: "עיבוד" },
  { key: "c", label: "מוכן" },
];

const AGENT_ICONS = { ariel: Network, tour: Globe, video: Film, creative: Image };
const AGENT_NAMES = { ariel: "אריאל", tour: "סיור 360°", video: "וידאו", creative: "קריאייטיב" };

function jobsSignature(jobs) {
  return (jobs || [])
    .map(
      (j) =>
        `${j.id}:${j.status}:${j.updatedAt || ""}:${j.files?.all?.length ?? 0}:${j.details?.property?.street || ""}:${j.details?.agency?.agentId || ""}`
    )
    .join("|");
}

export async function triggerAriel(bookingData) {
  try {
    const res = await fetch("/api/pipeline/create-job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookingData),
    });
    const data = await res.json();
    if (data.ok && data.job) return data.job;
  } catch (e) {
    console.error("[triggerAriel]", e);
  }
  return null;
}

function PhaseBar({ phase }) {
  const idx = PHASES.findIndex((p) => p.key === phase);
  return (
    <div className="visio-phase-bar">
      {PHASES.map((p, i) => {
        const done = i <= idx;
        return (
          <div key={p.key} className={`visio-phase-step${done ? " done" : ""}`}>
            <span>{p.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function AgentStatusRow({ agents }) {
  if (!agents) return null;
  return (
    <div className="visio-agent-status-grid">
      {["ariel", "tour", "video", "creative"].map((id) => {
        const a = agents[id] || {};
        const Icon = AGENT_ICONS[id];
        const color = AGENT_META[id]?.color || ADMIN.muted;
        return (
          <div key={id} className="visio-agent-status-cell">
            <Icon size={16} color={color} />
            <div className="visio-agent-status-name">{AGENT_NAMES[id]}</div>
            <div className="visio-agent-status-msg">{a.message || a.status}</div>
            {a.progress > 0 && (
              <div className="visio-progress-bar">
                <div style={{ width: `${a.progress}%`, background: color }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ArielOrchestrator({ onJobsMutated, onSelectForUpload, refreshToken = 0 }) {
  const [jobs, setJobs] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [formMode, setFormMode] = useState(null); // null | 'create' | 'edit'
  const [editJob, setEditJob] = useState(null);
  const sigRef = useRef("");

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/pipeline/jobs");
      const data = await res.json();
      if (!data.ok) return;
      const next = data.jobs || [];
      const sig = jobsSignature(next);
      if (sig === sigRef.current) return;
      sigRef.current = sig;
      setJobs(next);
    } catch (e) {
      console.error("[pipeline jobs]", e);
    }
  }, []);

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

  useEffect(() => {
    loadJobs();
  }, [loadJobs, refreshToken]);

  useEffect(() => {
    const onFocus = () => loadJobs();
    window.addEventListener("focus", onFocus);
    const onVis = () => {
      if (document.visibilityState === "visible") loadJobs();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loadJobs]);

  const hasProcessing = jobs.some((j) => j.status === "processing");
  useEffect(() => {
    if (!hasProcessing) return undefined;
    const t = setInterval(loadJobs, 10_000);
    return () => clearInterval(t);
  }, [hasProcessing, loadJobs]);

  const addTestJob = async () => {
    const job = await triggerAriel({
      name: "ישראל ישראלי (בדיקה)",
      phone: "052-1234567",
      address: "הרצל 10 אשדוד",
      pkg: "PRESTIGE",
      date: "15/06/2025",
      time: "10:00",
    });
    sigRef.current = "";
    await loadJobs();
    onJobsMutated?.(job);
  };

  const openCreate = () => {
    setEditJob(null);
    setFormMode("create");
  };

  const openEdit = (job, e) => {
    e?.stopPropagation();
    setEditJob(job);
    setFormMode("edit");
  };

  const onFormSaved = async (job) => {
    setFormMode(null);
    setEditJob(null);
    sigRef.current = "";
    await loadJobs();
    onJobsMutated?.(job);
    if (job?.id) {
      onSelectForUpload?.(job.id);
      setExpandedId(job.id);
    }
  };

  const filtered = filterStatus === "all" ? jobs : jobs.filter((j) => j.status === filterStatus);

  return (
    <div style={{ ...glassPanel, padding: "24px 28px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="visio-agents-eyebrow">ARIEL · ORCHESTRATOR</div>
          <h2 className="visio-admin-section-title" style={{ margin: 0 }}>רשימת Jobs</h2>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="visio-admin-btn-primary" onClick={openCreate}>
            <Plus size={14} />
            הזמנה חדשה
          </button>
          <button type="button" className="visio-admin-btn-ghost" onClick={addTestJob}>
            <Plus size={14} />
            הזמנת בדיקה
          </button>
        </div>
      </div>

      <div className="visio-admin-stats-grid" style={{ marginBottom: 20 }}>
        {[
          { Icon: Inbox, label: "קליטה", val: jobs.filter((j) => j.status === "intake").length },
          { Icon: Loader2, label: "עיבוד", val: jobs.filter((j) => j.status === "processing").length },
          { Icon: CheckCircle2, label: "מוכן", val: jobs.filter((j) => j.status === "ready").length },
          { Icon: List, label: "סה״כ", val: jobs.length },
        ].map(({ Icon, label, val }) => (
          <div key={label} className="visio-admin-stat">
            <Icon size={18} color={ADMIN.gold} />
            <div className="visio-admin-stat-value">{val}</div>
            <div className="visio-admin-stat-label">{label}</div>
          </div>
        ))}
      </div>

      <div className="visio-filter-pills">
        {[["all", "הכל"], ["intake", "קליטה"], ["processing", "עיבוד"], ["ready", "מוכן"]].map(([s, l]) => (
          <button key={s} type="button" className={filterStatus === s ? "active" : ""} onClick={() => setFilterStatus(s)}>
            {l}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="visio-empty-state">
          <Inbox size={32} color={ADMIN.muted} />
          <p>אין jobs ב-Pipeline</p>
        </div>
      ) : (
        <div className="visio-job-list">
          {filtered.map((job) => {
            const st = STATUS_MAP[job.status] || STATUS_MAP.intake;
            const StIcon = st.Icon;
            const isOpen = expandedId === job.id;
            const b = job.booking || {};
            const title = jobDisplayTitle(job, catalog);
            const subtitle = jobDisplaySubtitle(job, catalog);
            return (
              <div key={job.id} className={`visio-job-row${isOpen ? " open" : ""}`}>
                <button
                  type="button"
                  className="visio-job-row-head"
                  onClick={() => setExpandedId(isOpen ? null : job.id)}
                >
                  <StIcon size={20} color={st.color} />
                  <div>
                    <div style={{ color: ADMIN.text, fontSize: 14 }}>{title}</div>
                    <div style={{ color: ADMIN.muted, fontSize: 11 }}>{subtitle || "—"}</div>
                  </div>
                  <div style={{ color: ADMIN.muted, fontSize: 11 }}>
                    {b.date} {b.time}
                    <div style={{ color: ADMIN.goldDim }}>VISIO {b.pkg}</div>
                  </div>
                  <span className="visio-status-pill" style={{ color: st.color, borderColor: `${st.color}44` }}>{st.label}</span>
                  {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {isOpen && (
                  <div className="visio-job-detail">
                    <div style={{ fontSize: 10, color: ADMIN.muted, marginBottom: 8, fontFamily: "monospace" }}>{job.id}</div>
                    <PhaseBar phase={job.phase || "a"} />
                    <AgentStatusRow agents={job.agents} />

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                      <button
                        type="button"
                        className="visio-admin-btn-ghost"
                        style={{ color: ADMIN.text }}
                        onClick={(e) => openEdit(job, e)}
                      >
                        <Pencil size={14} />
                        ערוך פרטים
                      </button>
                      {job.status === "intake" && (
                        <button
                          type="button"
                          className="visio-admin-btn-primary"
                          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectForUpload?.(job.id);
                          }}
                        >
                          <Inbox size={14} />
                          קליטת קבצים
                        </button>
                      )}
                    </div>

                    {job.files?.all?.length > 0 && (
                      <div className="visio-file-tags">
                        {job.files.all.map((f) => (
                          <span key={f.id || f.url || f.name} className={f.type === "panorama" ? "pano" : ""}>
                            {f.type === "panorama" ? "360" : "IMG"} {f.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {job.status === "ready" && job.outputs && (
                      <div className="visio-output-links">
                        {job.outputs.tourUrl && (
                          <a href={`/tour/${job.id}`} target="_blank" rel="noreferrer" className="tour">
                            <Globe size={14} /> סיור וירטואלי
                          </a>
                        )}
                        {job.outputs.videoUrl && (
                          <a href={job.outputs.videoUrl} target="_blank" rel="noreferrer" className="video">
                            <Film size={14} /> סרטון
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {formMode === "create" && (
        <JobDetailsForm
          mode="create"
          onCancel={() => setFormMode(null)}
          onSaved={onFormSaved}
        />
      )}
      {formMode === "edit" && editJob && (
        <JobDetailsForm
          mode="edit"
          jobId={editJob.id}
          initialDetails={ensureJobDetails(editJob)}
          onCancel={() => {
            setFormMode(null);
            setEditJob(null);
          }}
          onSaved={onFormSaved}
        />
      )}
    </div>
  );
}
