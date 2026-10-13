import { flushPromises, mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { createMemoryHistory, createRouter } from 'vue-router';
import { eventsApi } from '@/api/events.api';
import { EventDetail } from '@/api/types';
import EventDetailView from './EventDetailView.vue';

vi.mock('@/api/events.api', () => ({ eventsApi: { get: vi.fn() } }));
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
  });
});
