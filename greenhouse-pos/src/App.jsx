// src/App.jsx
import React, { useEffect, useState } from "react";
import "./App.css";

import POS from "./pages/POS";
import Invoices from "./pages/Invoices";
import ProductAdmin from "./pages/ProductAdmin";
import Reports from "./pages/Reports";
import Login from "./pages/Login";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import api from "./lib/api";

export default function App() {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem("ACTIVE_TAB") || "pos";
  });
  const [apiHealthy, setApiHealthy] = useState(true);
  const [forceRender, setForceRender] = useState(0);

  // which login screen to show when logged out
  const [authMode, setAuthMode] = useState("store"); // "store" | "admin"

  // admin-only view state inside admin shell
  const [adminActiveView, setAdminActiveView] = useState("admin"); // "admin" | "pos" | "invoices" | "reports"

  // secret admin modal state (still works inside app)
  const [brandClickCount, setBrandClickCount] = useState(0);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminUser, setAdminUser] = useState("admin");
  const [adminPass, setAdminPass] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState(null);

  // 🔐 check if store or admin is logged in
// We distinguish between:
// - "full" admin login (Admin panel)
// - "overlay" admin (hidden 7-click owner unlock inside store shell)
const storeToken = localStorage.getItem("STORE_TOKEN");
const adminToken = localStorage.getItem("ADMIN_TOKEN");
const adminMode = localStorage.getItem("ADMIN_MODE") || "full"; // "full" | "overlay"

const isStoreLoggedIn = !!storeToken;

// Full admin shell only when ADMIN_MODE === "full"
const isAdminLoggedIn = !!adminToken && adminMode === "full";

// Overlay admin (owner unlock in store shell) – still counts as “logged in”
// but should NEVER activate the admin shell by itself.
const isOverlayAdmin = !!adminToken && adminMode === "overlay";

