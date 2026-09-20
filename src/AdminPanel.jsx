"use client";

import ArielOrchestrator from "./ArielOrchestrator.jsx";
import AgentsAdmin from "./AgentsAdmin.jsx";
import IntakeHub from "./admin/IntakeHub.jsx";
import { useState } from "react";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  GitBranch,
  Calendar,
  Camera,
  Bot,
  Settings,
  LogOut,
  Menu,
  Loader2,
  User,
  Globe,
  Shield,
  Home,
} from "lucide-react";
import { ADMIN, glassPanel } from "./admin/theme.js";

const MOCK_BOOKINGS = [
  { id: 1, name: "דוד כהן", phone: "052-1234567", address: "רוטשילד 12, אשדוד", pkg: "SIGNATURE", date: "10/06/2025", time: "10:00", status: "confirmed" },
  { id: 2, name: "שרה לוי", phone: "054-7654321", address: "הרצל 5, יבנה", pkg: "PRESTIGE", date: "12/06/2025", time: "14:00", status: "pending" },
  { id: 3, name: "משה גרין", phone: "050-9876543", address: "בן גוריון 33, אשדוד", pkg: "ESSENTIAL", date: "15/06/2025", time: "09:00", status: "confirmed" },
];

const STATUS_COLOR = { confirmed: ADMIN.success, pending: ADMIN.gold, cancelled: ADMIN.error };
const STATUS_HEB = { confirmed: "מאושר", pending: "ממתין", cancelled: "בוטל" };

const TABS = [
  { id: "overview", label: "סקירה", Icon: LayoutDashboard },
  { id: "new-property", label: "נכס חדש", Icon: Home },
  { id: "pipeline", label: "Pipeline", Icon: GitBranch },
  { id: "bookings", label: "הזמנות", Icon: Calendar },
  { id: "portfolio", label: "פורטפוליו", Icon: Camera },
  { id: "agents", label: "סוכנים", Icon: Bot },
  { id: "settings", label: "הגדרות", Icon: Settings },
];

function StatCard({ Icon, label, value, sub }) {
  return (
    <div className="visio-admin-stat">
      <Icon size={20} color={ADMIN.gold} strokeWidth={1.5} />
      <div className="visio-admin-stat-value">{value}</div>
      <div className="visio-admin-stat-label">{label}</div>
      {sub && <div className="visio-admin-stat-sub">{sub}</div>}
    </div>
  );
}

