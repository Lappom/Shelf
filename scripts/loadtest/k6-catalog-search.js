/**
 * k6 load script for GET /api/catalog/search (authenticated).
 *
 * Usage:
 *   BASE_URL=https://your-shelf.example K6_SESSION_COOKIE="next-auth.session-token=..." k6 run scripts/loadtest/k6-catalog-search.js
 *
 * Thresholds align with SPECS §15 (catalog P95 cold <= 2200 ms — indicative under load).
 */

import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  thresholds: {
    http_req_duration: ["p(95)<2200"],
    http_req_failed: ["rate<0.05"],
  },
  stages: [
    { duration: "10s", target: 3 },
    { duration: "20s", target: 5 },
    { duration: "10s", target: 0 },
  ],
};

const base = __ENV.BASE_URL || "http://localhost:3000";
const cookie = __ENV.K6_SESSION_COOKIE || "";

export default function catalogSearchLoad() {
  if (!cookie) {
    throw new Error("K6_SESSION_COOKIE is required");
  }
  const url = `${base.replace(/\/$/, "")}/api/catalog/search?q=foundation&limit=5`;
  const res = http.get(url, {
    headers: {
      Cookie: cookie,
      Origin: base.replace(/\/$/, ""),
    },
  });
  check(res, {
    "2xx": (r) => r.status >= 200 && r.status < 300,
  });
  sleep(0.5);
}
