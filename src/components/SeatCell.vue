<script setup lang="ts">
import { computed } from 'vue';
import { SeatView } from '@/api/types';

const props = defineProps<{ seat: SeatView; disabled: boolean; lost: boolean }>();
const emit = defineEmits<{ toggle: [seatId: string] }>();

const isClickable = computed(
  () => !props.disabled && (props.seat.state === 'available' || props.seat.state === 'held_by_me'),
);

const stateClass = computed(() => ({
  'bg-white border-slate-300 hover:bg-slate-100': props.seat.state === 'available',
  'bg-amber-200 border-amber-300 cursor-not-allowed': props.seat.state === 'held',
  'bg-green-500 border-green-600 text-white': props.seat.state === 'held_by_me',
  'bg-slate-400 border-slate-500 text-white cursor-not-allowed': props.seat.state === 'sold',
  'ring-2 ring-red-500': props.lost,
}));

function onClick(): void {
  if (isClickable.value) emit('toggle', props.seat.id);
}
</script>

<template>
  <button
    type="button"
    class="h-9 w-9 rounded border text-sm"
    :class="stateClass"
    :disabled="!isClickable"
    :data-seat="seat.id"
    :title="`${seat.rowLabel}${seat.seatNumber} · ${seat.state.replace('_', ' ')}`"
    @click="onClick"
  >
    {{ seat.seatNumber }}
  </button>
</template>
