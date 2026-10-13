import { flushPromises, mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { createMemoryHistory, createRouter } from 'vue-router';
import { eventsApi } from '@/api/events.api';
import { EventDetail } from '@/api/types';
import { bookingsApi } from '@/api/bookings.api';
import { connectEventSocket } from '@/realtime/event-socket';
import { useAuthStore } from '@/stores/auth.store';
import EventDetailView from './EventDetailView.vue';

vi.mock('@/api/events.api', () => ({ eventsApi: { get: vi.fn() } }));
vi.mock('@/realtime/event-socket', () => ({ connectEventSocket: vi.fn() }));
vi.mock('@/api/bookings.api', () => ({ bookingsApi: { hold: vi.fn(), release: vi.fn(), confirm: vi.fn() } }));

const detail: EventDetail = {
  id: 'e1',
  name: 'Show',
  venueName: 'Hall',
  startsAt: '2026-10-19T19:00:00.000Z',
  salesOpenAt: '2026-10-01T00:00:00.000Z',
  status: 'on_sale',
  availableCount: 1,
  seats: [{ id: 's1', rowLabel: 'A', seatNumber: 1, priceCents: 100, state: 'available' }],
};

describe('EventDetailView (anonymous)', () => {
  it('sends an anonymous seat click to login with a redirect back', async () => {
    vi.mocked(eventsApi.get).mockResolvedValue(detail);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/events/:id', component: EventDetailView },
        { path: '/login', component: { template: '<div>login</div>' } },
      ],
    });
    await router.push('/events/e1');
    const w = mount(EventDetailView, {
      global: { plugins: [router, createTestingPinia({ stubActions: false })] },
    });
    await flushPromises();

    await w.get('button[data-seat="s1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/login');
    expect(router.currentRoute.value.query.redirect).toBe('/events/e1');
    expect(bookingsApi.hold).not.toHaveBeenCalled();
  });
});

function jwt(sub: string, email = 'a@b.c'): string {
  const payload = { sub, email, exp: Math.floor(Date.now() / 1000) + 3600 };
  const b64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `h.${b64}.s`;
}

const TOKEN = jwt('u1');

describe('EventDetailView socket lifecycle', () => {
  const close = vi.fn();
  const updateToken = vi.fn();

  async function setup(token: string | null) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/events/:id', component: EventDetailView },
        { path: '/login', component: { template: '<div>login</div>' } },
      ],
    });
    await router.push('/events/e1');
    const pinia = createTestingPinia({ stubActions: false });
    if (token) useAuthStore(pinia).accessToken = token;
    const wrapper = mount(EventDetailView, { global: { plugins: [router, pinia] } });
    return { wrapper, router };
  }

  beforeEach(() => {
    close.mockReset();
    updateToken.mockReset();
    vi.mocked(connectEventSocket).mockReset().mockReturnValue({ close, updateToken });
    vi.mocked(eventsApi.get).mockReset().mockResolvedValue(detail);
    vi.mocked(bookingsApi.hold).mockReset();
  });

  it('opens no socket for an anonymous viewer', async () => {
    await setup(null);
    await flushPromises();
    expect(connectEventSocket).not.toHaveBeenCalled();
  });

  it('opens one socket when authenticated and closes it on unmount', async () => {
    const { wrapper } = await setup(TOKEN);
    await flushPromises();
    expect(connectEventSocket).toHaveBeenCalledTimes(1);
    expect(connectEventSocket).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://localhost:3000', token: TOKEN, eventId: 'e1' }),
    );
    wrapper.unmount();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('never opens a socket after unmount, even if the load resolves late', async () => {
    let resolve!: (d: EventDetail) => void;
    vi.mocked(eventsApi.get).mockReturnValue(new Promise<EventDetail>((r) => (resolve = r)));
    const { wrapper } = await setup(TOKEN);
    await flushPromises(); // socket opened, load still pending
    wrapper.unmount();
    resolve(detail);
    await flushPromises();
    expect(connectEventSocket).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('navigating away does not reload or reconnect', async () => {
    const { router } = await setup(TOKEN);
    await flushPromises();
    expect(eventsApi.get).toHaveBeenCalledTimes(1);
    expect(connectEventSocket).toHaveBeenCalledTimes(1);

    await router.push('/login');
    await flushPromises();
    expect(eventsApi.get).toHaveBeenCalledTimes(1);
    expect(connectEventSocket).toHaveBeenCalledTimes(1);
  });

  it('navigating to another event reloads and rejoins', async () => {
    const { router } = await setup(TOKEN);
    await flushPromises();

    await router.push('/events/e2');
    await flushPromises();
    expect(eventsApi.get).toHaveBeenLastCalledWith('e2');
    expect(connectEventSocket).toHaveBeenCalledTimes(2);
    expect(connectEventSocket).toHaveBeenLastCalledWith(expect.objectContaining({ eventId: 'e2' }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('a same-user token refresh does not reload or reconnect', async () => {
    await setup(TOKEN);
    await flushPromises();

    const refreshed = jwt('u1', 'other@b.c');
    useAuthStore().accessToken = refreshed;
    await flushPromises();
    expect(eventsApi.get).toHaveBeenCalledTimes(1);
    expect(connectEventSocket).toHaveBeenCalledTimes(1);
    expect(updateToken).toHaveBeenCalledWith(refreshed);
  });

  it('logging out reloads anonymously and closes the socket', async () => {
    await setup(TOKEN);
    await flushPromises();

    useAuthStore().accessToken = null;
    await flushPromises();
    expect(close).toHaveBeenCalledTimes(1);
    expect(eventsApi.get).toHaveBeenCalledTimes(2);
    expect(connectEventSocket).toHaveBeenCalledTimes(1);
  });
});
