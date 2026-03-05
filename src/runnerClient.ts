/**
 * RunnerRpcClient — JSON-RPC 2.0 client for the Runner API.
 *
 * Methods: init · info · play
 * Token is extracted from the URL query string: ?token=<value>
 *
 * State-lock contract (optimistic locking):
 *   - init returns a state_lock.
 *   - Every play() MUST send the last known state_lock.
 *   - A successful play response returns a new state_lock.
 *   - If the runner rejects with a state_lock mismatch, we show an error
 *     overlay and reload the page.
 */

/// <reference types="vite/client" />

const RUNNER_URL: string =
  (import.meta.env.VITE_RUNNER_URL as string | undefined) ?? 'http://localhost:4000/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a server balance value (number or numeric string) to bigint safely. */
export function toBigInt(raw: number | string): bigint {
  if (typeof raw === 'number') {
    // Guard against non-integer floats (server should always send integers)
    if (!Number.isInteger(raw)) {
      console.warn('[Runner] non-integer balance value received:', raw);
      return BigInt(Math.round(raw));
    }
    return BigInt(raw);
  }
  return BigInt(raw);
}

/** Parse the ?token= query parameter from the current URL. */
export function parseTokenFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
  } catch {
    return null;
  }
}

/**
 * Show a full-screen fatal error that blocks the game.
 * Used for unrecoverable situations: missing token, state_lock mismatch.
 */
export function showFatalError(message: string, canDismiss = false): void {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position:     'fixed',
    inset:        '0',
    display:      'flex',
    alignItems:   'center',
    justifyContent: 'center',
    background:   'rgba(0,0,0,0.92)',
    zIndex:       '999999',
  });
  const box = document.createElement('div');
  Object.assign(box.style, {
    background:   '#0d0005',
    border:       '2px solid rgba(255,60,60,0.5)',
    borderRadius: '14px',
    padding:      '28px 36px',
    maxWidth:     '80vw',
    textAlign:    'center',
    color:        '#ff6666',
    fontSize:     '15px',
    fontFamily:   '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    fontWeight:   '700',
    lineHeight:   '1.5',
    boxShadow:    '0 8px 32px rgba(0,0,0,0.8)',
  });
  box.textContent = message;
  if (canDismiss) {
    const btn = document.createElement('button');
    btn.textContent = 'OK';
    Object.assign(btn.style, {
      marginTop:    '16px',
      display:      'block',
      width:        '100%',
      padding:      '8px',
      borderRadius: '8px',
      border:       'none',
      background:   '#ff4444',
      color:        '#fff',
      cursor:       'pointer',
      fontSize:     '14px',
    });
    btn.addEventListener('click', () => el.remove());
    box.appendChild(btn);
  }
  el.appendChild(box);
  document.body.appendChild(el);
}

// ── Data contracts ────────────────────────────────────────────────────────────

export interface RunnerCurrencyAttributes {
  code: string;
  symbol?: string;
  subunits: number;
  exponent: number;
}

export interface RunnerFreebets {
  bet_level: number;
  issued: number;
  done: number;
  total_win: number;
}

export interface RunnerConfig {
  bet_limits: number[];
  freebets_limits?: unknown;  // array or map indexed by bet_level
  default_bet?: number;
  purchased_features?: string[];
}

export interface RunnerUrls {
  return_url?: string;
  deposit_url?: string;
  history_url?: string;
}

export interface RunnerInitResult {
  state_lock: string;
  balance: number | string;
  currency_attributes: RunnerCurrencyAttributes;
  config: RunnerConfig;
  locale?: string;
  urls?: RunnerUrls;
  freebets?: RunnerFreebets | null;
  state?: unknown;
}

export interface RunnerInfoResult {
  state_lock?: string;
  balance: number | string;
  freebets?: RunnerFreebets | null;
  config?: Partial<RunnerConfig>;
  currency_attributes?: RunnerCurrencyAttributes;
  locale?: string;
  urls?: RunnerUrls;
  state?: unknown;
}

/**
 * Game-specific response embedded in the runner play result.
 * Mirrors the shape returned by the Go game engine.
 */
export interface GameResp {
  action:               string;
  step:                 number;
  outcome:              'safe' | 'viral_boost' | 'bomb' | null;
  applied_mult_bp:      number | null;
  applied_mult_display: string | null;
  /** Round value in integer subunits (cents). */
  acc_cents:            number;
  content_id:           string;
  ended_by:             string | null;
  max_reached:          boolean;
}

