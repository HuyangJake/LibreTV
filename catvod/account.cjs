const { createHash } = require('node:crypto');
// __puus is rotated by Quark; ownership must survive credential refreshes.
module.exports = function accountFingerprint(cookie) {
  const uid = /(?:^|;\s*)__uid=([^;]+)/.exec(cookie)?.[1];
  return createHash('sha256')
    .update(uid ? 'quark-uid:' + uid : cookie)
    .digest('hex');
};
