/** Prefix grammar for the six mood labels. The LLM still chooses the label by
 * probability; the grammar prevents prose, translation, and prompt echoes. */
export function nextLabelTokens(sequences: readonly (readonly number[])[], generated: readonly number[], eos: number): Set<number> {
  const allowed=new Set<number>();
  for(const sequence of sequences){
    if(generated.every((token,index)=>sequence[index]===token)) allowed.add(sequence[generated.length]??eos);
  }
  return allowed.size?allowed:new Set([eos]);
}
