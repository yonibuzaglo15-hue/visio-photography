"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { ADMIN } from "./theme.js";

const STATUS_HEB = {
  pending: "ממתין",
  processing: "בעיבוד",
  done: "הושלם",
  failed: "נכשל",
};

const STATUS_COLOR = {
  pending: ADMIN.gold,
  processing: ADMIN.accent,
  done: ADMIN.success,
  failed: ADMIN.error,
};

export default function BrandingJobsTab({ refreshToken }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/branding/jobs");
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "load failed");
      setJobs(data.jobs || []);
    } catch (err) {
      setError(err.message || "שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load, refreshToken]);

  if (loading && !jobs.length) {
    return (
      <div style={{ padding: 40, display: "flex", justifyContent: "center" }}>
        <Loader2 size={24} color={ADMIN.gold} className="visio-spin" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: ADMIN.muted, lineHeight: 1.7 }}>
          עבודות באנר (ComfyUI) — נפרד מ־Pipeline / Make.com. סטטוס <code dir="ltr">pending</code> מחכה ל־Phase 3.
        </p>
        <button type="button" className="visio-admin-btn-ghost" onClick={load} aria-label="רענן">
          <RefreshCw size={14} />
          רענן
        </button>
      </div>

      {error && <div className="visio-admin-error" style={{ marginBottom: 12 }}>{error}</div>}

      {!jobs.length ? (
        <div style={{ color: ADMIN.muted, fontSize: 14, padding: 24, border: `1px solid ${ADMIN.border}` }}>
          אין עבודות באנר עדיין. צרו נכס חדש בטאב ״נכס חדש״.
        </div>
      ) : (
        <div className="visio-admin-table">
          {jobs.map((job) => (
            <div key={job.id} className="visio-admin-table-row visio-admin-table-row--wide">
              <div>
                <div style={{ color: ADMIN.text, fontSize: 14 }}>
                  {job.street}, {job.city}
                </div>
                <div style={{ color: ADMIN.muted, fontSize: 11 }} dir="ltr">
                  {job.id}
                  {job.title ? ` · ${job.title}` : ""}
                </div>
              </div>
              <div style={{ color: ADMIN.muted, fontSize: 12 }}>
                <span dir="ltr">{job.agencyId}</span>
                {" · "}
                <span dir="ltr">{job.agentId}</span>
                <div style={{ marginTop: 4 }}>
                  {job.originals?.length || 0} מקור
                  {job.outputs?.length ? ` · ${job.outputs.length} פלט` : ""}
                </div>
              </div>
              <div style={{ color: ADMIN.muted, fontSize: 11 }} dir="ltr">
                {job.createdAt ? new Date(job.createdAt).toLocaleString("he-IL") : "—"}
              </div>
              <span style={{ color: STATUS_COLOR[job.status] || ADMIN.muted, fontSize: 12 }}>
                {STATUS_HEB[job.status] || job.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
