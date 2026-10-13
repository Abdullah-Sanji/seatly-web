<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{ expiresAt: string | null }>();
const emit = defineEmits<{ expired: [] }>();

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
let emittedFor: string | null = null;

const remainingMs = computed(() => (props.expiresAt ? new Date(props.expiresAt).getTime() - now.value : null));

const label = computed(() => {
  if (remainingMs.value === null) return '--:--';
  const total = Math.max(0, Math.ceil(remainingMs.value / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
});

function tick(): void {
  now.value = Date.now();
  if (remainingMs.value !== null && remainingMs.value <= 0 && emittedFor !== props.expiresAt) {
    emittedFor = props.expiresAt;
    emit('expired');
  }
}

function start(): void {
  stop();
  if (props.expiresAt) {
    tick();
    timer = setInterval(tick, 1000);
  }
}

function stop(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

watch(() => props.expiresAt, start, { immediate: true });
onBeforeUnmount(stop);
</script>

<template>
  <span class="font-mono tabular-nums">{{ label }}</span>
</template>
