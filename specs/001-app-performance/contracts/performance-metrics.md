# Contract: Performance Metrics & Acceptance

**Version**: 1.0 | **Feature**: 001-app-performance

Maps spec success criteria to measurable checks.

## Definitions

- **Interactive**: main CTA/inputs respond to click within 100 ms after paint; no `pointer-events: none` on primary content.
- **P95 / P90**: on sample of N runs, 95% / 90% of runs meet threshold.

## Acceptance table

| ID | Metric | Method | Pass |
|----|--------|--------|------|
| SC-001 | Module transition time | 20 manual runs, broadband | P95 ≤ 2000 ms |
| SC-002 | Login → home interactive | 10 runs, broadband | P90 ≤ 4000 ms |
| SC-003 | Patient search | 500 patient dataset, debounced | ≤ 1000 ms after debounce |
| SC-004 | User satisfaction | 5+ user survey | ≥ 80% score ≥ 4/5 |
| SC-005 | Composite flow | vs `perf-baseline` in sessionStorage | ≥ 40% reduction |
| SC-006 | Slow network UX | Fast 3G, 4 flows | Indicator ≤ 500 ms; no blank > 3 s |
| SC-007 | Regression | Smoke checklist quickstart §7 | 100% pass |

## Instrumentation (minimum)

Before merge of performance PR:

1. Document baseline numbers in PR description.
2. Document post-change numbers on same machine/network profile.
3. Network: count `GET .../patients` on cold login ≤ 2 (after dedupe).

## Automated (future)

```ts
// vitest — example contract test
expect(debounceMs).toBe(300)
expect(getQueryKey('patients', clinicId)).toEqual(['patients', clinicId, expect.any(Object)])
```

## Out of scope

- Server-side APM / Datadog
- Lighthouse CI gate (recommended follow-up)
