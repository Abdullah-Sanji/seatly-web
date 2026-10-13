import { formatDateTime, statusLabel } from './time';

describe('time utils', () => {
  it('formats an ISO timestamp for humans', () => {
    expect(formatDateTime('2026-10-19T19:00:00.000Z')).toMatch(/19 Oct 2026/);
  });

  it('labels event statuses', () => {
    expect(statusLabel('upcoming')).toBe('Upcoming');
    expect(statusLabel('on_sale')).toBe('On sale');
    expect(statusLabel('closed')).toBe('Closed');
  });
});
