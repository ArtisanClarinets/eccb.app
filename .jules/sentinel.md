## 2024-03-06 - [CRITICAL] Fix unauthenticated setup API endpoints
**Vulnerability:** Setup API endpoints (`/api/setup` and `/api/setup/status`) were exposed without authentication, allowing any unauthenticated user to trigger database migrations, seed data, or view setup status.
**Learning:** The setup endpoints were created to simplify initial installation, but lacked the `validateSetupRequest` guard check that ensures `SETUP_MODE` is true and a valid `SETUP_TOKEN` is provided. The `setup-guard.ts` utility existed but was not applied to the actual route handlers.
**Prevention:** Ensure that all new API routes, especially administrative or setup-related ones, include appropriate authorization checks. A shared guard like `validateSetupRequest` should be implemented consistently across all related endpoints.

## 2024-03-08 - [HIGH] Fix Open Redirect vulnerability in login flow
**Vulnerability:** The `callbackUrl` parameter from `useSearchParams` was used directly in `router.push()` and `authClient.signIn` inside `src/components/auth/login-form.tsx` without validation.
**Learning:** This is an open redirect vulnerability because an attacker could send a user a link like `https://example.com/login?callbackUrl=https://malicious.com` and the user would be redirected to the malicious site after logging in. The system implicitly trusted the `callbackUrl` query string param.
**Prevention:** Validate user-provided redirect paths by ensuring they start with a single `/` and not `//`, forcing them to be relative paths on the same origin.

## 2024-03-17 - [CRITICAL] Prevent Path Traversal in all storage drivers
**Vulnerability:** Path traversal and invalid characters (like null bytes) were only being validated for the `LOCAL` storage driver in `src/lib/services/storage.ts`. `S3` storage driver was not validating `key` against `..` or `\0`.
**Learning:** While S3 buckets do not have a real filesystem, allowing `..` in object keys can lead to path traversal vulnerabilities down the line if those files are later downloaded or synced to a local disk. It also bypasses the intended directory structure. We must validate storage keys for all drivers consistently.
**Prevention:** Extract the basic path validation logic (checking for `\0`, absolute paths, and `..` traversal) into a reusable `validateStorageKey` function and call it at the beginning of all public exported storage functions (`uploadFile`, `downloadFile`, `deleteFile`, etc.) regardless of the underlying storage driver.
