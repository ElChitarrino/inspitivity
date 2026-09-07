export type MidiNoteEvent = {
  pitch: number;
  start: number;
  duration: number;
  velocity?: number;
  channel?: number;
};

const text = (value: string) => Array.from(new TextEncoder().encode(value));
const u16 = (value: number) => [(value >> 8) & 0xff, value & 0xff];
const u32 = (value: number) => [
  (value >> 24) & 0xff,
  (value >> 16) & 0xff,
  (value >> 8) & 0xff,
  value & 0xff,
];
const chunk = (name: string, data: number[]) => [
  ...text(name),
  ...u32(data.length),
  ...data,
];

export function variableLength(value: number) {
  let buffer = Math.max(0, Math.round(value)) & 0x0fffffff;
  const bytes = [buffer & 0x7f];
  while ((buffer >>= 7)) bytes.unshift((buffer & 0x7f) | 0x80);
  return bytes;
}

const meterBytes = (meter: string) => {
  const [top = 4, bottom = 4] = meter.split("/").map(Number);
  const denominatorPower = Math.max(0, Math.round(Math.log2(bottom || 4)));
  return [0xff, 0x58, 0x04, Math.max(1, top), denominatorPower, 24, 8];
};

export function createMidiFile({
  name,
  bpm,
  meter = "4/4",
  notes,
  program = 81,
}: {
  name: string;
  bpm: number;
  meter?: string;
  notes: MidiNoteEvent[];
  program?: number;
}) {
  const ticksPerBeat = 480;
  const events: Array<{ tick: number; order: number; bytes: number[] }> = [];
  const safeBpm = Math.max(30, Math.min(300, Math.round(bpm || 120)));
  const microseconds = Math.round(60_000_000 / safeBpm);
  const title = text(name.slice(0, 80));
  events.push(
    { tick: 0, order: 0, bytes: [0xff, 0x03, ...variableLength(title.length), ...title] },
    { tick: 0, order: 1, bytes: [0xff, 0x51, 0x03, (microseconds >> 16) & 0xff, (microseconds >> 8) & 0xff, microseconds & 0xff] },
    { tick: 0, order: 2, bytes: meterBytes(meter) },
    { tick: 0, order: 3, bytes: [0xc0, Math.max(0, Math.min(127, Math.round(program)))] },
  );
  for (const note of notes) {
    const channel = Math.max(0, Math.min(15, Math.round(note.channel ?? 0)));
    const pitch = Math.max(0, Math.min(127, Math.round(note.pitch)));
    const velocity = Math.max(1, Math.min(127, Math.round((note.velocity ?? 0.76) * 127)));
    const start = Math.max(0, Math.round(note.start * ticksPerBeat));
    const end = Math.max(start + 1, Math.round((note.start + note.duration) * ticksPerBeat));
    events.push(
      { tick: start, order: 5, bytes: [0x90 | channel, pitch, velocity] },
      { tick: end, order: 4, bytes: [0x80 | channel, pitch, 0] },
    );
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const track: number[] = [];
  let previousTick = 0;
  for (const event of events) {
    track.push(...variableLength(event.tick - previousTick), ...event.bytes);
    previousTick = event.tick;
  }
  track.push(0, 0xff, 0x2f, 0);
  return new Uint8Array([
    ...chunk("MThd", [0, 0, 0, 1, ...u16(ticksPerBeat)]),
    ...chunk("MTrk", track),
  ]);
}

export function createMultitrackMidi({ name, tracks, markers, length }: {
  name: string;
  tracks: { name: string; channel: number; program: number; notes: MidiNoteEvent[] }[];
  markers: { start: number; meter: string; bpm: number; name?: string }[];
  length: number;
}) {
  type Event = { tick: number; order: number; bytes: number[] };
  const titleEvent = (title: string): Event => { const t=text(title.slice(0,100)); return { tick:0, order:0, bytes:[0xff,3,...variableLength(t.length),...t] }; };
  const encode = (events: Event[]) => {
    events.sort((a,b)=>a.tick-b.tick || a.order-b.order);
    const bytes: number[] = []; let previous=0;
    for (const e of events) { bytes.push(...variableLength(e.tick-previous),...e.bytes); previous=e.tick; }
    bytes.push(...variableLength(Math.max(previous,Math.round(length*480))-previous),0xff,0x2f,0);
    return chunk("MTrk",bytes);
  };
  const conductor: Event[] = [titleEvent(name)];
  for (const marker of markers) {
    const tick=Math.round(marker.start*480), tempo=Math.round(60000000/Math.max(10,marker.bpm));
    conductor.push({ tick,order:1,bytes:[0xff,0x51,3,(tempo>>16)&255,(tempo>>8)&255,tempo&255] }, { tick,order:2,bytes:meterBytes(marker.meter) });
    if (marker.name) { const t=text(marker.name); conductor.push({tick,order:3,bytes:[0xff,6,...variableLength(t.length),...t]}); }
  }
  const encoded = [encode(conductor)];
  for (const track of tracks) {
    const events: Event[] = [titleEvent(track.name), {tick:0,order:1,bytes:[0xc0|track.channel,track.program]}];
    for (const n of track.notes) {
      if (![n.pitch,n.start,n.duration].every(Number.isFinite)) continue;
      const start=Math.max(0,Math.round(n.start*480)), end=Math.max(start+1,Math.round((n.start+n.duration)*480));
      const pitch=Math.max(0,Math.min(127,Math.round(n.pitch))), velocity=Math.max(1,Math.min(127,Math.round((n.velocity ?? .7)*127)));
      events.push({tick:start,order:5,bytes:[0x90|track.channel,pitch,velocity]}, {tick:end,order:4,bytes:[0x80|track.channel,pitch,0]});
    }
    encoded.push(encode(events));
  }
  return new Uint8Array([...chunk("MThd",[0,1,...u16(encoded.length),...u16(480)]),...encoded.flat()]);
}
