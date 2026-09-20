"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import { ADMIN, glassPanel, AGENT_META } from "./admin/theme.js";

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

export default function ArielOrchestrator() {
  const [jobs, setJobs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");

  const loadJobs = async () => {
    try {
      const res = await fetch("/api/pipeline/jobs");
      const data = await res.json();
      if (data.ok) setJobs(data.jobs || []);
    } catch (e) {
      console.error("[pipeline jobs]", e);
    }
  };

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 3000);
    return () => clearInterval(interval);
  }, []);

  const addTestJob = async () => {
    await triggerAriel({
      name: "ישראל ישראלי (בדיקה)",
      phone: "052-1234567",
      address: "הרצל 10 אשדוד",
      pkg: "PRESTIGE",
      date: "15/06/2025",
      time: "10:00",
    });
    loadJobs();
  };

  const filtered = filterStatus === "all" ? jobs : jobs.filter((j) => j.status === filterStatus);

  return (
    <div style={{ ...glassPanel, padding: "24px 28px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="visio-agents-eyebrow">ARIEL · ORCHESTRATOR</div>
          <h2 className="visio-admin-section-title" style={{ margin: 0 }}>רשימת Jobs</h2>
        </div>
        <button type="button" className="visio-admin-btn-ghost" onClick={addTestJob}>
          <Plus size={14} />
          הזמנת בדיקה
        </button>
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
            const isOpen = selected === job.id;
            const b = job.booking || {};
            return (
              <div key={job.id} className={`visio-job-row${isOpen ? " open" : ""}`}>
                <button type="button" className="visio-job-row-head" onClick={() => setSelected(isOpen ? null : job.id)}>
                  <StIcon size={20} color={st.color} />
                  <div>
                    <div style={{ color: ADMIN.text, fontSize: 14 }}>{b.name || "—"}</div>
                    <div style={{ color: ADMIN.muted, fontSize: 11 }}>{b.phone} · {b.address}</div>
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

                    {job.files?.all?.length > 0 && (
                      <div className="visio-file-tags">
                        {job.files.all.map((f) => (
                          <span key={f.id} className={f.type === "panorama" ? "pano" : ""}>
                            {f.type === "panorama" ? "360" : "IMG"} {f.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {job.status === "ready" && job.outputs && (
                      <div className="visio-output-links">
                        {job.outputs.tourUrl && (
                          <a href={job.outputs.tourUrl} target="_blank" rel="noreferrer" className="tour">
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
    </div>
  );
}
