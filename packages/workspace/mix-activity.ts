import type {SongEvent,SongLayer} from './music.js';

/** Conservative activity compensation, not LUFS or rendered-audio normalization.
 * Dense polyphony is attenuated; rests never cause large gain boosts.
 */
export function activityGain(events:readonly SongEvent[], seconds:number, layer:SongLayer) {
  let energy=0;
  for(const event of events) {
    if(event.layer!==layer)continue;
    const duration=layer==='drums' ? .12 : Math.min(event.secondsDuration,Math.max(0,seconds-event.seconds));
    const voiceWeight=event.voice==='distorted guitar'?1.5:event.voice==='warm pad'?1.2:1;
    energy+=duration*event.velocity**2*voiceWeight;
  }
  const reference=layer==='chords'?.8:layer==='drums'?.16:.3;
  const activity=energy/Math.max(.1,seconds);
  return activity>reference?Math.max(.65,Math.sqrt(reference/activity)):1;
}
