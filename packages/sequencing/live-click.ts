/** A cursor on the playback clock. Disabled lookahead never consumes beats. */
export class QuarterClickScheduler {
  private next = 0;
  constructor(private enabled = false) {}
  collect(enabled: boolean, elapsed: number, beatSeconds: number, duration: number, lookahead = .2): number[] {
    if (![elapsed,beatSeconds,duration,lookahead].every(Number.isFinite) || beatSeconds<=0 || duration<=0 || lookahead<0) return [];
    if(enabled && !this.enabled) this.next=Math.max(0,Math.ceil(elapsed/beatSeconds-1e-9));
    this.enabled=enabled;
    if(!enabled)return [];
    // Recover from delayed timer ticks without replaying missed clicks.
    this.next=Math.max(this.next,Math.ceil((elapsed-.02)/beatSeconds));
    const beats:number[]=[];
    while(this.next*beatSeconds<duration-1e-9 && this.next*beatSeconds<=elapsed+lookahead+1e-9 && beats.length<1000)beats.push(this.next++);
    return beats;
  }
}
