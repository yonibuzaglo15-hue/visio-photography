"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { ADMIN, glassPanel } from "./theme.js";
import {
  PACKAGE_OPTIONS,
  PROPERTY_TYPES,
  emptyDetails,
  normalizeDetails,
  softValidateIsraeliPhone,
} from "@/lib/pipeline/job-details.js";

function Field({ label, required, children }) {
  return (
    <label style={{ display: "block" }}>
      <span className="visio-admin-label">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

/**
 * Modal form for create / edit pipeline job details.
 * Does not upload files or trigger the tour pipeline.
 */
export default function JobDetailsForm({
  mode = "edit",
  initialDetails = null,
  jobId = null,
  onCancel,
  onSaved,
}) {
  const [catalog, setCatalog] = useState(null);
  const [details, setDetails] = useState(() =>
    initialDetails ? normalizeDetails(initialDetails) : emptyDetails()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [phoneWarning, setPhoneWarning] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/branding/catalog");
        const data = await res.json();
        if (!cancelled && data.ok) setCatalog(data.catalog);
      } catch {
        /* catalog optional for display; agency select needs it */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (initialDetails) setDetails(normalizeDetails(initialDetails));
  }, [initialDetails]);

  const agencies = catalog?.agencies || [];
  const agentsForAgency = useMemo(() => {
    const all = catalog?.agents || [];
    if (!details.agency.agencyId) return [];
    return all.filter((a) => a.agencyId === details.agency.agencyId);
  }, [catalog, details.agency.agencyId]);

  useEffect(() => {
    if (
      details.agency.agentId &&
      agentsForAgency.length > 0 &&
      !agentsForAgency.some((a) => a.id === details.agency.agentId)
    ) {
      setDetails((d) => ({
        ...d,
        agency: { ...d.agency, agentId: agentsForAgency[0]?.id || "" },
      }));
    }
  }, [agentsForAgency, details.agency.agentId]);

  const setProperty = (key, value) =>
    setDetails((d) => ({ ...d, property: { ...d.property, [key]: value } }));
  const setClient = (key, value) =>
    setDetails((d) => ({ ...d, client: { ...d.client, [key]: value } }));
  const setShoot = (key, value) =>
    setDetails((d) => ({ ...d, shoot: { ...d.shoot, [key]: value } }));

  const onPhoneBlur = () => {
    const check = softValidateIsraeliPhone(details.client.phone);
    setPhoneWarning(check.warning);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      if (!details.property.street.trim()) throw new Error("רחוב הוא שדה חובה");
      if (!details.property.city.trim()) throw new Error("עיר היא שדה חובה");
      if (!details.agency.agencyId) throw new Error("סוכנות היא שדה חובה");
      if (!details.agency.agentId) throw new Error("סוכן מטפל הוא שדה חובה");

      if (mode === "create") {
        const res = await fetch("/api/pipeline/create-job", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ details, requireDetails: true }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "יצירה נכשלה");
        onSaved?.(data.job, { phoneWarning: softValidateIsraeliPhone(details.client.phone).warning });
        return;
      }

      if (!jobId) throw new Error("חסר job id");
      const res = await fetch(`/api/pipeline/jobs/${encodeURIComponent(jobId)}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ details }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "שמירה נכשלה");
      setPhoneWarning(data.phoneWarning || null);
      onSaved?.(data.job, { phoneWarning: data.phoneWarning });
    } catch (err) {
      setError(err.message || "שגיאה");
    } finally {
      setSaving(false);
    }
  };

  const title = mode === "create" ? "הזמנה חדשה" : "עריכת פרטי הזמנה";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "var(--visio-overlay-scrim)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 16px",
        overflowY: "auto",
      }}
      onClick={onCancel}
    >
      <div
        style={{ ...glassPanel, width: "100%", maxWidth: 640, padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 className="visio-admin-section-title" style={{ margin: 0 }}>{title}</h2>
          <button type="button" className="visio-admin-btn-ghost" onClick={onCancel} aria-label="סגור">
            <X size={16} />
          </button>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div className="visio-admin-section-title" style={{ fontSize: 13, margin: 0 }}>נכס</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
            <Field label="רחוב" required>
              <input className="visio-admin-input" value={details.property.street} onChange={(e) => setProperty("street", e.target.value)} dir="rtl" />
            </Field>
            <Field label="מספר בית">
              <input className="visio-admin-input" value={details.property.houseNumber} onChange={(e) => setProperty("houseNumber", e.target.value)} dir="rtl" />
            </Field>
            <Field label="דירה">
              <input className="visio-admin-input" value={details.property.apartment} onChange={(e) => setProperty("apartment", e.target.value)} dir="rtl" />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="קומה">
              <input className="visio-admin-input" value={details.property.floor} onChange={(e) => setProperty("floor", e.target.value)} dir="rtl" />
            </Field>
            <Field label="עיר" required>
              <input className="visio-admin-input" value={details.property.city} onChange={(e) => setProperty("city", e.target.value)} dir="rtl" />
            </Field>
            <Field label="סוג נכס">
              <select className="visio-admin-input" value={details.property.propertyType} onChange={(e) => setProperty("propertyType", e.target.value)}>
                <option value="">—</option>
                {PROPERTY_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="חדרים">
              <input className="visio-admin-input" value={details.property.rooms} onChange={(e) => setProperty("rooms", e.target.value)} dir="ltr" />
            </Field>
            <Field label={'מ"ר'}>
              <input className="visio-admin-input" value={details.property.sqm} onChange={(e) => setProperty("sqm", e.target.value)} dir="ltr" />
            </Field>
          </div>

          <div className="visio-admin-section-title" style={{ fontSize: 13, margin: "8px 0 0" }}>סוכן</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="סוכנות" required>
              <select
                className="visio-admin-input"
                value={details.agency.agencyId}
                onChange={(e) =>
                  setDetails((d) => ({
                    ...d,
                    agency: { agencyId: e.target.value, agentId: "" },
                  }))
                }
              >
                <option value="">— בחר —</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>{a.labelHe || a.label}</option>
                ))}
              </select>
            </Field>
            <Field label="סוכן מטפל" required>
              <select
                className="visio-admin-input"
                value={details.agency.agentId}
                onChange={(e) =>
                  setDetails((d) => ({
                    ...d,
                    agency: { ...d.agency, agentId: e.target.value },
                  }))
                }
                disabled={!details.agency.agencyId}
              >
                <option value="">— בחר —</option>
                {agentsForAgency.map((a) => (
                  <option key={a.id} value={a.id}>{a.labelHe || a.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="visio-admin-section-title" style={{ fontSize: 13, margin: "8px 0 0" }}>לקוח</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="שם">
              <input className="visio-admin-input" value={details.client.name} onChange={(e) => setClient("name", e.target.value)} dir="rtl" />
            </Field>
            <Field label="טלפון">
              <input
                className="visio-admin-input"
                value={details.client.phone}
                onChange={(e) => setClient("phone", e.target.value)}
                onBlur={onPhoneBlur}
                dir="ltr"
              />
            </Field>
          </div>
          {phoneWarning && (
            <div style={{ fontSize: 12, color: ADMIN.gold }}>{phoneWarning}</div>
          )}
          <Field label="אימייל">
            <input className="visio-admin-input" value={details.client.email} onChange={(e) => setClient("email", e.target.value)} dir="ltr" />
          </Field>

          <div className="visio-admin-section-title" style={{ fontSize: 13, margin: "8px 0 0" }}>צילום</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="תאריך">
              <input className="visio-admin-input" value={details.shoot.date} onChange={(e) => setShoot("date", e.target.value)} dir="ltr" placeholder="DD/MM/YYYY" />
            </Field>
            <Field label="שעה">
              <input className="visio-admin-input" value={details.shoot.time} onChange={(e) => setShoot("time", e.target.value)} dir="ltr" placeholder="10:00" />
            </Field>
            <Field label="חבילה">
              <select className="visio-admin-input" value={details.shoot.pkg} onChange={(e) => setShoot("pkg", e.target.value)}>
                {PACKAGE_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="הערות">
            <textarea
              className="visio-admin-input"
              rows={3}
              value={details.notes}
              onChange={(e) => setDetails((d) => ({ ...d, notes: e.target.value }))}
              dir="rtl"
              style={{ resize: "vertical" }}
            />
          </Field>
        </div>

        {error && <div className="visio-admin-error" style={{ marginTop: 16 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
          <button type="button" className="visio-admin-btn-ghost" onClick={onCancel} disabled={saving}>
            ביטול
          </button>
          <button type="button" className="visio-admin-btn-primary" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={14} className="visio-spin" /> : null}
            {saving ? " שומר…" : "שמירה"}
          </button>
        </div>
      </div>
    </div>
  );
}
