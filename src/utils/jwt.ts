export interface JwtPayload {
  sub: string;
  email: string;
  exp: number;
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const parsed: unknown = JSON.parse(atob(padded));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as JwtPayload).sub === 'string' &&
      typeof (parsed as JwtPayload).email === 'string'
    ) {
      const { sub, email, exp } = parsed as JwtPayload;
      return { sub, email, exp };
    }
    return null;
  } catch {
    return null;
  }
}
