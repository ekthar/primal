# India-Only Participation Localization Plan

Date: 2026-04-20
Owner: Product + Frontend + Backend
Status: P0 implemented (dataset-backed), follow-up hardening pending

## Implementation Snapshot (2026-04-20)
Completed:
- India-only registration UI and payload enforcement in frontend.
- Public India location APIs:
  - GET /api/public/india/states
  - GET /api/public/india/districts?state=...
  - GET /api/public/india/pincode/:pincode
- Backend India-only validation and normalization in profile + club services.
- Joi schema hardening for India nationality/country and PIN format.
- Added tests for India validators and location lookup behavior.

Data source in use:
- npm package `india-pincode-search` (db/pincode_db.json)
- Observed coverage snapshot at integration time: ~18,776 unique PINs, 36 states/UT.

Remaining:
- Verify dataset against authoritative India Post master source and set update cadence.
- Data migration/cleanup for existing non-India records.
- Export/dashboard copy cleanup to fully remove residual country semantics.

## Scope
Make participation India-only across registration, profile, club onboarding, validation, storage, export, and reporting.

## Current State Analysis (What Exists)
1. Multi-country options still exist in frontend location helper.
- File: frontend/src/lib/locations.js
- Current: India + Nepal + Bangladesh + Sri Lanka + Bhutan.
- India coverage is partial sample only (few states, few districts), not complete India map.

2. Registration currently allows selecting nationality/country and does not auto-resolve PIN.
- File: frontend/src/pages/Register.jsx
- Current: Country selector + state selector + district selector + free postal code input.
- No pincode-based autolocation call or lookup.

3. Club onboarding still accepts free-text country.
- File: frontend/src/pages/Register.jsx
- Current: clubCountry is open text input.

4. Backend validation is permissive for nationality/country.
- File: backend-node/src/validators.js
- Current: nationality/country are generic strings; not restricted to India.
- No strict address schema for state/district/pincode format in metadata.

5. Backend has no pincode lookup endpoint/service.
- Files scanned: backend-node/src/routes, backend-node/src/services, frontend/src/lib/api.js
- Current: no API route exists for PIN -> state/district auto-resolution.

6. Seed/demo data is not India-only.
- File: backend-node/src/db/seed.js
- Current: club countries JP, CA, BR.

7. Exports still include country as free value from metadata.
- File: backend-node/src/services/export.service.js
- Current: address rendering prints state, district, country, postal code from metadata.

8. Tests do not cover India-only constraints.
- File: backend-node/tests/validators.test.js
- Current: no tests for nationality/country/pincode constraints.

## Pending Work (Implementation Backlog)

## P0 (Must Have)
1. Enforce India-only in registration and profile payload.
- Update frontend form to remove country choices and set nationality fixed to "India".
- Disable or remove any non-India option from applicant flow.
- For club flow, remove country input and hard-set country to "India".
- Target files:
  - frontend/src/lib/locations.js
  - frontend/src/pages/Register.jsx

2. Add complete India states + UT + districts dataset.
- Replace sample list with full India admin coverage.
- Include all states and union territories, with all districts.
- Target file:
  - frontend/src/lib/locations.js (or split to dedicated dataset file)

3. Add PIN code autolocation (mandatory).
- Build data source mapping: pincode -> state, district, and optional post office.
- Add backend lookup endpoint for consistency and single source of truth.
- Add frontend autolookup on PIN input (debounced), auto-fill state and district.
- If PIN not found, block submit and show explicit validation message.
- Target files (new + existing):
  - backend-node/src/routes/public.routes.js (or new locations route)
  - backend-node/src/services/* (new location lookup service)
  - backend-node/src/validators.js
  - frontend/src/lib/api.js
  - frontend/src/pages/Register.jsx

4. Enforce backend validation for India-only regardless of frontend.
- Restrict nationality to "India".
- Restrict club country to "India".
- Validate metadata.address object shape including:
  - state: required from approved India list
  - district: required from approved district list for selected state
  - postalCode: required and 6-digit India PIN regex ^[1-9][0-9]{5}$
- Reject invalid combinations even if payload bypasses UI.
- Target files:
  - backend-node/src/validators.js
  - backend-node/src/services/profile.service.js
  - backend-node/src/services/club.service.js

## P1 (Should Have)
1. Normalize existing data to India-only policy.
- Prepare one-time migration/cleanup script for non-India rows.
- Decide strategy: transform, nullify, or quarantine invalid rows.
- Target files:
  - backend-node/src/db/migrate.js or new migration under backend-node/src/migrations
  - backend-node/src/db/seed.js

2. Align export and dashboard labels/content to India-only model.
- Replace "Nationality / Country" with India-specific wording where applicable.
- In PDF, avoid printing free country text; use fixed India or omit country line.
- Target files:
  - backend-node/src/services/export.service.js
  - frontend/src/pages/ApplicantDashboard.jsx
  - frontend/src/pages/Register.jsx

3. Add observability for lookup failures.
- Log unresolved PIN lookups and validation rejects for support/debugging.
- Target files:
  - backend-node/src/logger.js integration points
  - location lookup service

## P2 (Quality and Safety)
1. Add backend tests for India-only validation and PIN lookup.
- Positive and negative cases for nationality/country/pincode/state/district combination.
- Target files:
  - backend-node/tests/validators.test.js
  - new tests for lookup route/service

2. Add frontend regression checks (manual checklist if no test setup).
- Verify autofill behavior, read-only India fields, and submit blocking.

## Decisions Required Before Implementation
1. Canonical data source for India districts and PINs.
- Recommended: authoritative India Post PIN dataset (license/refresh policy confirmed).

2. UX behavior for unresolved PIN.
- Recommended: block submit and require valid PIN lookup success.

3. Legacy data policy.
- Choose between hard migration, soft-warning, or grandfathered records.

## Execution Order
1. Finalize data source and generate canonical location artifacts.
2. Implement backend lookup + strict validation.
3. Implement frontend India-only UI + PIN autolocation wiring.
4. Update seed/export/labels.
5. Add tests and run full validation.

## Acceptance Criteria
1. User cannot select or submit any country other than India.
2. All India states/UT and districts are available and correct.
3. PIN code auto-fills state/district for valid PIN and rejects invalid PIN.
4. Backend rejects non-India or invalid address combos even with direct API calls.
5. PDFs and dashboards no longer expose non-India country semantics.
6. Tests cover constraints and pass.

## Evidence Pointers (Files Reviewed)
- frontend/src/lib/locations.js
- frontend/src/pages/Register.jsx
- frontend/pages/register.js
- frontend/src/lib/api.js
- backend-node/src/validators.js
- backend-node/src/routes/profile.routes.js
- backend-node/src/routes/club.routes.js
- backend-node/src/services/profile.service.js
- backend-node/src/services/club.service.js
- backend-node/src/services/export.service.js
- backend-node/src/db/seed.js
- backend-node/tests/validators.test.js
