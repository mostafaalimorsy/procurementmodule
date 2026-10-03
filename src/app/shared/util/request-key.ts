/**
 * A random version-4 UUID for idempotent requests (a question, a deadline extension, a submission). Every supported
 * browser has `crypto.randomUUID` in secure contexts; the fallback builds the same format from `getRandomValues`, which
 * also exists on plain-HTTP hosts, so the server's GUID contract always holds.
 */
export function requestKey(): string {
  const source: Crypto = globalThis.crypto;
  if (typeof source.randomUUID === 'function') return source.randomUUID();
  const bytes = new Uint8Array(16);
  source.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
