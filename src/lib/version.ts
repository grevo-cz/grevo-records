// Build-time metadata injected via Vite `define`. Useful for verifying the
// browser/CDN is serving the latest deploy.

declare const __BUILD_SHA__: string;
declare const __BUILD_DATE__: string;

export const BUILD_SHA: string =
  typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'dev';
export const BUILD_DATE: string =
  typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : new Date().toISOString();

export function formatBuildLabel(): string {
  const d = new Date(BUILD_DATE);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${BUILD_SHA} · ${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}
