/** XPTV JS sources are identified by the script URL, including mirror URLs. */
export function isSpiderSource(source: { url: string }): boolean {
  return /\.js(?:[?#].*)?$/i.test(source.url);
}
