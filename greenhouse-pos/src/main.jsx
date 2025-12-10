import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./App.css";   

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("No #root element found in index.html");

const root = createRoot(rootEl);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);