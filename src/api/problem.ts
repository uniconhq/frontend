/**
 * The backend answers failures with RFC 9457 problem documents. `code` is the
 * stable part, since messages get reworded and codes do not, so the UI branches
 * on it and never on `title`. Anything that is not a problem document becomes
 * an ApiError too, so callers have one shape to handle.
 */

export type ApiErrorCode =
  | 'unexpected_response'
  | 'network_error'
  | 'unexpected_error'
  | (string & {});

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly title: string;
  readonly detail: string | undefined;
  /**
   * Members beyond the four standard ones. Keeping them raw means a new code
   * needs no change here.
   */
  readonly extensions: Record<string, unknown>;

  constructor(init: {
    code: ApiErrorCode;
    status: number;
    title: string;
    detail?: string | undefined;
    extensions?: Record<string, unknown>;
  }) {
    super(init.detail ?? init.title);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.title = init.title;
    this.detail = init.detail;
    this.extensions = init.extensions ?? {};
  }
}

type ProblemDocument = {
  code?: unknown;
  title?: unknown;
  detail?: unknown;
  status?: unknown;
  type?: unknown;
  [member: string]: unknown;
};

function isProblemDocument(body: unknown): body is ProblemDocument {
  return typeof body === 'object' && body !== null;
}

/** Everything the standard members do not already carry. */
function extensionsOf(body: ProblemDocument): Record<string, unknown> {
  const standard = new Set(['type', 'title', 'status', 'detail', 'code']);
  return Object.fromEntries(
    Object.entries(body).filter(([member]) => !standard.has(member)),
  );
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Reads the body once; safe to call on any non-ok response. */
export async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('json')) {
    const body: unknown = await response.json().catch(() => null);
    if (isProblemDocument(body)) {
      const code = asString(body.code);
      if (code) {
        return new ApiError({
          code,
          status: response.status,
          title: asString(body.title) ?? response.statusText,
          detail: asString(body.detail),
          extensions: extensionsOf(body),
        });
      }
    }
  }

  return new ApiError({
    code: 'unexpected_response',
    status: response.status,
    title: `Unexpected response from the server (${response.status})`,
  });
}

/** fetch() rejects only on a transport failure, never on an HTTP status. */
export function apiErrorFromTransportFailure(cause: unknown): ApiError {
  return new ApiError({
    code: 'network_error',
    status: 0,
    title: 'Cannot reach Unicon',
    detail: cause instanceof Error ? cause.message : undefined,
  });
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Anything React Query hands back, as one type. */
export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) return error;
  return new ApiError({
    code: 'unexpected_error',
    status: 0,
    title: 'Something went wrong',
    detail: error instanceof Error ? error.message : undefined,
  });
}
