/** Audio-clock queue. Future events remain data until inside the lookahead. */
export class AudioQueue {
  private pending: { seconds: number; emit: (delay: number) => void }[] = [];
  private dirty = false;

  get size() { return this.pending.length; }

  add(seconds: number, emit: (delay: number) => void) {
    if (!Number.isFinite(seconds)) return;
    this.pending.push({ seconds, emit });
    this.dirty = true;
  }

  flush(now: number, ahead = .2) {
    if (this.dirty) {
      this.pending.sort((a, b) => a.seconds - b.seconds);
      this.dirty = false;
    }
    let count = 0;
    while (count < this.pending.length && this.pending[count].seconds <= now + ahead) count++;
    // Remove before emitting: callbacks cannot cause an event to be emitted twice.
    const due = this.pending.splice(0, count);
    for (const event of due) {
      if (event.seconds >= now - .02) event.emit(Math.max(0, event.seconds - now));
    }
  }

  clear() { this.pending = []; this.dirty = false; }
}
