import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { installGuards, routes } from './index';

describe('requireAuth guard', () => {
  beforeEach(() => setActivePinia(createPinia()));

  function makeRouter() {
    const router = createRouter({ history: createMemoryHistory(), routes });
    installGuards(router);
    return router;
  }

  it('redirects anonymous users to /login with the original path', async () => {
    const router = makeRouter();
    await router.push('/me/bookings');
    expect(router.currentRoute.value.path).toBe('/login');
    expect(router.currentRoute.value.query.redirect).toBe('/me/bookings');
  });

  it('lets authenticated users through', async () => {
    useAuthStore().accessToken = 'h.e30.s';
    const router = makeRouter();
    await router.push('/me/bookings');
    expect(router.currentRoute.value.path).toBe('/me/bookings');
  });

  it('leaves public routes alone', async () => {
    const router = makeRouter();
    await router.push('/events');
    expect(router.currentRoute.value.path).toBe('/events');
  });
});
