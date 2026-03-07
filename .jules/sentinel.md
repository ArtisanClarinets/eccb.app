## 2024-03-06 - [CRITICAL] Fix unauthenticated setup API endpoints
**Vulnerability:** Setup API endpoints (`/api/setup` and `/api/setup/status`) were exposed without authentication, allowing any unauthenticated user to trigger database migrations, seed data, or view setup status.
**Learning:** The setup endpoints were created to simplify initial installation, but lacked the `validateSetupRequest` guard check that ensures `SETUP_MODE` is true and a valid `SETUP_TOKEN` is provided. The `setup-guard.ts` utility existed but was not applied to the actual route handlers.
**Prevention:** Ensure that all new API routes, especially administrative or setup-related ones, include appropriate authorization checks. A shared guard like `validateSetupRequest` should be implemented consistently across all related endpoints.

## 2024-03-07 - [HIGH] Prevent Open Redirect in Login Callback
**Vulnerability:** The `callbackUrl` parameter in the login form was directly read from `searchParams` and used in `router.push()` without any validation. An attacker could craft a malicious URL like `https://app.com/login?callbackUrl=https://evil.com` and when a user logs in, they would be redirected to the attacker's site, potentially leading to phishing or token theft.
**Learning:** Even internal redirects using framework routers (like Next.js `useRouter`) are susceptible to open redirect vulnerabilities if the input path is entirely user-controlled and can contain absolute URLs with different origins.
**Prevention:** Always validate and sanitize user-provided redirect URLs. For relative paths on the same origin, ensure the URL starts with a single `/` and not `//` (which can be interpreted as protocol-relative absolute URLs).
