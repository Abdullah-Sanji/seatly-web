<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{ submitLabel: string; busy: boolean; error: string | null }>();
const emit = defineEmits<{ submit: [email: string, password: string] }>();

const email = ref('');
const password = ref('');

function onSubmit(): void {
  if (props.busy) return;
  emit('submit', email.value.trim(), password.value);
}
</script>

<template>
  <form class="flex max-w-sm flex-col gap-3" @submit.prevent="onSubmit">
    <label class="flex flex-col gap-1 text-sm">
      Email
      <input v-model="email" type="email" required autocomplete="email" class="rounded border px-3 py-2" />
    </label>
    <label class="flex flex-col gap-1 text-sm">
      Password
      <input
        v-model="password"
        type="password"
        required
        minlength="8"
        maxlength="72"
        autocomplete="current-password"
        class="rounded border px-3 py-2"
      />
    </label>
    <p v-if="error" role="alert" class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <button type="submit" :disabled="busy" class="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">
      {{ busy ? 'Please wait…' : submitLabel }}
    </button>
  </form>
</template>
