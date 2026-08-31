/** Small helpers shared across the app. */

let counter = 0;

/** Short, collision-free-enough id for elements and assets. */
export function uid(prefix = 'el'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** RFC 4122 v4 UUID; used for the watchapp's `uuid` field. */
export function uuidv4(): string {
  const rng = globalThis.crypto;
  if (typeof rng.randomUUID === 'function') return rng.randomUUID();
  const bytes = new Uint8Array(16);
  rng.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Turn any user string into a valid Pebble resource identifier. */
export function toIdentifier(input: string, fallback = 'RESOURCE'): string {
  const cleaned = input
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  if (!cleaned) return fallback;
  return /^[0-9]/.test(cleaned) ? `R_${cleaned}` : cleaned;
}

/** Escape a string for embedding in a C string literal. */
export function cString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, fileName: string): void {
  downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), fileName);
}

/** Filename stem for a project, used for the downloaded zip. */
export function projectSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'watchface'
  );
}

/**
 * The builder's own save file, inside the exported zip and on its own. The name
 * is fixed rather than derived from the project, so the README, the export
 * panel's file table and the download all name the same thing without having to
 * be kept in step.
 */
export const PROJECT_FILE_NAME = 'project.json';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
