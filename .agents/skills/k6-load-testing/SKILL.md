---
name: k6-load-testing
description: Write Grafana k6 JavaScript stress tests targeting the AST Invoice Formula Engine and Neon serverless connection-pool limits under Vercel serverless functions.
---

# k6 Load & Stress Testing (AST Formula Engine + Neon/Vercel)

You are stress-testing a system with two specific, known bottlenecks: an AST formula engine that performs heavy CPU work (topological sorting + BigNumber math), and a serverless deployment (Vercel functions → Neon serverless Postgres) susceptible to connection pool exhaustion.

## Guidelines

### 1. Target the Computational Hot Path specifically
Do not spread load evenly across `/health` routes. Target the AST Formula Engine endpoints (`/api/invoices/engine/evaluate`).
- Build request payloads with **realistically deep token graphs** (multiple levels of forward references). A shallow graph won't exercise the topological sort or precision math enough to reveal CPU regressions.

### 2. Simulate Vercel Spikes & Neon Exhaustion, deliberately
Serverless scaling behaves completely differently under a sudden spike than under a slow linear ramp.
- Configure the k6 `stages` array to simulate aggressive spikes up to 100,000 concurrent Virtual Users (VUs). Use a steep ramp-up, a sustained plateau at the peak, and a steep ramp-down.
- Pre-provision multiple distinct tenant/user auth tokens in `setup()` and distribute load across them. Single-user hammering hides per-tenant lock contention.

### 3. Enforce Strict Latency Thresholds
Define `options.thresholds` demanding 95th percentile response times below 500ms and error rates below 1%.
- `http_req_duration: ['p(95)<500']`
- `http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true }]`

### 4. Parse JSON Responses and Validate Results
Do not treat an HTTP 200 OK as success. Under heavy event-loop blocking, an engine might return a 200 with `NaN`, `null`, or a silently incorrect math total (a catastrophic race condition).
- Parse the returned JSON payload using `k6/check`.
- Assert that the strictly computed `BigNumber` string response matches exactly.
- Check that raw Postgres connection errors (e.g., `ECONNREFUSED`, `PgBouncer`) do not leak into the response body.

## Anti-Patterns
- **Linear Ramping:** A slow, purely linear ramp hides Vercel cold-start latency problems that real traffic spikes expose.
- **Trivial Payloads:** Sending `{ A: '1' }` as the payload. This bypasses the actual topological sort bottleneck.
- **Status-Code-Only Validation:** Failing to parse the JSON and verify the mathematical output under concurrency.
- **Assuming 100k VUs on Localhost:** Attempting 100,000 concurrent connections from a single local k6 process without distributed execution. Note limits explicitly in script comments.

## Example Test

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const engineErrors = new Rate('formula_engine_errors');
const engineLatency = new Trend('formula_engine_latency', true);

const BASE_URL = __ENV.BASE_URL;

export const options = {
  scenarios: {
    formula_engine_spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 500 },     // Warm-up
        { duration: '30s', target: 20000 },   // Sudden spike (Scale up via distributed k6 for 100k target)
        { duration: '1m', target: 20000 },    // Sustained plateau at peak to exhaust Neon pools
        { duration: '30s', target: 0 },       // Recovery ramp down
      ],
    },
  },
  thresholds: {
    'formula_engine_latency': ['p(95)<500'], // Strict sub-500ms contract
    'formula_engine_errors': ['rate<0.01'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  // WHY: Pre-provision distinct tenant auth tokens to prevent artificial single-tenant rate limits
  const tokens = [];
  for (let i = 0; i < 20; i++) {
    tokens.push(`synthetic-tenant-token-${i}`);
  }
  return { tokens };
}

export default function (data) {
  const token = data.tokens[Math.floor(Math.random() * data.tokens.length)];
  
  // WHY: Deep AST graph to intentionally block the event loop with Kahn's Algorithm
  const deepGraphPayload = JSON.stringify({
    nodes: [
      { id: 'subtotal', formula: '2500.10 + 1499.90' },
      { id: 'taxable', formula: 'subtotal * 1.025' },
      { id: 'grand_total', formula: 'taxable + (taxable * 0.15)' }
    ]
  });

  const res = http.post(
    `${BASE_URL}/api/invoices/engine/evaluate`,
    deepGraphPayload,
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } }
  );

  engineLatency.add(res.timings.duration);

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'no raw DB connection error leaked': (r) => !/ECONNREFUSED|connection pool|PgBouncer/i.test(r.body),
    'calculation is exactly correct': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.result.grand_total === '4715.00'; // Exact string match for BigNumber output
      } catch {
        return false;
      }
    },
  });

  engineErrors.add(!ok);
  sleep(0.1);
}
```
