export function beatDurationSeconds(bpm: number) {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError("BPM must be greater than zero");
  return 60 / bpm;
}

export function subdivisionDurationSeconds(bpm: number, subdivision: number) {
  if (!Number.isFinite(subdivision) || subdivision <= 0) throw new RangeError("Subdivision must be greater than zero");
  return beatDurationSeconds(bpm) / subdivision;
}

export function progressionLoopDurationMs(chordCount: number, bpm: number) {
  return Math.max(0, chordCount) * beatDurationSeconds(bpm) * 1000;
}

export function melodyLoopDurationMs(events: Array<{ start: number; duration: number }>, bpm: number) {
  if (!events.length) return 0;
  const beats = Math.max(...events.map(event => event.start + event.duration));
  return beats * beatDurationSeconds(bpm) * 1000;
}

export function calculateTapTempo(timestamps: number[]) {
  if (timestamps.length < 2) return null;
  const intervals = timestamps.slice(1).map((timestamp, index) => timestamp - timestamps[index]).filter(interval => interval > 0);
  if (!intervals.length) return null;
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const filtered = intervals.filter(interval => interval >= median * .55 && interval <= median * 1.8);
  const average = filtered.reduce((sum, interval) => sum + interval, 0) / filtered.length;
  return Math.round(60000 / average);
}

export function isAccentedStep(step: number, beatsPerBar: number, subdivision: number) {
  return step % (beatsPerBar * subdivision) === 0;
}
