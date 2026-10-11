/** Advance a sorted score without allocating voices for the whole song.
 * Missed notes are skipped after a stalled tab, never burst-played together.
 */
export function scheduleWindow<T extends { seconds: number }>(
  events: readonly T[], index: number, elapsed: number,
  emit: (event: T, delay: number) => void, ahead = .2,
) {
  while (index < events.length && events[index].seconds <= elapsed + ahead) {
    const event = events[index++];
    if (event.seconds >= elapsed - .02) emit(event, Math.max(0, event.seconds - elapsed));
  }
  return index;
}
