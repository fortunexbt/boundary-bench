export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function verdictIcon(passed: boolean): string {
  return passed
    ? '<svg class="icon icon--pass" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg>'
    : '<svg class="icon icon--fail" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
}

export const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
);
