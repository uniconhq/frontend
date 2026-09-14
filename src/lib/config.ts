/**
 * Build-time settings, in one place rather than read from `import.meta.env` at
 * half a dozen call sites.
 */

/**
 * Where the browser reaches Forgejo. Forgejo owns the account, so the account
 * page, the header menu and Create account all link into it. Set VITE_FORGE_URL
 * at build time; the default is the dev compose stack.
 */
export const FORGE_URL = (
  import.meta.env.VITE_FORGE_URL ?? 'http://localhost:3300'
).replace(/\/+$/, '');

/** The bare host, for the "You will sign in through …" line. */
export const FORGE_HOST = new URL(FORGE_URL).host;

/** A page inside Forgejo, e.g. forgeUrl('/user/settings'). */
export function forgeUrl(path: string): string {
  return `${FORGE_URL}${path}`;
}
