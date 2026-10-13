<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { eventsApi } from '@/api/events.api';
import { EventSummary } from '@/api/types';
import EventCard from '@/components/EventCard.vue';

const events = ref<EventSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    events.value = await eventsApi.list();
  } catch {
    error.value = 'Could not load events.';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="flex flex-col gap-4">
    <h1 class="text-2xl font-semibold">Events</h1>
    <p v-if="loading">Loading…</p>
    <p v-else-if="error" role="alert" class="text-red-700">{{ error }}</p>
    <p v-else-if="events.length === 0">No events yet.</p>
    <div v-else class="grid gap-4 sm:grid-cols-2">
      <EventCard v-for="event in events" :key="event.id" :event="event" />
    </div>
  </section>
</template>
