import { flushPromises, mount } from '@vue/test-utils';
import { bookingsApi } from '@/api/bookings.api';
import MyBookingsView from './MyBookingsView.vue';

vi.mock('@/api/bookings.api', () => ({ bookingsApi: { myBookings: vi.fn() } }));

describe('MyBookingsView', () => {
  it('renders bookings newest first with seats and totals', async () => {
    vi.mocked(bookingsApi.myBookings).mockResolvedValue([
      {
        id: 'b1',
        eventName: 'Jazz Night',
        seats: [
          { rowLabel: 'A', seatNumber: 1 },
          { rowLabel: 'A', seatNumber: 2 },
        ],
        totalCents: 30000,
        createdAt: '2026-10-13T09:00:00.000Z',
      },
    ]);
    const w = mount(MyBookingsView);
    await flushPromises();
    expect(w.text()).toContain('Jazz Night');
    expect(w.text()).toContain('A1, A2');
    expect(w.text()).toContain('SAR 300.00');
  });

  it('shows an empty state', async () => {
    vi.mocked(bookingsApi.myBookings).mockResolvedValue([]);
    const w = mount(MyBookingsView);
    await flushPromises();
    expect(w.text()).toContain('No bookings yet');
  });
});
