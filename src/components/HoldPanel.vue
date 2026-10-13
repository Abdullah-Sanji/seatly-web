<script setup lang="ts">
import { computed } from 'vue';
import { BookingResult, SeatView } from '@/api/types';
import { MySeat } from '@/stores/seat-map.logic';
import { formatCents } from '@/utils/money';
import Countdown from './Countdown.vue';

const props = defineProps<{
  seats: SeatView[];
  mySeats: MySeat[];
  total: number;
  earliestExpiry: string | null;
  canConfirm: boolean;
  error: string | null;
  lastBooking: BookingResult | null;
}>();
const emit = defineEmits<{ confirm: []; release: [seatId: string]; expired: [] }>();

const mine = computed(() =>
  props.mySeats
    .map((m) => props.seats.find((s) => s.id === m.seatId))
    .filter((s): s is SeatView => s !== undefined),
);
</script>

<template>
  <aside class="flex w-full flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm sm:w-72">
    <h2 class="text-lg font-semibold">Your seats</h2>
    <p v-if="mine.length === 0" class="text-sm text-slate-500">Click seats on the map to hold them.</p>
    <ul v-else class="flex flex-col gap-1 text-sm">
      <li v-for="seat in mine" :key="seat.id" class="flex items-center justify-between">
        <span>{{ seat.rowLabel }}{{ seat.seatNumber }} · {{ formatCents(seat.priceCents) }}</span>
        <button type="button" class="text-xs underline" @click="emit('release', seat.id)">release</button>
      </li>
    </ul>
    <p v-if="mine.length > 0" class="text-sm">
      Expires in <Countdown :expires-at="earliestExpiry" @expired="emit('expired')" />
    </p>
    <p class="text-base font-semibold">Total {{ formatCents(total) }}</p>
    <p v-if="error" role="alert" class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <p v-if="lastBooking" role="status" class="rounded bg-green-50 px-3 py-2 text-sm text-green-800">
      Booked! Reference {{ lastBooking.bookingId.slice(0, 8) }} · {{ formatCents(lastBooking.totalCents) }}
    </p>
    <button
      type="button"
      class="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      :disabled="!canConfirm"
      @click="emit('confirm')"
    >
      Confirm booking
    </button>
  </aside>
</template>
