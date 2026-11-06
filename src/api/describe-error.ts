import type { ApiError } from './problem';

/** A heading and a sentence for an error. */
export type ErrorDescription = { title: string; message: string };

/**
 * Words for the errors the browser makes itself, which no server wrote a
 * sentence for: a fetch that never reached Unicon, an answer that is not a
 * problem document, a fault in the page, and a file that did not upload.
 */
const BROWSER: Partial<Record<string, ErrorDescription>> = {
  network_error: {
    title: 'Cannot reach Unicon',
    message:
      'Your work is kept in this tab. This page will work again when it is back.',
  },
  unexpected_response: {
    title: 'Unicon did not answer as expected',
    message: 'Try again in a moment.',
  },
  unexpected_error: {
    title: 'Something went wrong in this page',
    message: 'Reload the page and try again.',
  },
  upload_failed: {
    title: 'The upload did not go through',
    message:
      'The file may have changed since it was chosen, or the connection dropped. Nothing was submitted.',
  },
  upload_rejected: {
    title: 'A file did not arrive as it was sent',
    message:
      'Unicon did not receive the file as it was sent. Send it again. Nothing was submitted.',
  },
};

/**
 * An error in words: the server's sentence under `heading`, the page's own
 * words for what it was doing, such as "Couldn't save".
 */
export function describeError(error: ApiError, heading: string): ErrorDescription {
  return (
    BROWSER[error.code] ?? { title: heading, message: error.detail ?? error.title }
  );
}
