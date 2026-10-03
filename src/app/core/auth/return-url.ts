/**
 * CF-011: where to go after signing in — only a path inside this workspace. Absolute, protocol-relative (`//host`), scheme (`javascript:`),
 * backslash and control-character values are refused (an open redirect would otherwise send a signed-in person anywhere), as are the sign-in
 * pages themselves.
 */
export function safeReturnUrl(value: string | null | undefined): string | null {
  if (!value || value.length > 2000) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) return null;
  // A scheme can hide only before the first slash; with a leading single slash there is none, but refuse an encoded one too.
  if (/^\/[^/?#]*:/.test(decodeURIComponentSafe(value))) return null;
  if (/^\/(login|forgot-password|reset-password|accept-invitation)(\/|\?|#|$)/.test(value))
    return null;
  return value;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