// Overall “someone is logged in”
const isLoggedIn = isStoreLoggedIn || isAdminLoggedIn || isOverlayAdmin;

  // Ping backend health so status pill can show OK / offline
  useEffect(() => {
    let cancelled = false;

    async function ping() {
      try {
        await api.health();
        if (!cancelled) {
          setApiHealthy(true);
        }
      } catch (err) {
        if (!cancelled) {
          setApiHealthy(false);
          console.error("health ping failed", err);
        }
      }
    }

    // Initial ping
    ping();

    // Only ping while page is visible to avoid background storming when app is open in multiple tabs
    // Use a slightly longer default interval (60s) and skip pings while document is hidden.
    let id = null;

    function schedulePing() {
      if (id) clearInterval(id);
      id = setInterval(() => {
        try {
          if (typeof document !== 'undefined' && document.hidden) {
            // tab in background — skip this cycle
            return;
          }
          ping();
        } catch (err) {
          // swallow errors to avoid breaking the timer loop
          console.warn('ping loop error', err);
        }
      }, 60000); // 60s
    }

    // Ping immediately and then start scheduled pings
    schedulePing();

    // When user returns to the tab, do one immediate ping (but throttle to avoid rapid repeats)
    let lastImmediatePing = 0;
    function handleVisibility() {
      if (typeof document !== 'undefined' && !document.hidden) {
        const now = Date.now();
        if (now - lastImmediatePing > 5000) {
          lastImmediatePing = now;
          ping();
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      if (id) clearInterval(id);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Hidden owner/admin unlock: click brand 7 times
  useEffect(() => {
    if (brandClickCount >= 7) {
      setShowAdminModal(true);
      setBrandClickCount(0);
    }
  }, [brandClickCount]);

  function handleBrandClick() {
    setBrandClickCount((c) => c + 1);
  }

  async function handleAdminSubmit(e) {
    e.preventDefault();
    setAdminError(null);
    setAdminLoading(true);

    // 🚦 IMPORTANT:
    // Hidden owner modal is ONLY for "extra powers" while a store is already logged in.
    // If there is no store token, tell user to use the Admin login tab instead.
    if (!isStoreLoggedIn) {
      setAdminLoading(false);
      setAdminError(
        "Please log in to a store first, or use the Admin login tab at the top."
      );
      return;
    }

      try {
    const res = await api.adminLogin({
      username: adminUser,
      password: adminPass,
    });
    // store ADMIN_USERNAME for header display if needed
    if (res && res.username) {
      localStorage.setItem("ADMIN_USERNAME", res.username);
    }

    // 🔐 IMPORTANT: this is an *overlay* admin, not full Admin shell
    localStorage.setItem("ADMIN_MODE", "overlay");

    setShowAdminModal(false);
    setAdminPass("");
    // We intentionally do NOT redirect or reload.
    // We stay in the store shell, but now admin-only actions (e.g. void invoice)
    // can use the ADMIN_TOKEN under the hood.
  } catch (err) {
      console.error("admin login error", err);
      setAdminError(err.message || "Admin login failed");
    } finally {
      setAdminLoading(false);
    }
  }

  function handleLogout() {
  // Clear store/admin tokens and reload to show login page again
  localStorage.removeItem("STORE_TOKEN");
  localStorage.removeItem("STORE_ID");
  localStorage.removeItem("STORE_NAME");
  localStorage.removeItem("ADMIN_TOKEN");
  localStorage.removeItem("ADMIN_USERNAME");
  localStorage.removeItem("ADMIN_SELECTED_STORE_ID");
  localStorage.removeItem("ADMIN_MODE"); // 👈 new
  window.location.reload();
}

  // 🧠 Decide what page content to show for store mode
  let content = null;
  if (activeTab === "pos") {
    content = <POS />;
  } else if (activeTab === "invoices") {
    content = <Invoices />;
  } else if (activeTab === "products") {
    content = <ProductAdmin />;
  } else if (activeTab === "reports") {
    content = <Reports />;
  }

  // 🔐 Shared admin modal JSX (used in both shells)
  const adminModal =
    showAdminModal && (
      <div
        className="admin-modal-backdrop"
        onClick={() => !adminLoading && setShowAdminModal(false)}
      >
        <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
          <h2>Owner unlock</h2>
          <div className="admin-hint">
            Hidden login for owner / manager. Press Esc to close.
          </div>

          {adminError && (
            <div className="error-box" style={{ marginTop: 8 }}>
              {adminError}
            </div>
          )}

          <form
            onSubmit={handleAdminSubmit}
            style={{ marginTop: 10, display: "grid", gap: 8 }}
          >
            <label className="form-label">
              Username
              <input
                className="pos-input"
                type="text"
                value={adminUser}
                onChange={(e) => setAdminUser(e.target.value)}
                autoComplete="username"
              />
            </label>

            <label className="form-label">
              Password
              <input
                className="pos-input"
                type="password"
                value={adminPass}
                onChange={(e) => setAdminPass(e.target.value)}
                autoComplete="current-password"
              />
            </label>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 4,
              }}
            >
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowAdminModal(false)}
                disabled={adminLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={adminLoading}
              >
                {adminLoading ? "Unlocking…" : "Unlock"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );

  // 🔒 If NOT logged in → show ONLY auth screen (store or admin)
  if (!isLoggedIn) {
    return (
      <div className="app-shell">
        <main className="app-content">
          <div style={{ maxWidth: 420, margin: "0 auto", width: "100%" }}>
            {/* toggle between Store / Admin login */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: 12,
                gap: 6,
              }}
            >
              <button
                type="button"
                className={
                  authMode === "store"
                    ? "btn-ghost app-auth-toggle app-auth-toggle--active"
                    : "btn-ghost app-auth-toggle"
                }
                onClick={() => setAuthMode("store")}
              >
                Store login
              </button>
              <button
                type="button"
                className={
                  authMode === "admin"
                    ? "btn-ghost app-auth-toggle app-auth-toggle--active"
                    : "btn-ghost app-auth-toggle"
                }
                onClick={() => setAuthMode("admin")}
              >
                Admin login
              </button>
            </div>

            {authMode === "store" ? <Login /> : <AdminLogin />}
          </div>
        </main>
      </div>
    );
  }

  // 👑 Admin shell ONLY when admin is logged in AND there is NO store logged in
  // (full back-office mode)
  // 👑 Admin shell whenever ADMIN_TOKEN exists
// (admin can impersonate stores but stays in the admin UI)
if (isAdminLoggedIn) {
  let adminContent = null;

  if (adminActiveView === "admin") {
    adminContent = (
      <AdminDashboard
        onOpenStoreTab={(tab) => {
          // tab is "pos" | "invoices" | "reports"
          setAdminActiveView(tab || "pos");
        }}
      />
    );
  } else if (adminActiveView === "pos") {
    adminContent = <POS />;
  } else if (adminActiveView === "invoices") {
    adminContent = <Invoices />;
  } else if (adminActiveView === "reports") {
    adminContent = <Reports />;
  }

  return (
    <div className="app-shell">
      <header className="app-nav">
        <button
          type="button"
          className="app-brand"
          onClick={handleBrandClick}
        >
          GREENHOUSE POS — Admin
        </button>

        <nav className="app-tabs">
          <button
            type="button"
            className={
              adminActiveView === "admin"
                ? "app-tab app-tab--active"
                : "app-tab"
            }
            onClick={() => setAdminActiveView("admin")}
          >
            Admin console
          </button>
          <button
            type="button"
            className={
              adminActiveView === "pos"
                ? "app-tab app-tab--active"
                : "app-tab"
            }
            onClick={() => setAdminActiveView("pos")}
          >
            POS
          </button>
          <button
            type="button"
            className={
              adminActiveView === "invoices"
                ? "app-tab app-tab--active"
                : "app-tab"
            }
            onClick={() => setAdminActiveView("invoices")}
          >
            Invoices
          </button>
          <button
            type="button"
            className={
              adminActiveView === "reports"
                ? "app-tab app-tab--active"
                : "app-tab"
            }
            onClick={() => setAdminActiveView("reports")}
          >
            Reports
          </button>
        </nav>

        <div className="app-status">
          <span
            className={
              apiHealthy
                ? "status-pill status-pill--ok"
                : "status-pill status-pill--warn"
            }
          >
            {apiHealthy ? "Admin online" : "API offline"}
          </span>
          <button
            type="button"
            className="btn-ghost"
            onClick={handleLogout}
            style={{ marginLeft: 8 }}
          >
            Logout
          </button>
        </div>
      </header>

      <main className="app-content">{adminContent}</main>

      {adminModal}
    </div>
  );
}

  // ✅ Store-logged-in shell (normal staff, even if ADMIN_TOKEN also exists for extra powers)
  if (isStoreLoggedIn) {
    return (
      <div className="app-shell">
        {/* Top nav */}
        <header className="app-nav">
          <button
            type="button"
            className="app-brand"
            onClick={handleBrandClick}
          >
            GREENHOUSE POS
          </button>

          <nav className="app-tabs">
            <button
              type="button"
              className={
                activeTab === "pos" ? "app-tab app-tab--active" : "app-tab"
              }
              onClick={() => setActiveTab("pos")}
            >
              POS
            </button>
            <button
              type="button"
              className={
                activeTab === "invoices"
                  ? "app-tab app-tab--active"
                  : "app-tab"
              }
              onClick={() => setActiveTab("invoices")}
            >
              Invoices
            </button>
            <button
              type="button"
              className={
                activeTab === "products"
                  ? "app-tab app-tab--active"
                  : "app-tab"
              }
              onClick={() => setActiveTab("products")}
            >
              Products
            </button>
            <button
              type="button"
              className={
                activeTab === "reports"
                  ? "app-tab app-tab--active"
                  : "app-tab"
              }
              onClick={() => setActiveTab("reports")}
            >
              Reports
            </button>
          </nav>

          <div className="app-status">
            <span
              className={
                apiHealthy
                  ? "status-pill status-pill--ok"
                  : "status-pill status-pill--warn"
              }
            >
              {apiHealthy ? "Store online" : "API offline"}
            </span>
            <button
              type="button"
              className="btn-ghost"
              onClick={handleLogout}
              style={{ marginLeft: 8 }}
            >
              Logout
            </button>
          </div>
        </header>

        {/* Main content under nav */}
        <main className="app-content">{content}</main>

        {adminModal}
      </div>
    );
  }

  // Fallback (shouldn’t really happen)
  return null;
}