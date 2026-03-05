/**
 * Backend JSON-RPC client.
 * All outcome decisions go through this; the frontend never computes them locally.
 */

const BACKEND_URL = 'http://localhost:4051/api';

// ── Response types ────────────────────────────────────────────────────────────

export interface BackendResp {
  action:       string;
  step:         number;
  outcome:      'safe' | 'viral_boost' | 'bomb' | null;
  applied_mult: number;
  acc:          number;
  content_id:   string;
  ended_by:     string | null;
  max_reached:  boolean;
}

export interface BackendPlayResult {
  final:   boolean;
  finance: unknown;
  game:    unknown;
  round:   unknown;
  resp:    BackendResp;
}

export interface BackendPlayParams {
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
