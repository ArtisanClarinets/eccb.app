type EndpointPolicy = 'strict-public' | 'allow-local';

const PRIVATE_IPV4_PATTERNS = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
 /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
];

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;

  if (normalized === 'localhost' || normalized === '::1') {
    return true;
  }

  if (PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')) {
    return true;
  }

  return false;
}

export function validateOutboundEndpoint(
  rawEndpoint: string,
  policy: EndpointPolicy = 'strict-public'
): { valid: true; url: URL } | { valid: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawEndpoint);
  } catch {
    return { valid: false, error: 'Endpoint must be a valid URL.' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valid: false, error: 'Only HTTP(S) endpoints are allowed.' };
  }

  const isLocal = isPrivateOrLoopbackHost(parsed.hostname);

  if (policy === 'strict-public') {
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'Endpoint must use HTTPS.' };
    }
    if (isLocal) {
      return { valid: false, error: 'Private, loopback, and localhost endpoints are not allowed.' };
    }
  } else if (policy === 'allow-local') {
    if (parsed.protocol === 'http:' && !isLocal) {
      return { valid: false, error: 'HTTP endpoints are only allowed for localhost or private network hosts.' };
    }
  }

  return { valid: true, url: parsed };
}
