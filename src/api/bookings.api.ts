import { http } from './http';
import { BookingResult, HoldResponse, MyBooking } from './types';

export const bookingsApi = {
  async hold(eventId: string, seatId: string): Promise<HoldResponse> {
    const { data } = await http.post<HoldResponse>(`/events/${eventId}/seats/${seatId}/hold`);
    return data;
  },
  async release(eventId: string, seatId: string): Promise<void> {
    await http.delete(`/events/${eventId}/seats/${seatId}/hold`);
  },
  async confirm(eventId: string): Promise<BookingResult> {
    const { data } = await http.post<BookingResult>(`/events/${eventId}/bookings`);
    return data;
  },
  async myBookings(): Promise<MyBooking[]> {
    const { data } = await http.get<MyBooking[]>('/me/bookings');
    return data;
  },
};
