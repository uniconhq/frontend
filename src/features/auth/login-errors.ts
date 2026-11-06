/**
 * Why a sign-in came back refused, in words. The callback puts only a code
 * in `?error=`, with no sentence, so the page keeps its own words for the
 * codes it may put there; any other code, typed into the address bar, is
 * `sign_in_failed`.
 */
const WORDS = {
  sign_in_denied: {
    title: 'Sign in was not approved',
    message: 'You did not approve the sign in.',
  },
  sign_in_invalid: {
    title: 'That sign in expired',
    message: 'The sign in took too long or was started in another tab.',
  },
  forge_unavailable: {
    title: 'Forgejo did not answer',
    message:
      'Reading works; signing in, submitting and posting will resume when it is back.',
  },
  forge_misconfigured: {
    title: 'Forgejo is not set up for Unicon',
    message: 'A platform admin has to fix the connection before anyone can sign in.',
  },
  sign_in_failed: {
    title: 'Sign in failed',
    message: 'Something went wrong on the way back from Forgejo. Try again.',
  },
};

type LoginErrorCode = keyof typeof WORDS;

export type LoginError = { code: LoginErrorCode; title: string; message: string };

export function loginError(fromUrl: string | null): LoginError | null {
  if (fromUrl === null) return null;
  const code = Object.hasOwn(WORDS, fromUrl)
    ? (fromUrl as LoginErrorCode)
    : 'sign_in_failed';
  return { code, ...WORDS[code] };
}
