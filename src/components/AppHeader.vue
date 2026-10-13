<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';

const auth = useAuthStore();
const router = useRouter();

async function onLogout(): Promise<void> {
  await auth.logout();
  await router.push('/events');
}
</script>

<template>
  <header class="mb-6 flex items-center justify-between border-b pb-3">
    <RouterLink to="/events" class="text-xl font-bold">Seatly</RouterLink>
    <nav class="flex items-center gap-4 text-sm">
      <RouterLink to="/events" class="underline">Events</RouterLink>
      <template v-if="auth.isAuthenticated">
        <RouterLink to="/me/bookings" class="underline">My bookings</RouterLink>
        <span class="text-slate-500">{{ auth.email }}</span>
        <button type="button" class="rounded border px-3 py-1" @click="onLogout">Log out</button>
      </template>
      <template v-else>
        <RouterLink to="/login" class="underline">Log in</RouterLink>
        <RouterLink to="/register" class="underline">Register</RouterLink>
      </template>
    </nav>
  </header>
</template>
