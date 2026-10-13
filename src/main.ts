import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { setTokenSource } from '@/api/http';
import App from './App.vue';
import { router } from './router';
import { useAuthStore } from './stores/auth.store';
import './style.css';

async function start(): Promise<void> {
  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);

  const auth = useAuthStore(pinia);
  setTokenSource({ getToken: () => auth.accessToken, refresh: () => auth.refresh() });
  await auth.bootstrap();

  app.use(router);
  await router.isReady();
  app.mount('#app');
}

void start();