export interface RunnerPlayResult {
  state_lock:  string;
  balance:     number | string;
  round?:      unknown;
  game?:       unknown;
  resp?:       GameResp;
  final?:      boolean;
  outcome?:    { win?: number };
  finance?:    unknown[];
  freebets?:   RunnerFreebets | null;
  state?:      unknown;
}

export interface RunnerPlayReq {
  action:             'start' | 'swipe' | 'cashout';
  /** Bet amount in currency subunits (integer). Required for action="start". */
  bet?:               number;
  bet_type?:          'bet' | 'freebet';
  purchased_feature?: string;
}

// ── RPC infrastructure ────────────────────────────────────────────────────────

interface RpcPayload<T> {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: T;
}

interface RpcResponse<T> {
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

export class RunnerRpcError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'RunnerRpcError';
  }
}

async function rpcCall<T>(
  method: 'init' | 'info' | 'play',
  params: unknown,
): Promise<T> {
  const body: RpcPayload<unknown> = {
    jsonrpc: '2.0',
    id:      String(Date.now()),
    method,
    params,
  };

  let httpRes: Response;
  try {
    httpRes = await fetch(RUNNER_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
  } catch (networkErr) {
    throw new Error(`Runner unreachable (${method}): ${String(networkErr)}`);
  }

  if (!httpRes.ok) {
    throw new Error(`Runner HTTP ${httpRes.status} ${httpRes.statusText} (${method})`);
  }

  const json = await httpRes.json() as RpcResponse<T>;

  if (json.error) {
    throw new RunnerRpcError(json.error.code, json.error.message, json.error.data);
  }

  if (json.result === undefined) {
    throw new Error(`Runner returned no result for method "${method}"`);
  }

  return json.result;
}

function isStateLockError(err: unknown): boolean {
  if (!(err instanceof RunnerRpcError)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('state_lock') || msg.includes('state lock') || err.code === -32099;
}

// ── RunnerClient ──────────────────────────────────────────────────────────────

export class RunnerClient {
  readonly token: string;
  private _stateLock: string | null = null;

  constructor(token: string) {
    this.token = token;
  }

  get stateLock(): string | null { return this._stateLock; }

  // ── init ──────────────────────────────────────────────────────────────────

  async init(): Promise<RunnerInitResult> {
    const result = await rpcCall<RunnerInitResult>('init', { token: this.token });
    this._stateLock = result.state_lock;

    if (import.meta.env.DEV) {
      const ca = result.currency_attributes;
      const bl = result.config.bet_limits ?? [];
      console.group('[Runner] init');
      console.log('currency   :', ca.code, `(subunits=${ca.subunits}, exponent=${ca.exponent})`);
      console.log('bet_limits :', `${bl.length} options`, bl[0], '…', bl[bl.length - 1]);
      console.log('default_bet:', result.config.default_bet);
      console.log('balance    :', result.balance);
      console.log('state_lock :', result.state_lock ? '✓ present' : '✗ MISSING');
      console.groupEnd();
    }

    return result;
  }

  // ── info ──────────────────────────────────────────────────────────────────

  async info(): Promise<RunnerInfoResult> {
    const result = await rpcCall<RunnerInfoResult>('info', { token: this.token });
    if (result.state_lock) {
      this._stateLock = result.state_lock;
    }
    return result;
  }

  // ── play ──────────────────────────────────────────────────────────────────

  async play(req: RunnerPlayReq): Promise<RunnerPlayResult> {
    if (this._stateLock === null) {
      throw new Error('RunnerClient: init() must be called before play()');
    }

    let result: RunnerPlayResult;
    try {
      result = await rpcCall<RunnerPlayResult>('play', {
        token:      this.token,
        state_lock: this._stateLock,
        req,
      });
    } catch (err) {
      if (isStateLockError(err)) {
        showFatalError('Session out of sync.\nReloading…');
        setTimeout(() => location.reload(), 1800);
      }
      throw err;
    }

    this._stateLock = result.state_lock;

    if (import.meta.env.DEV) {
      const lock = result.state_lock;
      console.debug('[Runner] play', req.action,
        '| lock:', lock ? `${lock.slice(0, 8)}…` : 'MISSING',
        '| balance:', result.balance,
        '| final:', result.final ?? false,
      );
    }

    return result;
  }
}
