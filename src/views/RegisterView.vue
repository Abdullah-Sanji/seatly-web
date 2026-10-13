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
    await auth.register(email, password);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/events';
    await router.push(redirect);
  } catch (e) {
    if (isApiError(e) && e.code === 'EMAIL_TAKEN') error.value = 'That email is already registered.';
    else if (isApiError(e) && e.code === 'VALIDATION_FAILED') error.value = 'Use a valid email and a password of 8–72 characters.';
    else error.value = 'Registration failed. Try again.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <h1 class="text-2xl font-semibold">Register</h1>
    <AuthForm autocomplete="new-password" submit-label="Create account" :busy="busy" :error="error" @submit="onSubmit" />
    <p class="text-sm">
      Have an account?
      <RouterLink class="underline" :to="{ path: '/login', query: route.query }">Log in</RouterLink>
    </p>
  </section>
</template>
