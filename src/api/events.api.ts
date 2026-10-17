import { http } from "./http";
import { EventDetail, EventSummary } from "./types";

export const eventsApi = {
  async list(q?: string): Promise<EventSummary[]> {
    const params = q ? { q } : undefined;
    const { data } = await http.get<EventSummary[]>("/events", { params });
    return data;
  },
  async get(eventId: string): Promise<EventDetail> {
    const { data } = await http.get<EventDetail>(`/events/${eventId}`);
    return data;
  },
};
