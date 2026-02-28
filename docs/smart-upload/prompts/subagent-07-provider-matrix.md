## Prompt Title

Phase 7 – Provider Matrix and LLM Runtime Alignment

## Role

You are an architect familiar with multi‑provider AI integrations and dynamic configuration bootstrapping.

## Objective

Ensure that Smart Upload’s LLM provider support is consistent across schema, bootstrap, config loaders, adapters, admin UI, test routes, and runtime. Add provider discovery and capability checks so the system can gracefully degrade or switch providers without code changes.

## Context

Existing code has a `schema.ts` that defines providers and validation, a `bootstrap.ts` that sets defaults, `config-loader.ts` that loads runtime config, and provider adapters in `src/lib/llm/providers.ts`. However, there are known drift issues: admin routes returning mismatched model lists, runtime expecting `llm_vision_model` when UI displays different keys, and missing test endpoints for some providers. Additionally, providers like Gemini require discovery of model IDs. The user has flagged provider support drift across layers as a common bug class.

## Verified Files to Review

- `src/lib/smart-upload/schema.ts`
- `src/lib/smart-upload/bootstrap.ts`
- `src/lib/llm/providers.ts`
- `src/lib/llm/config-loader.ts`
- Admin routes under `src/app/api/admin/uploads/models/route.ts`, `providers/discover/route.ts`, `settings/route.ts`, `settings/test/route.ts`
- Admin UI components: `src/components/admin/music/smart-upload-settings-form.tsx` and related settings pages.
- Any tests related to provider endpoints (`__tests__` in admin dirs).

## Files to Modify

- Align `ProviderValue` enum in `schema.ts` with `LLM_PROVIDERS` values and ensure both share a single source of truth (export from one file).
- In `bootstrap.ts`, add logic to migrate existing legacy provider keys and to verify that provider-specific settings are correctly validated (e.g. endpoint required for custom).
- Update `config-loader.ts` to include runtime values for all provider-specific fields and to route calls to correct adapter; expand `runtimeToAdapterConfig` if additional fields exist.
- Add new adapters or extend existing ones to support model discovery and capability detection (vision vs text vs verification vs header label) for each provider. At minimum, implement placeholder functions for Gemini to fetch model list.
- Admin route `models/route.ts` must return model IDs given current provider. Verify each provider’s adapter has a `listModels()` function or similar. Add caching.
- Admin route `providers/discover/route.ts` should trigger discovery of available providers (read LLM_PROVIDERS) and return them.
- Settings test route (`settings/test/route.ts`) must actually call the adapter with a simple prompt to verify connectivity; update to handle all providers and return descriptive errors.
- Update `smart-upload-settings-form.tsx` to display provider-specific fields dynamically and show capability support (vision/verification/adjudicator). Add UI tests if not present.

## Files to Create

- Possibly new interface file for provider adapter shape (e.g. `src/lib/llm/adapter.ts`).
- Add tests for `config-loader` and provider routes.

## Technical Requirements

1. **Provider Registry:** Convert `LLM_PROVIDERS` to a typed array used by schema and UI. Provide a function `getProviderMeta(provider: ProviderValue)` returning defaults.
2. **Adapter Routing:** `callVisionModel` and other central functions must inspect runtime config and dispatch to the correct provider adapter; each adapter must declare capabilities (`hasVision`, `hasStructuredOutput`, etc.). Use a TypeScript discriminated union.
3. **Admin Model Discovery:** For each provider, implement or stub a `fetchAvailableModels(config)` method returning names of models appropriate for vision/verification/adjudicator. Integrate with `/api/admin/uploads/models` and update tests to simulate responses for at least OpenAI and Gemini.
4. **Runtime Alignment:** `loadSmartUploadRuntimeConfig` should validate provider keys, convert strings to enums, and ensure `providerRequiresApiKey`/`Endpoint` validations. Add runtime warnings if configuration is invalid.
5. **Tests:** Add unit tests for schema validation across different providers with valid/invalid settings. Add integration tests for admin model route mocking remote API responses.
6. **UI:** Settings form must conditionally show API key fields, endpoint field (for custom), and model selectors that call `/api/admin/uploads/models`. It must show a warning if provider lacks a required capability when user selects it.

## Required Constraints

- Do not embed provider API keys in repo or logs; use environment variables or settings.
- Keep provider adapters loosely coupled; new providers should be added by registering meta and implementing the adapter interface.
- All provider-specific logic should be behind configuration flags; default provider remains 'ollama'.

## Edge Cases to Handle

- Provider returns empty model list: UI should display "no models available" and disable the save button.
- Invalid endpoint URL or unreachable provider: settings test route must return detailed error messages for each field.
- A provider not supporting vision or verification models; the system must fall back to OCR or mark two-pass disabled.
- Runtime config loaded while DB is temporarily unreachable: bootstrap should log a warning and proceed with defaults.

## Required Verification

- **DoD Compliance:** Verify that your changes align with the overarching goals of a complete, enterprise-level autonomous system defined in `docs/smart-upload/smart-upload.DoD.md` and `smart-upload.DoD.acceptance-criteria.md`.
- **Zero Warnings/Errors:** You must run all tests, linting (`npm run lint`), typechecking (`npx tsc --noEmit` or `npm run build`), and Next.js build. Do not complete this phase until **ALL** warnings and errors generated by any of these tools have been completely resolved.

- Run schema validation tests for all providers with a variety of settings.
- Simulate provider discovery and model listing for at least OpenAI and an unknown provider; verify admin routes work and UI shows results in storybook or tests.
- Use Cypress or Vitest to render `smart-upload-settings-form.tsx` and assert conditional fields appear correctly.
- Run `npm run lint` and type-check to ensure adapters conform to interface.

## Expected Deliverables

- Unified provider registry used across schema, bootstrap, config loader, and UI.
- Adapter interface and implementations with capability metadata.
- Admin routes corrected and tested.
- Updated settings form with dynamic fields and tests.

## Stop Conditions

Stop if network dependency is required for model discovery and cannot be mocked; escalate to orchestrator to create offline fallback.
