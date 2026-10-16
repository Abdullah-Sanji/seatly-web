<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { eventsApi } from "@/api/events.api";
import { EventSummary } from "@/api/types";
import EventCard from "@/components/EventCard.vue";
import {
  SEARCH_DEBOUNCE_MS,
  termFromQuery,
  withSearchTerm,
} from "./events-search.logic";

const route = useRoute();
const router = useRouter();

const events = ref<EventSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const term = ref(termFromQuery(route.query.q));
const activeTerm = ref(term.value);

let timer: ReturnType<typeof setTimeout> | undefined;
let requestId = 0;

async function load(q: string): Promise<void> {
  const id = ++requestId;
  activeTerm.value = q;
  loading.value = true;
  error.value = null;
  try {
    const result = await eventsApi.list(q || undefined);
    if (id !== requestId) return;
    events.value = result;
  } catch {
    if (id !== requestId) return;
    error.value = "Could not load events.";
  } finally {
    if (id === requestId) loading.value = false;
  }
}

onMounted(() => load(term.value));

watch(term, (value) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    void router.replace({ query: withSearchTerm(route.query, value) });
    void load(value);
  }, SEARCH_DEBOUNCE_MS);
});

onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <section class="flex flex-col gap-4">
    <h1 class="text-2xl font-semibold">Events</h1>
    <input
      v-model="term"
      type="search"
      aria-label="Search events"
      placeholder="Search by event or venue"
      class="w-full rounded border border-gray-300 px-3 py-2"
    />
    <p v-if="loading">Loading…</p>
    <p v-else-if="error" role="alert" class="text-red-700">{{ error }}</p>
    <p v-else-if="events.length === 0">
      {{ activeTerm ? "No events match your search" : "No events yet." }}
    </p>
    <div v-else class="grid gap-4 sm:grid-cols-2">
      <EventCard v-for="event in events" :key="event.id" :event="event" />
    </div>
  </section>
</template>
