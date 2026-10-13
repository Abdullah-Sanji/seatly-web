import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { bookingsApi } from '@/api/bookings.api';
import { isApiError } from '@/api/errors';
import { eventsApi } from '@/api/events.api';
import { BookingResult, SalesOpenedMessage, SeatUpdateMessage } from '@/api/types';
import {
  applyConfirm,
  applyHold,
  applyLost,
  applyRelease,
  applySalesOpened,
  applySeatUpdate,
  earliestExpiry as earliestExpiryOf,
  emptyState,
  fromDetail,
  isMine,
  SeatMapState,
  totalCents,
} from './seat-map.logic';

const MESSAGES: Record<string, string> = {
  SEAT_HELD: 'Someone else just took that seat.',
  SEAT_SOLD: 'That seat has already been sold.',
  HOLD_LIMIT_REACHED: 'You can hold at most 6 seats per event.',
  SALES_NOT_OPEN: 'Sales are not open yet.',
  HOLD_EXPIRED: 'Some of your holds expired before you confirmed. They are highlighted.',
  NO_HELD_SEATS: 'Pick at least one seat first.',
  NETWORK: 'Cannot reach the server.',
};

export const useSeatMapStore = defineStore('seatMap', () => {
  const state = ref<SeatMapState>(emptyState());
  const loading = ref(false);
  const error = ref<string | null>(null);
  const lastBooking = ref<BookingResult | null>(null);

  const event = computed(() => state.value.event);
  const mySeats = computed(() => state.value.mySeats);
  const lostSeatIds = computed(() => state.value.lostSeatIds);
  const total = computed(() => totalCents(state.value));
  const earliestExpiry = computed(() => earliestExpiryOf(state.value));
  const canConfirm = computed(() => state.value.mySeats.length > 0 && !loading.value);

  function messageFor(e: unknown): string {
    if (isApiError(e)) return MESSAGES[e.code] ?? e.message;
    return 'Something went wrong.';
  }

  async function load(eventId: string): Promise<void> {
    loading.value = true;
    try {
      state.value = fromDetail(await eventsApi.get(eventId));
    } catch (e) {
      error.value = messageFor(e);
    } finally {
      loading.value = false;
    }
  }

  async function toggle(seatId: string): Promise<void> {
    const current = state.value.event;
    if (!current || loading.value) return;
    error.value = null;
    try {
      if (isMine(state.value, seatId)) {
        await bookingsApi.release(current.id, seatId);
        state.value = applyRelease(state.value, seatId);
      } else {
        const hold = await bookingsApi.hold(current.id, seatId);
        state.value = applyHold(state.value, seatId, hold.expiresAt);
      }
    } catch (e) {
      error.value = messageFor(e);
      await load(current.id);
    }
  }

  async function confirm(): Promise<void> {
    const current = state.value.event;
    if (!current || !canConfirm.value) return;
    error.value = null;
    try {
      const booking = await bookingsApi.confirm(current.id);
      state.value = applyConfirm(state.value, booking.seatIds);
      lastBooking.value = booking;
    } catch (e) {
      error.value = messageFor(e);
      if (isApiError(e) && e.code === 'HOLD_EXPIRED') {
        const lost = Array.isArray(e.details.lostSeatIds) ? (e.details.lostSeatIds as string[]) : [];
        state.value = applyLost(state.value, lost);
        const refreshed = await eventsApi.get(current.id).catch(() => null);
        if (refreshed) state.value = { ...fromDetail(refreshed), lostSeatIds: lost };
      }
    }
  }

  function onSocketMessage(msg: SeatUpdateMessage | SalesOpenedMessage): void {
    state.value = msg.type === 'sales_opened' ? applySalesOpened(state.value) : applySeatUpdate(state.value, msg);
  }

  function reset(): void {
    state.value = emptyState();
    error.value = null;
    lastBooking.value = null;
  }

  return {
    event,
    mySeats,
    lostSeatIds,
    loading,
    error,
    lastBooking,
    total,
    earliestExpiry,
    canConfirm,
    load,
    toggle,
    confirm,
    onSocketMessage,
    reset,
  };
});
