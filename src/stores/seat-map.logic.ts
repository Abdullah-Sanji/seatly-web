import { EventDetail, SeatState, SeatUpdateMessage } from '@/api/types';

export interface MySeat {
  seatId: string;
  expiresAt: string | null;
}

export interface SeatMapState {
  event: EventDetail | null;
  mySeats: MySeat[];
  lostSeatIds: string[];
}

export function emptyState(): SeatMapState {
  return { event: null, mySeats: [], lostSeatIds: [] };
}

export function fromDetail(detail: EventDetail): SeatMapState {
  return {
    event: detail,
    mySeats: detail.seats.filter((s) => s.state === 'held_by_me').map((s) => ({ seatId: s.id, expiresAt: null })),
    lostSeatIds: [],
  };
}

/** Rebuild from a fresh detail but keep the expiry times we already know for seats still held by us. */
export function mergeDetail(prev: SeatMapState, detail: EventDetail): SeatMapState {
  const next = fromDetail(detail);
  if (prev.event?.id !== detail.id) return next;
  const known = new Map(prev.mySeats.map((m) => [m.seatId, m.expiresAt]));
  return { ...next, mySeats: next.mySeats.map((m) => ({ ...m, expiresAt: known.get(m.seatId) ?? null })) };
}

function setStates(
  state: SeatMapState,
  seatIds: string[],
  next: (current: SeatState) => SeatState,
): SeatMapState {
  if (!state.event) return state;
  const ids = new Set(seatIds);
  return {
    ...state,
    event: {
      ...state.event,
      seats: state.event.seats.map((seat) => (ids.has(seat.id) ? { ...seat, state: next(seat.state) } : seat)),
    },
  };
}

function withoutMine(state: SeatMapState, seatIds: string[]): SeatMapState {
  const ids = new Set(seatIds);
  return { ...state, mySeats: state.mySeats.filter((m) => !ids.has(m.seatId)) };
}

export function applySeatUpdate(state: SeatMapState, msg: SeatUpdateMessage): SeatMapState {
  switch (msg.type) {
    case 'held':
      // The server echoes our own hold back to us; held_by_me must win.
      return setStates(state, msg.seatIds, (current) => (current === 'held_by_me' ? 'held_by_me' : 'held'));
    case 'released':
      return withoutMine(setStates(state, msg.seatIds, () => 'available'), msg.seatIds);
    case 'sold':
      return withoutMine(setStates(state, msg.seatIds, () => 'sold'), msg.seatIds);
  }
}

export function applySalesOpened(state: SeatMapState): SeatMapState {
  return state.event ? { ...state, event: { ...state.event, status: 'on_sale' } } : state;
}

export function applyHold(state: SeatMapState, seatId: string, expiresAt: string): SeatMapState {
  const next = setStates(state, [seatId], () => 'held_by_me');
  return { ...next, mySeats: [...next.mySeats.filter((m) => m.seatId !== seatId), { seatId, expiresAt }] };
}

export function applyRelease(state: SeatMapState, seatId: string): SeatMapState {
  return withoutMine(setStates(state, [seatId], () => 'available'), [seatId]);
}

export function applyConfirm(state: SeatMapState, seatIds: string[]): SeatMapState {
  return withoutMine(setStates(state, seatIds, () => 'sold'), seatIds);
}

/** Confirm reported HOLD_EXPIRED: those seats are no longer ours. The caller refetches for the truth. */
export function applyLost(state: SeatMapState, lostSeatIds: string[]): SeatMapState {
  const next = withoutMine(setStates(state, lostSeatIds, () => 'held'), lostSeatIds);
  return { ...next, lostSeatIds };
}

export function clearLost(state: SeatMapState): SeatMapState {
  return { ...state, lostSeatIds: [] };
}

export function isMine(state: SeatMapState, seatId: string): boolean {
  return state.mySeats.some((m) => m.seatId === seatId);
}

export function totalCents(state: SeatMapState): number {
  if (!state.event) return 0;
  const prices = new Map(state.event.seats.map((s) => [s.id, s.priceCents]));
  return state.mySeats.reduce((sum, m) => sum + (prices.get(m.seatId) ?? 0), 0);
}

export function earliestExpiry(state: SeatMapState): string | null {
  const known = state.mySeats.map((m) => m.expiresAt).filter((x): x is string => x !== null);
  if (known.length === 0) return null;
  return known.reduce((min, x) => (x < min ? x : min));
}
