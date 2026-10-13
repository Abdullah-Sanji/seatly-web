<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { isApiError } from '@/api/errors';
import AuthForm from '@/components/AuthForm.vue';
import { useAuthStore } from '@/stores/auth.store';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const busy = ref(false);
const error = ref<string | null>(null);

async function onSubmit(email: string, password: string): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    await auth.login(email, password);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/events';
    await router.push(redirect);
  } catch (e) {
    error.value = isApiError(e) && e.code === 'UNAUTHORIZED' ? 'Wrong email or password.' : 'Login failed. Try again.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <h1 class="text-2xl font-semibold">Log in</h1>
    <AuthForm autocomplete="current-password" submit-label="Log in" :busy="busy" :error="error" @submit="onSubmit" />
    <p class="text-sm">
      No account?
      <RouterLink class="underline" :to="{ path: '/register', query: route.query }">Register</RouterLink>
    </p>
  </section>
</template>
