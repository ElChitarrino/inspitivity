export type CharacterVoice = 'warm pad' | 'glass' | 'pluck' | 'analog pulse' | 'air flute';
export type PartialVoice = { ratio:number; level:number; decay:number; detune:number; waveform:OscillatorType };
export type InstrumentCharacter = { attack:number; release:number; sustain:number; cutoff:number; resonance:number; room:number; partials:readonly PartialVoice[] };
/** Fixed, small voice budgets. Decay belongs to each partial, giving struck instruments a changing spectrum. */
export const INSTRUMENT_CHARACTERS:Record<CharacterVoice,InstrumentCharacter> = {
  'warm pad':{attack:.22,release:.65,sustain:.78,cutoff:1600,resonance:.45,room:1,partials:[{ratio:1,level:.48,decay:0,detune:-6,waveform:'sawtooth'},{ratio:1,level:.48,decay:0,detune:6,waveform:'sawtooth'},{ratio:.5,level:.18,decay:0,detune:0,waveform:'sine'}]},
  glass:{attack:.003,release:.38,sustain:.12,cutoff:9500,resonance:.5,room:1,partials:[{ratio:1,level:.7,decay:1.1,detune:0,waveform:'sine'},{ratio:2.01,level:.35,decay:.65,detune:0,waveform:'sine'},{ratio:3.98,level:.15,decay:.22,detune:0,waveform:'sine'},{ratio:6.1,level:.06,decay:.09,detune:0,waveform:'sine'}]},
  pluck:{attack:.002,release:.07,sustain:.08,cutoff:6500,resonance:.7,room:0,partials:[{ratio:1,level:.8,decay:.42,detune:0,waveform:'triangle'},{ratio:2,level:.2,decay:.16,detune:0,waveform:'sine'},{ratio:3,level:.13,decay:.06,detune:0,waveform:'sine'}]},
  'analog pulse':{attack:.006,release:.09,sustain:.58,cutoff:2400,resonance:1.5,room:0,partials:[{ratio:1,level:.55,decay:0,detune:-2,waveform:'square'},{ratio:1,level:.25,decay:0,detune:2,waveform:'sawtooth'}]},
  'air flute':{attack:.045,release:.16,sustain:.72,cutoff:5100,resonance:.5,room:1,partials:[{ratio:1,level:.85,decay:0,detune:0,waveform:'sine'},{ratio:2,level:.12,decay:0,detune:0,waveform:'sine'},{ratio:3,level:.035,decay:0,detune:0,waveform:'sine'}]},
};
export const isCharacterVoice=(voice:string):voice is CharacterVoice=>Object.hasOwn(INSTRUMENT_CHARACTERS,voice);
/** Separate note hold from attack/decay so short notes never schedule an envelope backwards. */
export function instrumentEnvelope(character:InstrumentCharacter,duration:number,velocity:number){
  const hold=Math.max(.02,duration),attack=Math.min(character.attack,hold*.65);
  const peak=Math.max(0,Math.min(1,velocity));
  return {attack,hold,end:hold+character.release,peak,sustain:peak*character.sustain};
}
