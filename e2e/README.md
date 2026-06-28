# Calltime E2E (Playwright)

End-to-end smoke tests that log in as real seeded accounts and assert role-based
visibility on the **live** app. This is the check that catches UI-layer breakage
the TypeScript build and DB tests can't see.

## Run locally
```bash
cd e2e
npm install
npx playwright install chromium        # one-time browser download
E2E_PASSWORD='<seeded test-org password>' npx playwright test
```
`E2E_BASE_URL` defaults to https://checkcalltime.art; override for previews.

## Seeded accounts (isolated "E2E Test Co" org, cross-org walled from BTE)
- `e2e-owner@calltime.test`  — org owner (sees Rolodex)
- `e2e-member@calltime.test` — plain member, cast on "E2E Show" (no Rolodex, can't add Press)
- `e2e-lead@calltime.test`   — org member but SHOW LEAD (admin tier) on "E2E Show" (can add Press, still no Rolodex)

## What v1 covers
owner sees Rolodex; member doesn't; a show lead doesn't either (proves leadership is
per-show, not org standing); a lead can add Press in Marquee but a cast member can't;
the availability page renders. Expand in `tests/`.

Password is **not** in the repo (public). It's the value seeded into Supabase
auth; store it as the `E2E_PASSWORD` GitHub secret and locally as an env var.

## CI
`.github/workflows/e2e.yml` runs the suite on every push to `main` (after deploy)
and nightly. A red run means a behavior regressed.
