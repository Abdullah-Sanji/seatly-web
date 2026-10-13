import { io } from 'socket.io-client';
import { SalesOpenedMessage, SeatUpdateMessage } from '@/api/types';

/** The slice of a socket.io Socket we use; lets tests pass a fake. */
export interface SocketLike {
  on(event: string, handler: (payload: unknown) => void): this;
  emit(event: string, payload: unknown): this;
  disconnect(): this;
  /** socket.io reads this on every (re)connect handshake. */
  auth?: { token: string } | ((cb: (data: object) => void) => void);
}

export interface SocketOptions {
  auth: { token: string };
  transports: string[];
}

export interface EventSocketOptions {
  url: string;
  token: string;
  eventId: string;
  onMessage(msg: SeatUpdateMessage | SalesOpenedMessage): void;
  /** Called on the second and later connects: missed messages are not replayed, so refetch. */
  onReconnect(): void;
  /** Called when the server drops the connection (e.g. expired token); socket.io will not auto-reconnect. */
  onServerDisconnect?(): void;
  createSocket?: (url: string, opts: SocketOptions) => SocketLike;
}

export interface EventSocket {
  close(): void;
  /** Use this token for future reconnect handshakes. */
  updateToken(token: string): void;
}

// socket.io's Socket is structurally compatible with SocketLike but has wider overloads, hence the cast.
const defaultCreate = (url: string, opts: SocketOptions): SocketLike => io(url, opts) as unknown as SocketLike;

export function connectEventSocket(options: EventSocketOptions): EventSocket {
  const create = options.createSocket ?? defaultCreate;
  const socket = create(options.url, { auth: { token: options.token }, transports: ['websocket'] });
  let connects = 0;

  socket.on('connect', () => {
    connects += 1;
    socket.emit('join_event', { eventId: options.eventId });
    if (connects > 1) options.onReconnect();
  });
  socket.on('seat_update', (payload) => options.onMessage(payload as SeatUpdateMessage));
  socket.on('sales_opened', (payload) => options.onMessage(payload as SalesOpenedMessage));
  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') options.onServerDisconnect?.();
  });

  return {
    close() {
      socket.disconnect();
    },
    updateToken(token: string) {
      socket.auth = { token };
    },
  };
}
