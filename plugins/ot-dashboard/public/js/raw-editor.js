document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("rawEditorForm");
  const textarea = document.getElementById("jsonEditor");
  if (!form) return;

  if (window.DashboardJsonEditor && textarea) {
    window.DashboardJsonEditor.mount(textarea);
  }

  if (window.DashboardUI) {
    window.DashboardUI.trackDirty(form);
  }
});
