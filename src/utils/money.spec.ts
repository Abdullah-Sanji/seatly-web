import { formatCents } from './money';

describe('formatCents', () => {
  it('formats whole and fractional amounts', () => {
    expect(formatCents(15000)).toBe('SAR 150.00');
    expect(formatCents(1)).toBe('SAR 0.01');
    expect(formatCents(0)).toBe('SAR 0.00');
  });
});
