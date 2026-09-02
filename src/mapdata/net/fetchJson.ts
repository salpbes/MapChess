// WHAT: The one way MapChess fetches JSON from the network.
// HOW:  `fetch` with an AbortController timeout, a bounded number of retries
//       with linear back-off, and a typed `NetworkError` that says which of
//       timeout / http / network / parse went wrong. Callers pass a validator
//       so the result is typed without trusting the server.
// WHY:  BUILD_PLAN §5 — every network call gets a timeout, a retry limit and
//       a user-visible failure state. Centralising it means no call can forget.

export type NetworkErrorReason = 'timeout' | 'http' | 'network' | 'parse' | 'aborted';

export class NetworkError extends Error {
  public constructor(
    public readonly reason: NetworkErrorReason,
    public readonly url: string,
    detail?: string,
    public readonly status?: number,
  ) {
    super(`${reason} fetching ${url}${detail === undefined ? '' : `: ${detail}`}`);
    this.name = 'NetworkError';
  }
}

export interface FetchJsonOptions<T> {
  readonly timeoutMs?: number;
  /** Additional attempts after the first. */
  readonly retries?: number;
  readonly headers?: Record<string, string>;
  /** Turns unknown JSON into T or throws; the throw becomes a 'parse' NetworkError. */
  readonly validate: (data: unknown) => T;
  readonly signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRIES = 1;
const RETRY_DELAY_MS = 600;

export async function fetchJson<T>(url: string, options: FetchJsonOptions<T>): Promise<T> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  let lastError: NetworkError | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await attemptOnce(url, options);
    } catch (error: unknown) {
      if (!(error instanceof NetworkError)) throw error;
      lastError = error;
      // Client errors and explicit aborts will not improve by retrying.
      if (error.reason === 'aborted' || error.reason === 'parse') throw error;
      if (
        error.reason === 'http' &&
        error.status !== undefined &&
        error.status < 500 &&
        error.status !== 429
      ) {
        throw error;
      }
      if (attempt < retries) await delay(RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw lastError ?? new NetworkError('network', url, 'no attempts made');
}

async function attemptOnce<T>(url: string, options: FetchJsonOptions<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onOuterAbort = (): void => {
    controller.abort();
  };
  options.signal?.addEventListener('abort', onOuterAbort);

  try {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', ...options.headers },
        signal: controller.signal,
      });
    } catch (error: unknown) {
      if (options.signal?.aborted === true) throw new NetworkError('aborted', url);
      if (controller.signal.aborted) throw new NetworkError('timeout', url);
      throw new NetworkError(
        'network',
        url,
        error instanceof Error ? error.message : String(error),
      );
    }

    if (!response.ok) {
      throw new NetworkError('http', url, response.statusText, response.status);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (error: unknown) {
      throw new NetworkError('parse', url, error instanceof Error ? error.message : 'invalid JSON');
    }

    try {
      return options.validate(data);
    } catch (error: unknown) {
      throw new NetworkError(
        'parse',
        url,
        error instanceof Error ? error.message : 'unexpected shape',
      );
    }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onOuterAbort);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
