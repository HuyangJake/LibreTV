/** HLS URI attributes also occur on alternate audio, subtitles and session keys. */
export function rewriteCatvodPlaylist(text:string,base:string,register:(url:string)=>string):string{
 return text.split('\n').map(line=>{
  const value=line.trim();if(!value)return line;
  if(value.startsWith('#'))return line.replace(/URI="([^"]+)"/g,(_all,uri:string)=>`URI="${register(new URL(uri,base).href)}"`);
  return register(new URL(value,base).href);
 }).join('\n');
}
