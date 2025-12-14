// src/pages/Login.jsx
import React, { useState, useEffect, useRef } from "react";
import api from "../lib/api";

export default function Login() {
  const [username, setUsername] = useState("store1");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const userInputRef = useRef(null);

  useEffect(() => {
    // focus username on first load
    if (userInputRef.current) {
      userInputRef.current.focus();
      userInputRef.current.select();
    }
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.loginStore({
        username,
        password,
      });

      // api.loginStore already stores STORE_TOKEN & STORE_ID,
      // but we also safely set STORE_ID here if present
      if (res && res.store_id) {
        localStorage.setItem("STORE_ID", String(res.store_id));
      }

      // 🔁 Hard reload so App.jsx sees the token and switches to POS
      window.location.reload();
    } catch (err) {
      console.error("login error", err);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="pos-shell login-shell">
        {/* Header */}
        <header className="login-header">
          <div>
            <h1 className="pos-title">Store Login</h1>
            <p className="pos-subtitle">
              Sign in to start billing on this terminal.
            </p>
          </div>
          <div className="login-pill">
            <span className="login-pill-dot" />
            <span>Greenhouse POS</span>
          </div>
        </header>

        {/* Small hint row */}
        <div className="login-hint-row">
          <div className="login-hint-main">
            <span className="login-hint-label">Demo credentials</span>
            <span className="login-hint-value">store1 / store1pass</span>
          </div>
          <div className="login-hint-sub">
            Terminal ID will identify this counter in reports.
          </div>
        </div>

        {error && (
          <div className="error-box" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form className="login-form" onSubmit={submit}>
          <div className="login-grid">
            <label className="form-label">
              Username
              <input
                ref={userInputRef}
                className="pos-input"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </label>

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
          </div>

          <div className="login-actions">
            <button
              type="submit"
              className="btn-primary login-submit-btn"
              disabled={loading}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}