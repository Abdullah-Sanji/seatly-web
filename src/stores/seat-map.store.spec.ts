import { createPinia, setActivePinia } from 'pinia';
import { bookingsApi } from '@/api/bookings.api';
import { ApiError } from '@/api/errors';
import { eventsApi } from '@/api/events.api';
import { EventDetail } from '@/api/types';
import { useSeatMapStore } from './seat-map.store';

vi.mock('@/api/events.api', () => ({ eventsApi: { get: vi.fn() } }));
vi.mock('@/api/bookings.api', () => ({
  bookingsApi: { hold: vi.fn(), release: vi.fn(), confirm: vi.fn(), myBookings: vi.fn() },
}));

function detail(): EventDetail {
  return {
    id: 'e1',
    name: 'Show',
    venueName: 'Hall',
    startsAt: '2026-10-19T19:00:00.000Z',
    salesOpenAt: '2026-10-01T00:00:00.000Z',
    status: 'on_sale',
    availableCount: 2,
    seats: [
      { id: 's1', rowLabel: 'A', seatNumber: 1, priceCents: 100, state: 'available' },
      { id: 's2', rowLabel: 'A', seatNumber: 2, priceCents: 200, state: 'available' },
    ],
  };
}

describe('seat map store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(eventsApi.get).mockReset().mockResolvedValue(detail());
    vi.mocked(bookingsApi.hold).mockReset();
    vi.mocked(bookingsApi.release).mockReset();
    vi.mocked(bookingsApi.confirm).mockReset();
  });

  it('toggle holds an available seat and releases a held-by-me seat', async () => {
    const store = useSeatMapStore();
    await store.load('e1');
    vi.mocked(bookingsApi.hold).mockResolvedValue({ seatId: 's1', expiresAt: '2026-10-19T10:05:00.000Z' });

    await store.toggle('s1');
    expect(store.event?.seats[0].state).toBe('held_by_me');
    expect(store.total).toBe(100);
    expect(store.earliestExpiry).toBe('2026-10-19T10:05:00.000Z');

    vi.mocked(bookingsApi.release).mockResolvedValue();
    await store.toggle('s1');
    expect(bookingsApi.release).toHaveBeenCalledWith('e1', 's1');
    expect(store.event?.seats[0].state).toBe('available');
    expect(store.mySeats).toEqual([]);
  });

  it('a lost hold race (SEAT_HELD) refetches the map and sets a message', async () => {
    const store = useSeatMapStore();
    await store.load('e1');
    vi.mocked(bookingsApi.hold).mockRejectedValue(new ApiError(409, 'SEAT_HELD', 'Seat is held', {}));
    await store.toggle('s1');
    expect(store.error).toMatch(/someone else/i);
    expect(eventsApi.get).toHaveBeenCalledTimes(2);
  });

  it('confirm marks seats sold and records the booking', async () => {
    const store = useSeatMapStore();
    await store.load('e1');
    vi.mocked(bookingsApi.hold).mockResolvedValue({ seatId: 's1', expiresAt: 'x' });
    await store.toggle('s1');
    vi.mocked(bookingsApi.confirm).mockResolvedValue({ bookingId: 'b1', seatIds: ['s1'], totalCents: 100 });

    await store.confirm();
    expect(store.lastBooking?.bookingId).toBe('b1');
    expect(store.event?.seats[0].state).toBe('sold');
    expect(store.canConfirm).toBe(false);
  });

  it('confirm with HOLD_EXPIRED drops the lost seats, highlights them and refetches', async () => {
    const store = useSeatMapStore();
    await store.load('e1');
    vi.mocked(bookingsApi.hold).mockResolvedValue({ seatId: 's1', expiresAt: 'x' });
    await store.toggle('s1');
    vi.mocked(bookingsApi.confirm).mockRejectedValue(
      new ApiError(409, 'HOLD_EXPIRED', 'x', { lostSeatIds: ['s1'] }),
    );

    await store.confirm();
    expect(store.lostSeatIds).toEqual(['s1']);
    expect(store.mySeats).toEqual([]);
    expect(store.error).toMatch(/expired/i);
    expect(eventsApi.get).toHaveBeenCalledTimes(2);
  });

  it('socket messages flow through the reducers', async () => {
    const store = useSeatMapStore();
    await store.load('e1');
    store.onSocketMessage({ type: 'sold', seatIds: ['s2'] });
    expect(store.event?.seats[1].state).toBe('sold');
    store.onSocketMessage({ type: 'sales_opened' });
    expect(store.event?.status).toBe('on_sale');
  });
});
