export type DateFilter = 'today' | 'yesterday' | 'week' | 'month' | 'custom' | 'all';

function localDate(text: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/** Calendar-day ranges use local midnight and an exclusive end. */
export function dateRange(filter: DateFilter, start = '', end = '', now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const next = new Date(today); next.setDate(next.getDate() + 1);
  let from = new Date(today), to = next;
  if (filter === 'all') return { start: -Infinity, end: Infinity, error: '' };
  if (filter === 'yesterday') { from.setDate(from.getDate() - 1); to = today; }
  if (filter === 'week') from.setDate(from.getDate() - 6);
  if (filter === 'month') from.setDate(1);
  if (filter === 'custom') {
    const first = localDate(start), last = localDate(end);
    if (!first || !last) return { start: 0, end: 0, error: 'Choose valid start and end dates.' };
    if (first > last) return { start: 0, end: 0, error: 'End date must be on or after the start date.' };
    from = first; to = last; to.setDate(to.getDate() + 1);
  }
  return { start: from.getTime(), end: to.getTime(), error: '' };
}
