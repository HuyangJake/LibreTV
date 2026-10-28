// Query only the instance-owned folder. Quark's GET /file ignores fids and lists root.
module.exports = async function findOwnedFiles(parent, ids, request) {
  const found = new Map();
  for (let page = 1; page <= 100; page++) {
    const result = await request('file/sort?pr=ucpro&fr=pc&pdir_fid=' + encodeURIComponent(parent) + '&_page=' + page + '&_size=200');
    if (result?.code !== 0 || !Array.isArray(result.data?.list))
      throw new Error('无法核对专用目录，请检查夸克授权后重试');
    for (const file of result.data.list)
      if (ids.includes(file.fid) && file.pdir_fid === parent) found.set(file.fid, file);
    if (ids.every((id) => found.has(id)) || result.data.list.length < 200) return found;
  }
  throw new Error('专用目录文件过多，请先分批手动清理');
};
