/** A plucked-string spectrum: strong fundamental, even/odd partials and pickup-position notches.
 * This is synthesis, not a recording of an electric bass.
 */
export function bassHarmonics() {
  const imaginary=new Float32Array(25);
  for(let harmonic=1;harmonic<imaginary.length;harmonic++) {
    imaginary[harmonic]=Math.sin(Math.PI*harmonic*.22)/Math.pow(harmonic,1.65);
  }
  // Measure one period, then calibrate RMS while retaining peak headroom.
  let squares=0,peak=0;
  for(let frame=0;frame<2048;frame++) {
    let sample=0;
    for(let h=1;h<imaginary.length;h++)sample+=imaginary[h]*Math.sin(2*Math.PI*h*frame/2048);
    squares+=sample*sample;peak=Math.max(peak,Math.abs(sample));
  }
  const scale=Math.min(.45/Math.sqrt(squares/2048),.9/peak);
  for(let h=1;h<imaginary.length;h++)imaginary[h]*=scale;
  return imaginary;
}
