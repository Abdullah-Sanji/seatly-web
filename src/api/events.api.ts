import { http } from './http';
import { EventDetail, EventSummary } from './types';

export const eventsApi = {
  async list(): Promise<EventSummary[]> {
    const { data } = await http.get<EventSummary[]>('/events');
    return data;
  },
  async get(eventId: string): Promise<EventDetail> {
    const { data } = await http.get<EventDetail>(`/events/${eventId}`);
    return data;
  },
};
