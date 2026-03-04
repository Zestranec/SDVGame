# ADHDoom Go Backend

HyperHive runner-compatible JSON-RPC 2.0 backend for ADHDoom.

## Environment variables

| Variable          | Default                      | Description                            |
|-------------------|------------------------------|----------------------------------------|
| `PORT`            | `80`                         | HTTP listen port                       |
| `RNG_URL`         | `http://localhost:4002/api`  | HyperHive RNG service endpoint         |
| `ENABLE_GOD_MODE` | `0`                          | Set to `1` to enable god-mode overrides|

## Running locally

```bash
cd backend
RNG_URL=http://localhost:4002/api PORT=4051 go run ./cmd/server
```

### With the HyperHive runner

1. Start the RNG service (port 4002) and runner_cli.
2. Start this backend:
   ```bash
   PORT=4051 RNG_URL=http://localhost:4002/api go run ./cmd/server
   ```
3. Point runner_cli at `config.yml`:
   ```bash
   runner_cli --config config.yml
   ```

### Docker

```bash
docker build -t adhd-backend .
docker run -p 4051:80 \
  -e RNG_URL=http://host.docker.internal:4002/api \
  adhd-backend
```

## API

**Endpoint**: `POST /api`
**Format**: JSON-RPC 2.0
**Method**: `play`

### Actions

#### start — begin a new round and draw the first card

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "play",
  "params": {
    "game": {},
    "round": null,
    "req": { "action": "start", "bet": 10, "bet_type": "bet" },
    "config": {},
    "god_data": null
  }
}
```

Response (safe draw example):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "final": false,
    "finance": [{ "type": "betting", "bet": -10, "base": 10, "bet_type": "bet" }],
    "game": {},
    "round": { "base_bet": 10, "acc": 10.9231, "step": 0, "alive": true, "max_reached": false, "ended_by": null },
    "resp": {
      "action": "start", "step": 0, "outcome": "safe",
      "applied_mult": 1.1499, "acc": 10.9231,
      "content_id": "safe_12", "ended_by": null, "max_reached": false
    }
  }
}
```

#### swipe — draw the next card

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "play",
  "params": {
    "game": {},
    "round": { "base_bet": 10, "acc": 10.9231, "step": 0, "alive": true, "max_reached": false, "ended_by": null },
    "req": { "action": "swipe" },
    "config": {},
    "god_data": null
  }
}
```

#### cashout — end the round and collect winnings

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "play",
  "params": {
    "game": {},
    "round": { "base_bet": 10, "acc": 10.9231, "step": 0, "alive": true, "max_reached": false, "ended_by": null },
    "req": { "action": "cashout" },
    "config": {},
    "god_data": null
  }
}
```

### God mode

Set `ENABLE_GOD_MODE=1` and include `god_data.random` in params to override RNG values per draw step:

```json
"god_data": {
  "random": [
    { "u1": 0, "u2": 0 },
    { "u1": 4294967295, "u2": 0 }
  ]
}
```

- `u1 = 0` → `f1 = 0.0 < 0.15` → **bomb**
- `u1 = 4294967295` → `f1 ≈ 1.0 ≥ 0.15` → safe/boost
- Omit either field to fetch it from the live RNG service.

## Math

| Constant              | Value    |
|-----------------------|----------|
| HOUSE_EDGE            | 0.95     |
| MAX_MULT              | 500      |
| BOMB_PROB             | 0.15     |
| BOOST_PROB_GIVEN_SAFE | 0.003    |
| BOOST_MULT            | 10.0     |
| NORMAL_SAFE_MULT      | 1.1499   |

`acc` starts at `bet × 0.95` and is multiplied each safe draw.
Round ends when: bomb hit, cashout, or `acc ≥ bet × 500`.

## Tests

```bash
cd backend
go test ./...
```
