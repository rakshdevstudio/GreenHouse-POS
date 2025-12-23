document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("weight");
  if (!el) {
    console.warn("⚠️ Weight input not found");
    return;
  }

  console.log("✅ Scale renderer connected");

  if (!window.scale || !window.scale.onData) {
    console.warn("❌ Electron scale bridge not available");
    return;
  }

  window.scale.onData((raw) => {
    console.log("📟 RAW SCALE DATA:", raw);
    if (!raw) return;

    // Extract last valid number from scale output
    const cleaned = raw
      .replace(/[^\d.]/g, " ")
      .split(" ")
      .filter(Boolean)
      .pop();

    const w = Number(cleaned);
    if (!Number.isFinite(w) || w <= 0) return;

    const formatted = w
      .toFixed(3)
      .replace(/0+$/, "")
      .replace(/\.$/, "");

    // ✅ THIS IS CRITICAL
    el.value = formatted;

    // 🔔 Notify React / POS listeners
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));

    console.log("⚖️ Weight set:", formatted);
  });
});