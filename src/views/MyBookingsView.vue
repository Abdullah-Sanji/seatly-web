<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { bookingsApi } from '@/api/bookings.api';
import { MyBooking } from '@/api/types';
import { formatCents } from '@/utils/money';
import { formatDateTime } from '@/utils/time';

const bookings = ref<MyBooking[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const seatList = (booking: MyBooking): string => booking.seats.map((s) => `${s.rowLabel}${s.seatNumber}`).join(', ');

onMounted(async () => {
  try {
    bookings.value = await bookingsApi.myBookings();
  } catch {
    error.value = 'Could not load your bookings.';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="flex flex-col gap-4">
    <h1 class="text-2xl font-semibold">My bookings</h1>
    <p v-if="loading">Loading…</p>
    <p v-else-if="error" role="alert" class="text-red-700">{{ error }}</p>
    <p v-else-if="bookings.length === 0">No bookings yet.</p>
    <table v-else class="w-full text-left text-sm">
      <thead class="border-b text-slate-500">
        <tr>
          <th class="py-2">Event</th>
          <th class="py-2">Seats</th>
          <th class="py-2">Total</th>
          <th class="py-2">Booked</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="booking in bookings" :key="booking.id" class="border-b">
          <td class="py-2">{{ booking.eventName }}</td>
          <td class="py-2">{{ seatList(booking) }}</td>
          <td class="py-2">{{ formatCents(booking.totalCents) }}</td>
          <td class="py-2">{{ formatDateTime(booking.createdAt) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
