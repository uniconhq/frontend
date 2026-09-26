/**
 * The codes the callback is allowed to put in `?error=`. The string came from
 * the URL bar rather than the backend, so an unknown code must not reach
 * describeError, which would fall back to a server title and detail that do not
 * exist here.
 */
const KNOWN = [
  'sign_in_denied',
  'sign_in_invalid',
  'forge_unavailable',
  'forge_misconfigured',
] as const;

export type LoginErrorCode = (typeof KNOWN)[number] | 'sign_in_failed';

export function loginErrorCode(fromUrl: string | null): LoginErrorCode | null {
  if (fromUrl === null) return null;
  return KNOWN.find((code) => code === fromUrl) ?? 'sign_in_failed';
}
