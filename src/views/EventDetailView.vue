<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiUrl } from '@/config';
import HoldPanel from '@/components/HoldPanel.vue';
import SeatGrid from '@/components/SeatGrid.vue';
import { connectEventSocket, EventSocket } from '@/realtime/event-socket';
import { useAuthStore } from '@/stores/auth.store';
import { useSeatMapStore } from '@/stores/seat-map.store';
import { formatDateTime, statusLabel } from '@/utils/time';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const map = useSeatMapStore();

const eventId = computed(() => String(route.params.id));
const gridDisabled = computed(() => map.event?.status !== 'on_sale' || map.loading || map.busy);

let socket: EventSocket | null = null;
let unmounted = false;

function openSocket(): void {
  closeSocket();
  if (unmounted || !auth.accessToken) return;
  socket = connectEventSocket({
    url: apiUrl(),
    token: auth.accessToken,
    eventId: eventId.value,
    onMessage: (msg) => map.onSocketMessage(msg),
    onReconnect: () => void map.load(eventId.value),
    // An expired token makes the server drop the socket and socket.io does not retry: refresh, then reopen.
    onServerDisconnect: async () => {
      await auth.refresh();
      openSocket();
    },
  });
}

function closeSocket(): void {
  socket?.close();
  socket = null;
}

async function onToggle(seatId: string): Promise<void> {
  if (!auth.isAuthenticated) {
    await router.push({ path: '/login', query: { redirect: route.fullPath } });
    return;
  }
  await map.toggle(seatId);
}

onMounted(async () => {
  await auth.ensureFresh();
  openSocket();
  await map.load(eventId.value);
});

// Logging in/out on this page: reconnect the socket and reload (held_by_me depends on the bearer).
watch(
  () => auth.userId,
  async () => {
    map.reset();
    openSocket();
    await map.load(eventId.value);
  },
);

// A same-user token refresh must not reload (it could overwrite an in-flight hold): only update the socket auth.
watch(
  () => auth.accessToken,
  (token) => {
    if (token && socket) socket.updateToken(token);
  },
);

// Vue Router reuses this component across /events/a -> /events/b.
watch(eventId, async (id) => {
  if (unmounted || !route.params.id) return; // leaving the page: the route changes before unmount
  map.reset();
  openSocket();
  await map.load(id);
});

onBeforeUnmount(() => {
  unmounted = true;
  closeSocket();
  map.reset();
});
</script>

<template>
  <section class="flex flex-col gap-4">
    <p v-if="map.loading && !map.event">Loading…</p>
    <p v-else-if="!map.event" role="alert" class="text-red-700">{{ map.error ?? 'Event not found.' }}</p>
    <template v-else>
      <header>
        <h1 class="text-2xl font-semibold">{{ map.event.name }}</h1>
        <p class="text-sm text-slate-600">
          {{ map.event.venueName }} · {{ formatDateTime(map.event.startsAt) }} · {{ statusLabel(map.event.status) }}
        </p>
        <p v-if="map.event.status === 'upcoming'" class="mt-1 text-sm text-amber-700">
          Sales open {{ formatDateTime(map.event.salesOpenAt) }}.<span v-if="auth.isAuthenticated"> This page updates automatically.</span>
        </p>
        <p v-if="!auth.isAuthenticated" class="mt-1 text-sm text-slate-500">
          Log in to hold seats and see live updates.
        </p>
      </header>
      <div class="flex flex-col gap-6 sm:flex-row">
        <SeatGrid :seats="map.event.seats" :disabled="gridDisabled" :lost-seat-ids="map.lostSeatIds" @toggle="onToggle" />
        <HoldPanel
          :seats="map.event.seats"
          :my-seats="map.mySeats"
          :total="map.total"
          :earliest-expiry="map.earliestExpiry"
          :can-confirm="map.canConfirm && auth.isAuthenticated"
          :error="map.error"
          :last-booking="map.lastBooking"
          @confirm="map.confirm()"
          @release="onToggle"
          @expired="map.load(eventId)"
        />
      </div>
    </template>
  </section>
</template>
