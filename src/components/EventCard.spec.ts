import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import EventCard from './EventCard.vue';

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }] });

describe('EventCard', () => {
  it('shows name, venue, status and available count, and links to the detail page', () => {
    const wrapper = mount(EventCard, {
      props: {
        event: {
          id: 'e1',
          name: 'Jazz Night',
          venueName: 'Hall',
          startsAt: '2026-10-19T19:00:00.000Z',
          salesOpenAt: '2026-10-01T00:00:00.000Z',
          status: 'on_sale',
          availableCount: 42,
        },
      },
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain('Jazz Night');
    expect(wrapper.text()).toContain('Hall');
    expect(wrapper.text()).toContain('On sale');
    expect(wrapper.text()).toContain('42 seats left');
    expect(wrapper.find('a').attributes('href')).toBe('/events/e1');
  });
});
