import { connectEventSocket, SocketLike } from './event-socket';

class FakeSocket implements SocketLike {
  handlers = new Map<string, (payload: unknown) => void>();
  emitted: { event: string; payload: unknown }[] = [];
  disconnected = false;
  on(event: string, handler: (payload: unknown) => void): this {
    this.handlers.set(event, handler);
    return this;
  }
  emit(event: string, payload: unknown): this {
    this.emitted.push({ event, payload });
    return this;
  }
  disconnect(): this {
    this.disconnected = true;
    return this;
  }
  fire(event: string, payload?: unknown): void {
    this.handlers.get(event)?.(payload);
  }
}

describe('connectEventSocket', () => {
  it('joins the room on connect, forwards messages, refetches only on reconnect', () => {
    const fake = new FakeSocket();
    const onMessage = vi.fn();
    const onReconnect = vi.fn();
    const createSocket = vi.fn(() => fake);

    const socket = connectEventSocket({ url: 'http://api', token: 'tok', eventId: 'e1', onMessage, onReconnect, createSocket });

    expect(createSocket).toHaveBeenCalledWith('http://api', { auth: { token: 'tok' }, transports: ['websocket'] });
    fake.fire('connect');
    expect(fake.emitted).toEqual([{ event: 'join_event', payload: { eventId: 'e1' } }]);
    expect(onReconnect).not.toHaveBeenCalled();

    fake.fire('seat_update', { type: 'held', seatIds: ['s1'] });
    fake.fire('sales_opened', { type: 'sales_opened' });
    expect(onMessage).toHaveBeenNthCalledWith(1, { type: 'held', seatIds: ['s1'] });
    expect(onMessage).toHaveBeenNthCalledWith(2, { type: 'sales_opened' });

    fake.fire('connect');
    expect(fake.emitted).toHaveLength(2);
    expect(onReconnect).toHaveBeenCalledTimes(1);

    socket.close();
    expect(fake.disconnected).toBe(true);
  });
});
