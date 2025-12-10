// src/lib/offline.js

// Simple localStorage-based offline invoice queue.
// Each entry = { clientId, payload, createdAt }

const KEY = "GH_OFFLINE_INVOICES_V1";

function loadAll() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveAll(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // ignore quota errors etc.
  }
}

// Add a new pending invoice
export function queueInvoice(payload) {
  const clientId = `offline-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;

  const entry = {
    clientId,
    payload,
    createdAt: new Date().toISOString(),
  };

  const all = loadAll();
  all.push(entry);
  saveAll(all);
  return entry;
}

// Get all pending invoices
export function getPendingInvoices() {
  return loadAll();
}

// Remove one pending invoice after successful sync
export function removePendingInvoice(clientId) {
  const all = loadAll();
  const next = all.filter((x) => x.clientId !== clientId);
  saveAll(next);
}

// How many pending invoices?
export function countPendingInvoices() {
  return loadAll().length;
}