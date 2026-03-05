/**
 * Backend API client.
 *
 * backendPlay()   — JSON-RPC play method (game outcomes).
 * fetchOptions()  — GET /options (currency, bet list, balance init).
 *
 * Both talk to the same Go backend, defaulting to localhost:4051.
 * Override via VITE_BACKEND_URL in .env.development.
 */

/// <reference types="vite/client" />

const BACKEND_BASE: string =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? 'http://localhost:4051';

const BACKEND_URL = `${BACKEND_BASE}/api`;

// ── Response types ────────────────────────────────────────────────────────────

export interface BackendResp {
  action:               string;
  step:                 number;
  outcome:              'safe' | 'viral_boost' | 'bomb' | null;
  /** Multiplier in basis points (10000 = 1.0000×). Null for bomb / cashout. */
  applied_mult_bp:      number | null;
  /** Human-friendly multiplier string with 2 decimals, e.g. "1.15" or "10.00". Null for bomb / cashout. */
  applied_mult_display: string | null;
  /** Round value in integer subunits (cents). Divide by 100 for display. */
  acc_cents:            number;
  content_id:           string;
  ended_by:             string | null;
  max_reached:          boolean;
}

export interface BackendPlayResult {
  final:   boolean;
  finance: unknown;
  game:    unknown;
  round:   unknown;
  resp:    BackendResp;
}

export interface BackendPlayParams {
  token?:   string;
  game:     unknown;
  round:    unknown;
  req:      { action: string; bet?: number; bet_type?: string };
  config:   unknown;
  god_data: unknown;
}

// ── RPC call ──────────────────────────────────────────────────────────────────

export async function backendPlay(params: BackendPlayParams): Promise<BackendPlayResult> {
  const body = {
    jsonrpc: '2.0',
    id:      String(Date.now()),
    method:  'play',
    params,
  };

  if (import.meta.env.DEV) {
    console.log('[backend] →', params.req.action, body);
  }

  let res: Response;
  try {
    res = await fetch(BACKEND_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
  } catch (networkErr) {
    throw new Error(`Backend unreachable: ${String(networkErr)}`);
  }

  if (!res.ok) {
    throw new Error(`Backend HTTP ${res.status} ${res.statusText}`);
  }

  const json = await res.json() as { result?: BackendPlayResult; error?: unknown };

  if (json.error) {
    throw new Error(`Backend RPC error: ${JSON.stringify(json.error)}`);
  }

  if (!json.result) {
    throw new Error('Backend returned no result');
  }

  if (import.meta.env.DEV) {
    console.log('[backend] ←', json.result.resp);
  }

  return json.result;
}

// ── GET /options ──────────────────────────────────────────────────────────────

/**
 * Fetches server-driven options: currency, bet limits, starting balance.
 * Returns a RunnerInitResult-shaped object so gameOptions.populateFromInit()
 * works without any adaptation layer.
 */
export async function fetchOptions(token: string): Promise<BackendOptionsResult> {
  const url = `${BACKEND_BASE}/options?token=${encodeURIComponent(token)}`;

  if (import.meta.env.DEV) {
    console.log('[backend] fetchOptions', url);
  }

  let res: Response;
  try {
    res = await fetch(url, { method: 'GET' });
  } catch (networkErr) {
    throw new Error(`Backend unreachable (GET /options): ${String(networkErr)}`);
  }

  if (!res.ok) {
    throw new Error(`Backend /options HTTP ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as BackendOptionsResult;

  if (import.meta.env.DEV) {
    const ca = data.currency_attributes;
    console.group('[backend] /options');
    console.log('currency  :', ca?.code, `(sub=${ca?.subunits}, exp=${ca?.exponent})`);
    console.log('bets      :', data.config?.bet_limits);
    console.log('balance   :', data.balance);
    console.groupEnd();
  }

  return data;
}

/** Shape returned by GET /options — matches RunnerInitResult for drop-in use. */
export interface BackendOptionsResult {
  state_lock: string;
  balance: number | string;
  currency_attributes: {
    code: string;
    symbol?: string;
    subunits: number;
    exponent: number;
  };
  config: {
    bet_limits: number[];
    freebets_limits?: number[];
    default_bet?: number;
  };
  locale?: string;
  urls?: {
    return_url?: string;
    deposit_url?: string;
    history_url?: string;
  };
  freebets?: null;
}
