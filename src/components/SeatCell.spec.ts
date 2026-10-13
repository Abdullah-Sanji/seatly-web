import { mount } from '@vue/test-utils';
import { SeatView } from '@/api/types';
import SeatCell from './SeatCell.vue';

const seat = (state: SeatView['state']): SeatView => ({ id: 's1', rowLabel: 'A', seatNumber: 7, priceCents: 100, state });

describe('SeatCell', () => {
  it.each([
    ['available', false, 'bg-white'],
    ['held', true, 'bg-amber-200'],
    ['held_by_me', false, 'bg-green-500'],
    ['sold', true, 'bg-slate-400'],
  ] as const)('%s renders the right style and disabled state', (state, disabled, cls) => {
    const w = mount(SeatCell, { props: { seat: seat(state), disabled: false, lost: false } });
    const button = w.get('button');
    expect(button.classes()).toContain(cls);
    expect(button.attributes('disabled') !== undefined).toBe(disabled);
    expect(button.text()).toBe('7');
  });

  it('emits toggle with the seat id when clicked, and is inert when disabled by the parent', async () => {
    const w = mount(SeatCell, { props: { seat: seat('available'), disabled: false, lost: false } });
    await w.get('button').trigger('click');
    expect(w.emitted('toggle')).toEqual([['s1']]);

    const locked = mount(SeatCell, { props: { seat: seat('available'), disabled: true, lost: false } });
    await locked.get('button').trigger('click');
    expect(locked.emitted('toggle')).toBeUndefined();
  });

  it('highlights a lost seat', () => {
    const w = mount(SeatCell, { props: { seat: seat('held'), disabled: false, lost: true } });
    expect(w.get('button').classes()).toContain('ring-2');
  });
});
