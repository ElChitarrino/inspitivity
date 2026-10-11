/** Convert the audio clock to a wrapped musical position; paused clocks stay put. */
export function playbackBeat(seconds: number, bpm: number, phraseBeats: number) {
  if (![seconds,bpm,phraseBeats].every(Number.isFinite) || seconds < 0 || bpm <= 0 || phraseBeats <= 0) return 0;
  return (seconds*bpm/60)%phraseBeats;
}
export function activeChordIndex(beats: number[], position: number) {
  let end=0;
  return beats.findIndex(duration=>{end+=Math.max(.25,duration);return position<end;});
}
