import { EventStatus } from '@/api/types';

const formatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDateTime(iso: string): string {
  return formatter.format(new Date(iso));
}

const LABELS: Record<EventStatus, string> = { upcoming: 'Upcoming', on_sale: 'On sale', closed: 'Closed' };

export function statusLabel(status: EventStatus): string {
  return LABELS[status];
}
