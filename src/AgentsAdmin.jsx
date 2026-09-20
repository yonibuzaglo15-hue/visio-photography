"use client";

import { useState, useEffect } from "react";
import {
  Network,
  Globe,
  Film,
  Sparkles,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Circle,
} from "lucide-react";
import IntakeHub from "./admin/IntakeHub.jsx";
import { ADMIN, glassPanel } from "./admin/theme.js";

const AGENTS = [
  {
    id: "ariel",
    name: "אריאל",
    role: "Master Orchestrator",
    Icon: Network,
    color: "#6b8cce",
    desc: "מנהל את צינור העיבוד, ממיין קבצים ומפעיל תתי-סוכנים במקביל.",
    tools: ["Pipeline API", "File Classifier", "Job Queue"],
    trigger: "הזמנה חדשה / העלאת קבצים",
    sends_to: ["tour", "video", "creative"],
  },
  {
    id: "tour",
    name: "סוכן סיור וירטואלי",
    role: "TourAgent",
    Icon: Globe,
    color: "#60b8d8",
    desc: "עיבוד תמונות 360° והטמעה בנגן Pannellum ב-Vercel Blob.",
    tools: ["Pannellum", "Vercel Blob", "Kuula API"],
    trigger: "קבצי פנורמה / 360°",
    sends_to: [],
  },
  {
    id: "video",
    name: "סוכן וידאו",
    role: "VideoAgent",
    Icon: Film,
    color: "#d47ab0",
    desc: "תסריט שיווקי והפקת סרטון דרך Make.com webhook.",
    tools: ["Make.com", "Runway API", "Script Engine"],
    trigger: "תמונות רגילות לאחר קליטה",
    sends_to: [],
  },
  {
    id: "creative",
    name: "סוכן קריאייטיב",
    role: "CreativeAgent",
    Icon: Sparkles,
    color: "#8abe8a",
    desc: "השבחת תמונות וסטייג'ינג וירטואלי דרך Make.com.",
    tools: ["Make.com", "Magnific AI", "Virtual Staging"],
    trigger: "תמונות רגילות לאחר קליטה",
    sends_to: [],
  },
];

const PIPELINE_STEPS = [
  { from: "ariel", to: "tour", label: "פנורמות → סיור 360°" },
  { from: "ariel", to: "creative", label: "תמונות → השבחה" },
  { from: "ariel", to: "video", label: "תמונות → סרטון" },
  { from: "tour", to: "ariel", label: "סיור מוכן" },
  { from: "video", to: "ariel", label: "וידאו מוכן" },
  { from: "creative", to: "ariel", label: "גרפיקה מוכנה" },
];

const STATUS_ICON = {
  active: CheckCircle2,
  running: Loader2,
  done: CheckCircle2,
  idle: Circle,
  error: AlertCircle,
};

function AgentCard({ agent, selected, onSelect, liveStatus }) {
  const status = liveStatus || "idle";
  const StatusIcon = STATUS_ICON[status] || Circle;
  const { Icon } = agent;

  return (
    <div
      className={`visio-agent-card${selected ? " selected" : ""}`}
      onClick={() => onSelect(selected ? null : agent.id)}
      style={{ "--agent-color": agent.color }}
    >
      <div className="visio-agent-card-head">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div className="visio-agent-icon-wrap">
            <Icon size={22} strokeWidth={1.5} />
          </div>
          <div>
            <div className="visio-agent-name">{agent.name}</div>
            <div className="visio-agent-role">{agent.role}</div>
          </div>
        </div>
        <div className="visio-agent-status">
          <StatusIcon size={14} className={status === "running" ? "visio-spin" : ""} />
          <span>{status}</span>
        </div>
      </div>
      <p className="visio-agent-desc">{agent.desc}</p>
      {selected && (
        <div className="visio-agent-details">
          <div><span className="visio-admin-label">TRIGGER</span><p>{agent.trigger}</p></div>
          <div><span className="visio-admin-label">TOOLS</span>
            <div className="visio-agent-tools">
              {agent.tools.map((t) => <span key={t}>{t}</span>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PipelineView() {
  const iconFor = (id) => AGENTS.find((a) => a.id === id)?.Icon || Network;

  return (
    <div>
      <p style={{ fontSize: 12, color: ADMIN.muted, marginBottom: 20 }}>
        אריאל ממיין קבצים ומפעיל Tour / Video / Creative במקביל
      </p>
      <div className="visio-pipeline-flow">
        {PIPELINE_STEPS.map((step, i) => {
          const FromIcon = iconFor(step.from);
          const ToIcon = iconFor(step.to);
          const fromAgent = AGENTS.find((a) => a.id === step.from);
          const toAgent = AGENTS.find((a) => a.id === step.to);
          return (
            <div key={i} className="visio-pipeline-step">
              <span className="visio-pipeline-num">{String(i + 1).padStart(2, "0")}</span>
              <div className="visio-pipeline-agent" style={{ color: fromAgent?.color }}>
                <FromIcon size={16} />
                <span>{fromAgent?.name}</span>
              </div>
              <div className="visio-pipeline-arrow">
                <span>{step.label}</span>
                <ArrowLeft size={14} />
              </div>
              <div className="visio-pipeline-agent" style={{ color: toAgent?.color }}>
                <span>{toAgent?.name}</span>
                <ToIcon size={16} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AgentsAdmin() {
  const [view, setView] = useState("agents");
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [liveAgents, setLiveAgents] = useState({});

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/pipeline/jobs");
        const data = await res.json();
        if (!data.ok || !data.jobs?.length) return;
        const latest = data.jobs[0];
        if (latest.agents) {
          const mapped = {};
          Object.entries(latest.agents).forEach(([id, a]) => {
            mapped[id] = a.status;
          });
          setLiveAgents(mapped);
        }
      } catch { /* ignore */ }
    };
    poll();
    const t = setInterval(poll, 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="visio-agents-admin">
      <header className="visio-agents-header">
        <div>
          <div className="visio-agents-eyebrow">VISIO ASSET PIPELINE</div>
          <h1 className="visio-admin-page-title" style={{ margin: 0 }}>מרכז בקרת סוכנים</h1>
          <p style={{ fontSize: 12, color: ADMIN.muted, marginTop: 6 }}>אריאל + 3 תתי-סוכנים · ענן + Make.com</p>
        </div>
        <div className="visio-agents-tabs">
          {[
            { id: "agents", label: "סוכנים" },
            { id: "pipeline", label: "זרימה" },
          ].map(({ id, label }) => (
            <button key={id} type="button" className={view === id ? "active" : ""} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <IntakeHub />

      <div className="visio-agent-pills">
        {AGENTS.map((a) => {
          const Icon = a.Icon;
          return (
            <div key={a.id} className="visio-agent-pill" style={{ borderColor: `${a.color}44` }}>
              <Icon size={16} color={a.color} />
              <span>{a.name}</span>
            </div>
          );
        })}
      </div>

      {view === "agents" && (
        <div className="visio-agent-grid">
          {AGENTS.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              selected={selectedAgent === agent.id}
              onSelect={setSelectedAgent}
              liveStatus={liveAgents[agent.id]}
            />
          ))}
        </div>
      )}

      {view === "pipeline" && (
        <div style={{ ...glassPanel, padding: 24, marginTop: 8 }}>
          <PipelineView />
        </div>
      )}
    </div>
  );
}
