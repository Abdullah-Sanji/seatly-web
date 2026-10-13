import { mount } from '@vue/test-utils';
import Countdown from './Countdown.vue';

describe('Countdown', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('counts down to zero and emits expired once', async () => {
    vi.setSystemTime(new Date('2026-10-19T10:00:00.000Z'));
    const w = mount(Countdown, { props: { expiresAt: '2026-10-19T10:00:02.000Z' } });
    expect(w.text()).toBe('00:02');
    await vi.advanceTimersByTimeAsync(1000);
    expect(w.text()).toBe('00:01');
    await vi.advanceTimersByTimeAsync(2500);
    expect(w.text()).toBe('00:00');
    expect(w.emitted('expired')).toHaveLength(1);
  });

  it('shows a dash when the expiry is unknown', () => {
    const w = mount(Countdown, { props: { expiresAt: null } });
    expect(w.text()).toBe('--:--');
  });
});
