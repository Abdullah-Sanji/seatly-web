import { EventDetail } from '@/api/types';
import {
  applyConfirm,
  applyHold,
  applyLost,
  applyRelease,
  applySalesOpened,
  applySeatUpdate,
  earliestExpiry,
  fromDetail,
  totalCents,
} from './seat-map.logic';

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
      { id: 's2', rowLabel: 'A', seatNumber: 2, priceCents: 200, state: 'held_by_me' },
      { id: 's3', rowLabel: 'A', seatNumber: 3, priceCents: 300, state: 'held' },
      { id: 's4', rowLabel: 'A', seatNumber: 4, priceCents: 400, state: 'sold' },
    ],
  };
}

const stateOf = (s: ReturnType<typeof fromDetail>, id: string) => s.event?.seats.find((x) => x.id === id)?.state;

describe('seat-map reducers', () => {
  it('fromDetail seeds mySeats from held_by_me with unknown expiry', () => {
    const s = fromDetail(detail());
    expect(s.mySeats).toEqual([{ seatId: 's2', expiresAt: null }]);
  });

  it('held marks other seats held but never downgrades held_by_me', () => {
    const s = applySeatUpdate(fromDetail(detail()), { type: 'held', seatIds: ['s1', 's2'], expiresAt: 'x' });
    expect(stateOf(s, 's1')).toBe('held');
    expect(stateOf(s, 's2')).toBe('held_by_me');
    expect(s.mySeats).toHaveLength(1);
  });

  it('released frees the seat and drops it from mySeats (own expiry)', () => {
    const s = applySeatUpdate(fromDetail(detail()), { type: 'released', seatIds: ['s2', 's3'] });
    expect(stateOf(s, 's2')).toBe('available');
    expect(stateOf(s, 's3')).toBe('available');
    expect(s.mySeats).toEqual([]);
  });

  it('sold marks seats sold and drops them from mySeats', () => {
    const s = applySeatUpdate(fromDetail(detail()), { type: 'sold', seatIds: ['s2'] });
    expect(stateOf(s, 's2')).toBe('sold');
    expect(s.mySeats).toEqual([]);
  });

  it('applyHold / applyRelease / applyConfirm keep seats and mySeats in step', () => {
    let s = applyHold(fromDetail(detail()), 's1', '2026-10-19T10:05:00.000Z');
    expect(stateOf(s, 's1')).toBe('held_by_me');
    expect(s.mySeats).toEqual([
      { seatId: 's2', expiresAt: null },
      { seatId: 's1', expiresAt: '2026-10-19T10:05:00.000Z' },
    ]);
    expect(totalCents(s)).toBe(300);
    expect(earliestExpiry(s)).toBe('2026-10-19T10:05:00.000Z');

    s = applyRelease(s, 's2');
    expect(stateOf(s, 's2')).toBe('available');
    expect(s.mySeats.map((m) => m.seatId)).toEqual(['s1']);

    s = applyConfirm(s, ['s1']);
    expect(stateOf(s, 's1')).toBe('sold');
    expect(s.mySeats).toEqual([]);
    expect(earliestExpiry(s)).toBeNull();
  });

  it('applyLost removes lost seats from mySeats and records them for highlighting', () => {
    const s = applyLost(fromDetail(detail()), ['s2']);
    expect(s.mySeats).toEqual([]);
    expect(s.lostSeatIds).toEqual(['s2']);
    expect(stateOf(s, 's2')).toBe('held');
  });

  it('applySalesOpened flips the status', () => {
    const d = detail();
    d.status = 'upcoming';
    expect(applySalesOpened(fromDetail(d)).event?.status).toBe('on_sale');
  });

  it('never mutates its input', () => {
    const before = fromDetail(detail());
    const snapshot = JSON.stringify(before);
    applySeatUpdate(before, { type: 'sold', seatIds: ['s1'] });
    applyHold(before, 's1', 'x');
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
