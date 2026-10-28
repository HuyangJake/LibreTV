// Track IDs can outlive both share and per-file transfer tokens. Re-enumerate
// the public share before resolving playback, matching the immutable file ID.
module.exports = async function refreshQuarkTrack(params, detail) {
  const fields = typeof params.id === 'string' ? params.id.split('*') : [];
  const [share, , fid] = fields;
  if (fields.length < 4 || !/^[a-zA-Z0-9]{1,64}$/.test(share) || !/^[a-zA-Z0-9_-]{1,128}$/.test(fid))
    throw new Error('夸克文件信息无效，请重新打开影片');
  const result = await detail('https://pan.quark.cn/s/' + share);
  const groups = String(result?.list?.[0]?.vod_play_url || '').split('$$$');
  for (const group of groups) for (const episode of group.split('#')) {
    const separator = episode.indexOf('$');
    if (separator < 0) continue;
    const id = episode.slice(separator + 1);
    const candidate = id.split('*');
    if (candidate.length >= 4 && candidate[0] === share && candidate[2] === fid)
      return { ...params, id };
  }
  throw new Error('分享视频已失效、受限或被移除，请重新打开影片或切换资源');
};
