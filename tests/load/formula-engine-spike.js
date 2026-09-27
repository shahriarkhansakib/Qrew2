import { check, sleep } from "k6";
import http from "k6/http";
import { Rate, Trend } from "k6/metrics";

/**
 * k6 Load & Stress Test — AST Invoice Formula Engine & Neon Pool Resilience
 *
 * Targets the computational hot path:
 * - 4-level deep token dependency graph exercising Kahn's Algorithm topological sort.
 * - Exact BigNumber fixed(6) math verification under extreme concurrency.
 * - Simulates sudden Vercel serverless traffic spikes and tests Neon connection pool limits.
 *
 * NOTE: For distributed 100k VU runs across multiple load generators, execute via
 * `k6 cloud` or distributed k6 runner. Local runs should adjust max VUs based on system limits.
 */

const engineErrors = new Rate("formula_engine_errors");
const engineLatency = new Trend("formula_engine_latency", true);

const BASE_URL = __ENV.BASE_URL || "http://localhost:5002";

export const options = {
  scenarios: {
    formula_engine_spike: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "15s", target: 50 }, // Warm-up phase
        { duration: "30s", target: 1000 }, // Sudden spike: aggressive serverless spin-up
        { duration: "45s", target: 1000 }, // Sustained plateau: tests Neon connection-pool saturation
        { duration: "15s", target: 0 }, // Recovery ramp-down
      ],
    },
  },
  thresholds: {
    formula_engine_latency: ["p(95)<500"], // Strict sub-500ms contract under load
    formula_engine_errors: ["rate<0.01"], // Error rate must remain under 1%
    http_req_failed: ["rate<0.01"],
  },
};

export function setup() {
  // Pre-provision distinct synthetic tenant auth tokens to prevent artificial single-tenant rate limits
  const tokens = [];
  for (let i = 0; i < 20; i++) {
    tokens.push(`synthetic-tenant-token-${i}`);
  }
  return { tokens };
}

export default function (data) {
  const token = data.tokens[Math.floor(Math.random() * data.tokens.length)];

  /**
   * 4-Level Deep AST Dependency Graph:
   * Level 1: BASE_FEE = 2500.100000 + 1499.900000 = 4000.000000
   * Level 2: PILOTAGE = BASE_FEE * 1.025 = 4100.000000
   * Level 3: TOWAGE = PILOTAGE + 900.000000 = 5000.000000
   * Level 4: SURCHARGE (charge on TOWAGE) = TOWAGE * 0.15 = 750.000000
   *
   * Total section value = 4000.000000 + 4100.000000 + (5000.000000 + 750.000000) = 13850.000000
   */
  const deepGraphPayload = JSON.stringify({
    draftConstants: {
      FUEL_INDEX: { value: "1.025" },
      SURCHARGE_RATE: { value: "0.15" },
    },
    draftSections: [
      {
        id: "sec-001",
        sectionToken: "PORT_OPERATIONS",
        label: "Port Operations",
        sortOrder: 0,
        rows: [
          {
            id: "row-001",
            rowToken: "BASE_FEE",
            label: "Base Fee",
            valueType: "formula",
            formula: "2500.100000 + 1499.900000",
            charges: [],
            sortOrder: 0,
          },
          {
            id: "row-002",
            rowToken: "PILOTAGE",
            label: "Pilotage Service",
            valueType: "formula",
            formula: "BASE_FEE * FUEL_INDEX",
            charges: [],
            sortOrder: 1,
          },
          {
            id: "row-003",
            rowToken: "TOWAGE",
            label: "Towage Assistance",
            valueType: "formula",
            formula: "PILOTAGE + 900.000000",
            charges: [
              {
                id: "chg-001",
                chargeToken: "TOWAGE_SURCHARGE",
                label: "Peak Hour Surcharge",
                formula: "TOWAGE * SURCHARGE_RATE",
                sortOrder: 0,
              },
            ],
            sortOrder: 2,
          },
        ],
        sectionCharges: [],
      },
    ],
  });

  const res = http.post(`${BASE_URL}/api/invoices/preview`, deepGraphPayload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  engineLatency.add(res.timings.duration);

  const ok = check(res, {
    "status is 200": (r) => r.status === 200,
    "no raw DB connection error leaked": (r) =>
      !/ECONNREFUSED|connection pool|PgBouncer|NeonDbError/i.test(r.body),
    "calculation is exactly correct": (r) => {
      try {
        const body = JSON.parse(r.body);
        // grandTotal must strictly match BigNumber evaluation to 6 decimal places
        return body.success === true && body.data?.grandTotal === "13850.000000";
      } catch {
        return false;
      }
    },
    "no DAG cyclic dependency errors": (r) => {
      try {
        const body = JSON.parse(r.body);
        return (
          !body.data?.validationErrors ||
          !body.data.validationErrors.some((e) => e.code === "CYCLIC_DEPENDENCY")
        );
      } catch {
        return false;
      }
    },
  });

  engineErrors.add(!ok);
  sleep(0.05);
}
