// src/pages/Login.jsx
import React, { useState, useEffect, useRef } from "react";
import api from "../lib/api";

export default function Login() {
  const [username, setUsername] = useState("store1");
  const [password, setPassword] = useState("");
  const [terminalUuid, setTerminalUuid] = useState("");
  const [terminals, setTerminals] = useState([]);
  const [terminalsLoading, setTerminalsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const userInputRef = useRef(null);

  // Focus username on first load
  useEffect(() => {
    if (userInputRef.current) {
      userInputRef.current.focus();
      userInputRef.current.select();
    }
  }, []);

  // Fetch terminals when username changes
  useEffect(() => {
    if (!username) return;

    let cancelled = false;
    setTerminals([]);
    setTerminalUuid("");
    setTerminalsLoading(true);

    api
      .listTerminals({ username })
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.terminals) ? res.terminals : [];
        setTerminals(list);
        if (list.length > 0) {
          setTerminalUuid(list[0].terminal_uuid);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("terminal fetch error", err);
          setError("Unable to load terminals for this store");
          setTerminals([]);
        }
      })
      .finally(() => {
        if (!cancelled) setTerminalsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [username]);

  async function submit(e) {
    e.preventDefault();
    setError(null);

    if (!terminalUuid) {
      setError("Please select a terminal");
      return;
    }

    setLoading(true);

    try {
      const res = await api.loginStore({
        username,
        password,
        terminal_uuid: terminalUuid,
      });

      if (res?.store_id) {
        localStorage.setItem("STORE_ID", String(res.store_id));
      }

      localStorage.setItem("TERMINAL_UUID", terminalUuid);

      // Hard reload so App.jsx switches to POS
      window.location.reload();
    } catch (err) {
      console.error("login error", err);
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="pos-shell login-shell">
        <header className="login-header">
          <div>
            <h1 className="pos-title">Store Login</h1>
            <p className="pos-subtitle">
              Sign in to start billing on this terminal
            </p>
          </div>
          <div className="login-pill">
            <span className="login-pill-dot" />
            <span>Greenhouse POS</span>
          </div>
        </header>

        {error && <div className="error-box">{error}</div>}

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
              Terminal
              <select
                className="pos-input"
                value={terminalUuid}
                onChange={(e) => setTerminalUuid(e.target.value)}
                disabled={terminalsLoading}
                required
              >
                {terminalsLoading && <option>Loading terminals…</option>}
                {!terminalsLoading && terminals.length === 0 && (
                  <option value="">No terminals available</option>
                )}
                {!terminalsLoading &&
                  terminals.map((t) => (
                    <option key={t.terminal_uuid} value={t.terminal_uuid}>
                      {t.label || t.terminal_uuid}
                    </option>
                  ))}
              </select>
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