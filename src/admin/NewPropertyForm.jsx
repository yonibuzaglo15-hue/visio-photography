"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Upload, X, CheckCircle2 } from "lucide-react";
import { ADMIN, glassPanel } from "./theme.js";

const ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif";
const MAX_FILES = 60;

const PROPERTY_TYPES = [
  { id: "", label: "—" },
  { id: "apartment", label: "דירה" },
  { id: "house", label: "בית" },
  { id: "land", label: "מגרש" },
  { id: "commercial", label: "מסחרי" },
  { id: "other", label: "אחר" },
];

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Upload one file with XHR so we get progress events.
 */
function uploadFileWithProgress(jobId, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("files", file);
    xhr.open("POST", `/api/branding/jobs/${encodeURIComponent(jobId)}/upload`);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(ev.loaded / ev.total);
      else onProgress(0);
    };
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("תשובת שרת לא תקינה"));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.ok) {
        resolve(data);
      } else {
        reject(new Error(data?.error || `העלאה נכשלה (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("שגיאת רשת בהעלאה"));
    xhr.send(form);
  });
}

export default function NewPropertyForm({ onCreated }) {
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState("");
  const [city, setCity] = useState("");
  const [street, setStreet] = useState("");
  const [agencyId, setAgencyId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [title, setTitle] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [doneJob, setDoneJob] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/branding/catalog");
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || "catalog failed");
        if (!cancelled) setCatalog(data.catalog);
      } catch (err) {
        if (!cancelled) setCatalogError(err.message || "שגיאה בטעינת סוכנים");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const agencies = catalog?.agencies || [];
  const agentsForAgency = useMemo(() => {
    const all = catalog?.agents || [];
    if (!agencyId) return [];
    return all.filter((a) => a.agencyId === agencyId);
  }, [catalog, agencyId]);

  useEffect(() => {
    if (!agentsForAgency.some((a) => a.id === agentId)) {
      setAgentId(agentsForAgency[0]?.id || "");
    }
  }, [agentsForAgency, agentId]);

  const onPickFiles = useCallback((ev) => {
    const list = Array.from(ev.target.files || []);
    ev.target.value = "";
    setFiles((prev) => {
      const merged = [...prev];
      for (const f of list) {
        if (merged.length >= MAX_FILES) break;
        const key = `${f.name}:${f.size}:${f.lastModified}`;
        if (merged.some((x) => `${x.name}:${x.size}:${x.lastModified}` === key)) continue;
        merged.push(f);
      }
      return merged;
    });
  }, []);

  const removeFile = (idx) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const canSubmit =
    city.trim() &&
    street.trim() &&
    agencyId &&
    agentId &&
    files.length > 0 &&
    !submitting;

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!canSubmit) return;
    setError("");
    setDoneJob(null);
    setSubmitting(true);
    setProgress({ phase: "create", fileIndex: 0, fileTotal: files.length, filePct: 0 });

    try {
      const createRes = await fetch("/api/branding/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: city.trim(),
          street: street.trim(),
          agencyId,
          agentId,
          title: title.trim(),
          propertyType,
          notes: notes.trim(),
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok || !createData.ok) {
        throw new Error(createData.error || "יצירת העבודה נכשלה");
      }
      const jobId = createData.job.id;

      for (let i = 0; i < files.length; i++) {
        setProgress({
          phase: "upload",
          fileIndex: i,
          fileTotal: files.length,
          filePct: 0,
          fileName: files[i].name,
        });
        await uploadFileWithProgress(jobId, files[i], (pct) => {
          setProgress({
            phase: "upload",
            fileIndex: i,
            fileTotal: files.length,
            filePct: pct,
            fileName: files[i].name,
          });
        });
      }

      const finalRes = await fetch(`/api/branding/jobs/${encodeURIComponent(jobId)}`);
      const finalData = await finalRes.json();
      if (!finalRes.ok || !finalData.ok) {
        throw new Error(finalData.error || "לא ניתן לטעון את העבודה");
      }
      setDoneJob(finalData.job);
      setFiles([]);
      setNotes("");
      setTitle("");
      onCreated?.(finalData.job);
    } catch (err) {
      setError(err.message || "שגיאה בשליחה");
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  if (catalogError) {
    return (
      <div style={{ ...glassPanel, padding: 24, maxWidth: 640 }}>
        <div className="visio-admin-error">{catalogError}</div>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div style={{ padding: 40, display: "flex", justifyContent: "center" }}>
        <Loader2 size={24} color={ADMIN.gold} className="visio-spin" />
      </div>
    );
  }

  const overallPct =
    progress?.phase === "upload" && progress.fileTotal
      ? ((progress.fileIndex + progress.filePct) / progress.fileTotal) * 100
      : progress?.phase === "create"
        ? 2
        : 0;

  return (
    <form onSubmit={handleSubmit} style={{ ...glassPanel, padding: 28, maxWidth: 640 }}>
      <div style={{ display: "grid", gap: 14 }}>
        <div>
          <label className="visio-admin-label">עיר *</label>
          <input
            className="visio-admin-input"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            required
            autoComplete="address-level2"
          />
        </div>
        <div>
          <label className="visio-admin-label">רחוב *</label>
          <input
            className="visio-admin-input"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            required
            autoComplete="street-address"
          />
        </div>
        <div>
          <label className="visio-admin-label">כותרת נכס (אופציונלי)</label>
          <input
            className="visio-admin-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="למשל: דירת 4 חדרים מול הים"
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label className="visio-admin-label">סוכנות *</label>
            <select
              className="visio-admin-input"
              value={agencyId}
              onChange={(e) => setAgencyId(e.target.value)}
              required
            >
              <option value="">בחרו סוכנות</option>
              {agencies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.labelHe || a.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="visio-admin-label">סוכן מטפל *</label>
            <select
              className="visio-admin-input"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              required
              disabled={!agencyId}
            >
              <option value="">{agencyId ? "בחרו סוכן" : "בחרו סוכנות קודם"}</option>
              {agentsForAgency.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.labelHe || a.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="visio-admin-label">סוג נכס</label>
          <select
            className="visio-admin-input"
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value)}
          >
            {PROPERTY_TYPES.map((t) => (
              <option key={t.id || "none"} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="visio-admin-label">הערות</label>
          <textarea
            className="visio-admin-input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{ resize: "vertical", fontFamily: "inherit" }}
          />
        </div>

        <div>
          <label className="visio-admin-label">תמונות * (jpg / png / webp / heic)</label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "16px 18px",
              border: `1px dashed ${ADMIN.border}`,
              borderRadius: 2,
              cursor: submitting ? "not-allowed" : "pointer",
              color: ADMIN.muted,
              fontSize: 13,
            }}
          >
            <Upload size={18} color={ADMIN.gold} />
            בחרו קבצים או גררו לכאן
            <input
              type="file"
              accept={ACCEPT}
              multiple
              disabled={submitting}
              onChange={onPickFiles}
              style={{ display: "none" }}
            />
          </label>
          {files.length > 0 && (
            <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, maxHeight: 220, overflow: "auto" }}>
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${f.size}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "8px 0",
                    borderBottom: `1px solid ${ADMIN.border}`,
                    fontSize: 12,
                    color: ADMIN.text,
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} dir="ltr">
                    {f.name} · {formatBytes(f.size)}
                  </span>
                  <button
                    type="button"
                    className="visio-admin-btn-ghost"
                    onClick={() => removeFile(i)}
                    disabled={submitting}
                    aria-label="הסר"
                    style={{ padding: 6 }}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {progress && (
          <div>
            <div style={{ fontSize: 11, color: ADMIN.muted, marginBottom: 6 }}>
              {progress.phase === "create"
                ? "יוצרים עבודה…"
                : `מעלים ${progress.fileIndex + 1}/${progress.fileTotal}: ${progress.fileName || ""}`}
            </div>
            <div style={{ height: 6, background: ADMIN.border, borderRadius: 2, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${Math.min(100, overallPct).toFixed(1)}%`,
                  background: ADMIN.gold,
                  transition: "width .15s linear",
                }}
              />
            </div>
          </div>
        )}

        {error && <div className="visio-admin-error">{error}</div>}

        {doneJob && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: 12,
              border: `1px solid ${ADMIN.success}`,
              color: ADMIN.success,
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              העבודה נוצרה במצב <strong dir="ltr">pending</strong>
              <div style={{ color: ADMIN.muted, fontSize: 11, marginTop: 4 }} dir="ltr">
                {doneJob.id} · {doneJob.originals?.length || 0} files · agent={doneJob.agentId}
              </div>
              <div style={{ color: ADMIN.muted, fontSize: 11 }}>מופיעה בטאב עבודות באנר. העיבוד ב-ComfyUI הוא Phase 3.</div>
            </div>
          </div>
        )}

        <button type="submit" className="visio-admin-btn-primary" disabled={!canSubmit} style={{ opacity: canSubmit ? 1 : 0.5 }}>
          {submitting ? "שולח…" : "שלח לברנדינג"}
        </button>
      </div>
    </form>
  );
}
