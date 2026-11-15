/** "November 14, 2026", from a date or YYYY-MM-DD, in UTC whatever the build machine's time zone. */
export function formatDate(date: Date | string): string {
  const day = typeof date === 'string' ? new Date(`${date}T00:00:00Z`) : date;
  return day.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
