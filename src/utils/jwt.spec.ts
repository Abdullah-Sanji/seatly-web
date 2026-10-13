import { decodeJwtPayload, tokenExpiresWithin } from './jwt';

function fakeJwt(payload: object): string {
  const b64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `eyJhbGciOiJIUzI1NiJ9.${b64}.sig`;
}

describe('decodeJwtPayload', () => {
  it('decodes sub, email and exp', () => {
    const token = fakeJwt({ sub: 'u1', email: 'a@b.c', exp: 123 });
    expect(decodeJwtPayload(token)).toEqual({ sub: 'u1', email: 'a@b.c', exp: 123 });
  });

  it('returns null for garbage', () => {
    expect(decodeJwtPayload('nope')).toBeNull();
    expect(decodeJwtPayload('a.b.c')).toBeNull();
  });
});

describe('tokenExpiresWithin', () => {
  const now = 1_700_000_000_000;
  const expiringIn = (seconds: number) => fakeJwt({ sub: 'u1', email: 'a@b.c', exp: now / 1000 + seconds });

  it('is true when the token expires inside the window', () => {
    expect(tokenExpiresWithin(expiringIn(10), 30, now)).toBe(true);
  });

  it('is false when the token is good for longer than the window', () => {
    expect(tokenExpiresWithin(expiringIn(600), 30, now)).toBe(false);
  });

  it('treats an undecodable token as expiring', () => {
    expect(tokenExpiresWithin('garbage', 30, now)).toBe(true);
  });
});
