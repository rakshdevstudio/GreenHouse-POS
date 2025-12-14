document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("weight");
  if (!el) return;

  window.scale.onData((raw) => {
    el.innerText = raw.trim();
  });
});