function AdminDashboard({ admin, onLogout, activeTab, setActiveTab }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bookings, setBookings] = useState(MOCK_BOOKINGS);
  const [newPkg, setNewPkg] = useState({ title: "", sub: "", partner: "ReHouse", matterport: "" });
  const [saved, setSaved] = useState(false);

  const revenue = bookings.filter((b) => b.status === "confirmed").reduce((s, b) => {
    const prices = { ESSENTIAL: 350, SIGNATURE: 400, PRESTIGE: 750 };
    return s + (prices[b.pkg] || 0);
  }, 0);

  const toggleStatus = (id) => {
    setBookings((bs) =>
      bs.map((b) =>
        b.id === id
          ? { ...b, status: b.status === "confirmed" ? "pending" : b.status === "pending" ? "cancelled" : "confirmed" }
          : b
      )
    );
  };

  return (
    <div className="visio-admin-shell">
      <header className="visio-admin-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" className="visio-admin-sidebar-toggle" onClick={() => setSidebarOpen((o) => !o)} aria-label="תפריט">
            <Menu size={20} />
          </button>
          <span style={{ fontFamily: ADMIN.fontDisplay, fontSize: 20, letterSpacing: 5, color: ADMIN.gold }}>VISIO</span>
          <span className="visio-admin-badge">CONTROL CENTER</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontSize: 12,
              color: ADMIN.text,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
            dir="ltr"
            title="חשבון מחובר"
          >
            {admin.email || admin.name || "—"}
          </span>
          <button
            type="button"
            className="visio-admin-btn-signout"
            onClick={onLogout}
            aria-label="התנתק"
          >
            <LogOut size={14} />
            התנתק
          </button>
        </div>
      </header>

      <div className="visio-admin-layout">
        {sidebarOpen && <div className="nav-overlay" style={{ display: "block", top: 56 }} onClick={() => setSidebarOpen(false)} />}
        <aside className={`visio-admin-sidebar${sidebarOpen ? " open" : ""}`}>
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={`visio-admin-nav-item${activeTab === id ? " active" : ""}`}
              onClick={() => { setActiveTab(id); setSidebarOpen(false); }}
            >
              <Icon size={18} strokeWidth={1.5} />
              {label}
            </button>
          ))}
          <div style={{ marginTop: "auto", paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 11, color: ADMIN.muted, marginBottom: 8, direction: "ltr", wordBreak: "break-all" }}>
              {admin.email || admin.name}
            </div>
            <button type="button" className="visio-admin-btn-signout" style={{ width: "100%" }} onClick={onLogout}>
              <LogOut size={14} />
              התנתק
            </button>
          </div>
        </aside>

        <main className="visio-admin-main">
          {activeTab === "overview" && (
            <>
              <h1 className="visio-admin-page-title">סקירה כללית</h1>
              <div className="visio-admin-stats-grid">
                <StatCard Icon={Calendar} label="הזמנות החודש" value={bookings.length} sub="סה״כ" />
                <StatCard Icon={Shield} label="מאושרות" value={bookings.filter((b) => b.status === "confirmed").length} />
                <StatCard Icon={Loader2} label="ממתינות" value={bookings.filter((b) => b.status === "pending").length} />
                <StatCard Icon={LayoutDashboard} label="הכנסה צפויה" value={`₪${revenue.toLocaleString()}`} sub="ללא מע״מ" />
              </div>
              <h2 className="visio-admin-section-title">הזמנות אחרונות</h2>
              <div className="visio-admin-table">
                {bookings.slice(0, 3).map((b) => (
                  <div key={b.id} className="visio-admin-table-row">
                    <div>
                      <div style={{ color: ADMIN.text, fontSize: 14 }}>{b.name}</div>
                      <div style={{ color: ADMIN.muted, fontSize: 11 }}>{b.phone}</div>
                    </div>
                    <div style={{ color: ADMIN.muted, fontSize: 12 }}>{b.date} · {b.time}</div>
                    <span className="visio-admin-tag">{b.pkg}</span>
                    <span style={{ color: STATUS_COLOR[b.status], fontSize: 11 }}>{STATUS_HEB[b.status]}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === "new-property" && (
            <>
              <h1 className="visio-admin-page-title">נכס חדש</h1>
              <div style={{ ...glassPanel, padding: 28, maxWidth: 560 }}>
                <p style={{ color: ADMIN.muted, fontSize: 14, lineHeight: 1.9 }}>
                  טופס העלאת נכס + תור עבודות ComfyUI יגיע ב־Phase 2.
                  הטאב הזה גלוי רק למשתמשים ברשימת <code dir="ltr">ALLOWED_EMAILS</code>.
                </p>
              </div>
            </>
          )}

          {activeTab === "pipeline" && (
            <>
              <h1 className="visio-admin-page-title">Asset Pipeline</h1>
              <IntakeHub />
              <div style={{ marginTop: 24 }}>
                <ArielOrchestrator />
              </div>
            </>
          )}

          {activeTab === "bookings" && (
            <>
              <h1 className="visio-admin-page-title">ניהול הזמנות</h1>
              <div className="visio-admin-table">
                {bookings.map((b) => (
                  <div key={b.id} className="visio-admin-table-row visio-admin-table-row--wide">
                    <div>
                      <div style={{ color: ADMIN.text }}>{b.name}</div>
                      <div style={{ color: ADMIN.muted, fontSize: 11 }}>{b.phone}</div>
                    </div>
                    <div style={{ color: ADMIN.muted, fontSize: 12 }}>{b.address}</div>
                    <div style={{ color: ADMIN.muted, fontSize: 12 }}>{b.date}<br />{b.time}</div>
                    <span className="visio-admin-tag">{b.pkg}</span>
                    <button type="button" className="visio-admin-btn-ghost" onClick={() => toggleStatus(b.id)} style={{ color: STATUS_COLOR[b.status] }}>
                      {STATUS_HEB[b.status]}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === "portfolio" && (
            <>
              <h1 className="visio-admin-page-title">פורטפוליו</h1>
              <div style={{ ...glassPanel, padding: 24, maxWidth: 480 }}>
                <label className="visio-admin-label">כותרת</label>
                <input className="visio-admin-input" value={newPkg.title} onChange={(e) => setNewPkg({ ...newPkg, title: e.target.value })} />
                <label className="visio-admin-label" style={{ marginTop: 12 }}>תת־כותרת</label>
                <input className="visio-admin-input" value={newPkg.sub} onChange={(e) => setNewPkg({ ...newPkg, sub: e.target.value })} />
                <label className="visio-admin-label" style={{ marginTop: 12 }}>שותף</label>
                <input className="visio-admin-input" value={newPkg.partner} onChange={(e) => setNewPkg({ ...newPkg, partner: e.target.value })} />
                <label className="visio-admin-label" style={{ marginTop: 12 }}>Matterport URL</label>
                <input className="visio-admin-input" value={newPkg.matterport} onChange={(e) => setNewPkg({ ...newPkg, matterport: e.target.value })} dir="ltr" />
                <button
                  type="button"
                  className="visio-admin-btn-primary"
                  style={{ marginTop: 16 }}
                  onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }}
                >
                  שמור נכס
                </button>
                {saved && <div style={{ color: ADMIN.success, fontSize: 12, marginTop: 8 }}>נשמר מקומית (דמו)</div>}
              </div>
            </>
          )}

          {activeTab === "agents" && <AgentsAdmin />}

          {activeTab === "settings" && (
            <>
              <h1 className="visio-admin-page-title">הגדרות מערכת</h1>
              <div className="visio-admin-table">
                {[
                  { Icon: User, label: "מחובר", value: admin.email || admin.name },
                  { Icon: Globe, label: "דומיין", value: "visio-photography.vercel.app" },
                  { Icon: Shield, label: "אימות", value: "Google OAuth + ALLOWED_EMAILS" },
                ].map(({ Icon, label, value }) => (
                  <div key={label} className="visio-admin-table-row">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: ADMIN.muted }}>
                      <Icon size={16} />
                      {label}
                    </div>
                    <span style={{ color: ADMIN.text }} dir="ltr">{value}</span>
                  </div>
                ))}
              </div>
              <p style={{ marginTop: 20, fontSize: 12, color: ADMIN.muted, lineHeight: 1.8 }}>
                הרשאות: משתנה סביבה <code dir="ltr">ALLOWED_EMAILS</code> (מופרד בפסיקים). ללא סיסמה מקומית.
              </p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default function AdminPanel({ user }) {
  const [activeTab, setActiveTab] = useState("pipeline");

  const handleLogout = async () => {
    // Full NextAuth sign-out: clears session cookie, then hard-navigates to login.
    await signOut({ callbackUrl: "/admin/login", redirect: true });
  };

  if (!user?.email) {
    return (
      <div style={{ minHeight: "100vh", background: ADMIN.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={28} color={ADMIN.gold} className="visio-spin" />
      </div>
    );
  }

  return (
    <AdminDashboard
      admin={user}
      onLogout={handleLogout}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
    />
  );
}
