import { resolveApiUrl } from './config';

describe('resolveApiUrl', () => {
  it('prefers the runtime config injected by config.js', () => {
    expect(resolveApiUrl({ apiUrl: 'https://api.example.com' }, 'http://env')).toBe('https://api.example.com');
  });

  it('falls back to the build-time env, then to localhost', () => {
    expect(resolveApiUrl(undefined, 'http://env:3000')).toBe('http://env:3000');
    expect(resolveApiUrl({}, undefined)).toBe('http://localhost:3000');
  });

  it('strips a trailing slash', () => {
    expect(resolveApiUrl({ apiUrl: 'http://x/' }, undefined)).toBe('http://x');
  });
});
