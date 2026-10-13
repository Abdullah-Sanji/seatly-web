export type EventStatus = 'upcoming' | 'on_sale' | 'closed';
export type SeatState = 'available' | 'held' | 'held_by_me' | 'sold';

export interface SeatView {
  id: string;
  rowLabel: string;
  seatNumber: number;
  priceCents: number;
  state: SeatState;
}

export interface EventSummary {
  id: string;
  name: string;
  venueName: string;
  startsAt: string;
  salesOpenAt: string;
  status: EventStatus;
  availableCount: number;
}

export interface EventDetail extends EventSummary {
  seats: SeatView[];
}

export interface HoldResponse {
  seatId: string;
  expiresAt: string;
}

export interface BookingResult {
  bookingId: string;
  seatIds: string[];
  totalCents: number;
}

export interface MyBooking {
  id: string;
  eventName: string;
  seats: { rowLabel: string; seatNumber: number }[];
  totalCents: number;
  createdAt: string;
}

export interface SeatUpdateMessage {
  type: 'held' | 'released' | 'sold';
  seatIds: string[];
  expiresAt?: string;
}

export interface SalesOpenedMessage {
  type: 'sales_opened';
}

export interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details: Record<string, unknown>;
}
