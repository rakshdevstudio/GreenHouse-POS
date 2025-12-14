// src/pages/AdminLogin.jsx
import React, { useState } from "react";
import api from "../lib/api";

export default function AdminLogin({ onLoggedIn }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
      try {
    const res = await api.adminLogin({ username, password });
    if (res && res.username) {
      localStorage.setItem("ADMIN_USERNAME", res.username);
    }

    // ✅ This is a real Admin login – enable full admin shell
    localStorage.setItem("ADMIN_MODE", "full");

    // reload to let App.jsx pick up ADMIN_TOKEN + ADMIN_MODE=full
    window.location.reload();
  } catch (err) {
      console.error("admin login error", err);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-login-page">
      <div className="admin-login-shell">
        {/* Header row – same vibe as store login */}
        <div className="admin-login-header">
          <div className="admin-login-pill">
            <span className="admin-login-pill-dot" />
            <span>Admin console</span>
          </div>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            View all stores & reports
          </span>
        </div>


        {/* Error box */}
        {error && (
          <div className="error-box" style={{ marginBottom: 10 }}>
            {error}
          </div>
        )}

        {/* Form – uses same grid + form-label + pos-input as store login */}
        <form className="admin-login-form" onSubmit={submit}>
          <div className="admin-login-grid">
            <div>
              <label className="form-label">
                Username
                <input
                  className="pos-input"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </label>
            </div>

            <div>
              <label className="form-label">
                Password
                <input
                  className="pos-input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              <div className="admin-login-field-hint">
                Only trusted staff should have this login.
              </div>
            </div>
          </div>

          <div className="admin-login-actions">
            <div className="admin-login-remember">
              <span className="admin-login-remember-title">Security note</span>
              <span className="admin-login-remember-text">
                Admin can view and control all {`stores'`} POS, invoices and
                monthly reports. Do not share this account casually.
              </span>
            </div>

            <button
              type="submit"
              className="btn-primary admin-login-submit-btn"
              disabled={loading}
            >
              {loading ? "Signing in…" : "Sign in as admin"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}