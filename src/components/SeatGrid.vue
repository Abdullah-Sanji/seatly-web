<script setup lang="ts">
import { computed } from 'vue';
import { SeatView } from '@/api/types';
import SeatCell from './SeatCell.vue';

const props = defineProps<{ seats: SeatView[]; disabled: boolean; lostSeatIds: string[] }>();
const emit = defineEmits<{ toggle: [seatId: string] }>();

const rows = computed(() => {
  const byRow = new Map<string, SeatView[]>();
  for (const seat of props.seats) {
    const row = byRow.get(seat.rowLabel) ?? [];
    row.push(seat);
    byRow.set(seat.rowLabel, row);
  }
  return [...byRow.entries()].map(([label, seats]) => ({ label, seats }));
});
const lost = computed(() => new Set(props.lostSeatIds));
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="mb-2 rounded bg-slate-200 py-1 text-center text-xs uppercase tracking-widest">Stage</div>
    <div v-for="row in rows" :key="row.label" class="flex items-center gap-2">
      <span class="w-6 text-sm font-semibold text-slate-500">{{ row.label }}</span>
      <SeatCell
        v-for="seat in row.seats"
        :key="seat.id"
        :seat="seat"
        :disabled="disabled"
        :lost="lost.has(seat.id)"
        @toggle="emit('toggle', $event)"
      />
    </div>
    <p class="mt-2 flex gap-4 text-xs text-slate-600">
      <span><i class="inline-block h-3 w-3 rounded border bg-white align-middle" /> available</span>
      <span><i class="inline-block h-3 w-3 rounded bg-amber-200 align-middle" /> held</span>
      <span><i class="inline-block h-3 w-3 rounded bg-green-500 align-middle" /> yours</span>
      <span><i class="inline-block h-3 w-3 rounded bg-slate-400 align-middle" /> sold</span>
    </p>
  </div>
</template>
