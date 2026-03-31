document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("generalForm");
  if (!form || !window.DashboardUI) return;

  window.DashboardUI.trackDirty(form);
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      form.requestSubmit();
    }
  });
});
