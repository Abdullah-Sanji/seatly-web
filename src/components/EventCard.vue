<script setup lang="ts">
import { computed } from 'vue';
import { EventSummary } from '@/api/types';
import { formatDateTime, statusLabel } from '@/utils/time';

const props = defineProps<{ event: EventSummary }>();

const badgeClass = computed(() => ({
  'bg-green-100 text-green-800': props.event.status === 'on_sale',
  'bg-amber-100 text-amber-800': props.event.status === 'upcoming',
  'bg-slate-200 text-slate-700': props.event.status === 'closed',
}));
</script>

<template>
  <RouterLink :to="`/events/${event.id}`" class="block rounded-lg border bg-white p-4 shadow-sm hover:shadow">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">{{ event.name }}</h2>
        <p class="text-sm text-slate-600">{{ event.venueName }} · {{ formatDateTime(event.startsAt) }}</p>
      </div>
      <span class="rounded px-2 py-0.5 text-xs font-medium" :class="badgeClass">{{ statusLabel(event.status) }}</span>
    </div>
    <p class="mt-2 text-sm">{{ event.availableCount }} seats left</p>
  </RouterLink>
</template>
