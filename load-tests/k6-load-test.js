/**
 * k6 Load Test Script — AI Cephalometric Analysis API
 * 
 * Usage:
 *   k6 run load-tests/k6-load-test.js
 *   k6 run --vus 50 --duration 2m load-tests/k6-load-test.js
 * 
 * Install k6: https://k6.io/docs/get-started/installation/
 */

import http from 'k6/http';
import { sleep, check, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// ── Config ─────────────────────────────────────────────────────────────────
const BASE_URL = __ENV.API_URL || 'http://localhost:5000';

// ── Custom Metrics ─────────────────────────────────────────────────────────
const authDuration  = new Trend('auth_duration_ms');
const patientsDuration = new Trend('patients_list_duration_ms');
const analysisFailRate = new Rate('analysis_fail_rate');
const totalRequests = new Counter('total_requests');

// ── Thresholds ──────────────────────────────────────────────────────────────
export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 users
    { duration: '1m',  target: 30 },   // Hold at 30 users
    { duration: '30s', target: 50 },   // Spike to 50 users
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    'http_req_duration':         ['p(95)<2000'],  // 95% of requests < 2s
    'http_req_failed':           ['rate<0.05'],   // Error rate < 5%
    'auth_duration_ms':          ['p(95)<1000'],  // Auth < 1s p95
    'patients_list_duration_ms': ['p(95)<800'],   // List < 800ms p95
  },
};

// ── Shared token store ──────────────────────────────────────────────────────
let authToken = null;

export function setup() {
  // Login once; share token across all VUs via scenario data
  const res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    email: 'doctor@ceph.test',
    password: 'Doctor@1234',
  }), { headers: { 'Content-Type': 'application/json' } });

  check(res, { 'login success': r => r.status === 200 });
  const body = JSON.parse(res.body);
  return { token: body.accessToken };
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.token}`,
  };
  totalRequests.add(1);

  group('Auth', () => {
    const start = Date.now();
    const res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
      email: 'doctor@ceph.test',
      password: 'Doctor@1234',
    }), { headers: { 'Content-Type': 'application/json' } });
    authDuration.add(Date.now() - start);
    check(res, { 'auth 200': r => r.status === 200 });
    sleep(0.5);
  });

  group('Patients', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/patients`, { headers });
    patientsDuration.add(Date.now() - start);
    check(res, {
      'patients 200': r => r.status === 200,
      'response has data': r => {
        try { return Array.isArray(JSON.parse(r.body)); } catch { return false; }
      },
    });
    sleep(0.3);
  });

  group('Dashboard Aggregates', () => {
    const responses = http.batch([
      ['GET', `${BASE_URL}/api/patients?pageSize=5`, null, { headers }],
      ['GET', `${BASE_URL}/api/reports/sessions/00000000-0000-0000-0000-000000000000`, null, { headers }],
    ]);
    // 200 or 404 are both acceptable (data may not exist in load test env)
    responses.forEach(r => {
      analysisFailRate.add(r.status >= 500 ? 1 : 0);
    });
    sleep(1);
  });
}

export function teardown(data) {
  console.log('Load test complete. Token used:', data.token ? 'YES' : 'NO');
}
