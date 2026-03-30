import fs from 'fs';
import path from 'path';

let cachedDevBackendPort;

function readDevBackendPort() {
  if (cachedDevBackendPort != null) return cachedDevBackendPort;
  const candidates = [
    path.join(process.cwd(), '..', 'config', 'dev-ports.json'),
    path.join(process.cwd(), 'config', 'dev-ports.json'),
  ];
  for (const devPortsPath of candidates) {
    try {
      const raw = fs.readFileSync(devPortsPath, 'utf8');
      cachedDevBackendPort = Number(JSON.parse(raw).backend) || 5005;
      return cachedDevBackendPort;
    } catch {
      /* try next */
    }
  }
  cachedDevBackendPort = 5005;
  return cachedDevBackendPort;
}

/**
 * Base URL for server-side fetch to the Express API (RSC, route handlers).
 * Uses 127.0.0.1 in dev so Windows does not prefer IPv6 ::1 when the API listens on IPv4-only.
 */
function devPreferIpv4Loopback(base) {
  if (process.env.NODE_ENV === 'production') return base.replace(/\/$/, '');
  try {
    const u = new URL(base);
    if (u.hostname !== 'localhost') return base.replace(/\/$/, '');
    u.hostname = '127.0.0.1';
    return `${u.origin}${u.pathname}`.replace(/\/$/, '') || u.origin;
  } catch {
    return base.replace(/\/$/, '');
  }
}

export function getServerBackendBaseUrl() {
  const fromEnv = String(
    process.env.BACKEND_URL || process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || '',
  ).trim();
  if (fromEnv) return devPreferIpv4Loopback(fromEnv);
  if (process.env.NODE_ENV === 'production') {
    return 'https://api.tavarios.com';
  }
  return `http://127.0.0.1:${readDevBackendPort()}`;
}
