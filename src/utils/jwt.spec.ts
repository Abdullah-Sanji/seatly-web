import { decodeJwtPayload } from './jwt';

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
