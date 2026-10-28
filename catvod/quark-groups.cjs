module.exports = function groupQuarkFiles(prefix, files, render) {
  const groups = new Map();
  for (const file of files) {
    const path = Array.isArray(file.catvod_path) ? file.catvod_path : [];
    const key = JSON.stringify(path);
    if (!groups.has(key)) groups.set(key, { path, files: [] });
    groups.get(key).files.push(file);
  }
  return [...groups.values()].map(({ path, files }) => {
    // Keep protocol separators out of labels; original IDs and filenames stay unchanged.
    const label = path.map((part) => String(part).replace(/\$/g, '＄').replace(/#/g, '＃').replace(/[\r\n]/g, ' ')).join(' / ');
    return render(prefix + (label ? ' / ' + label : ''), files);
  });
};
