module.exports = async function refreshExpiredShareToken(route, body, next, request) {
  const result = await next();
  const operation = route.split('?')[0];
  if (result?.code !== 41016 || !request ||
      !['share/sharepage/detail', 'share/sharepage/save'].includes(operation)) return result;
  const url = new URL('https://quark.invalid/' + route);
  const shareId = operation === 'share/sharepage/save' ? body?.pwd_id : url.searchParams.get('pwd_id');
  if (typeof shareId !== 'string' || !shareId) return result;
  const token = await request('share/sharepage/token?pr=ucpro&fr=pc', {
    pwd_id: shareId, passcode: '',
  }, 'post');
  if (token?.code !== 0 || typeof token?.data?.stoken !== 'string' || !token.data.stoken) return token;
  // Only an explicit expired-token rejection may be retried. Keep the original
  // target and file tokens; the caller has already checked transfer ownership.
  if (operation === 'share/sharepage/save')
    return request(route, { ...body, stoken: token.data.stoken }, 'post');
  url.searchParams.set('stoken', token.data.stoken);
  return request(url.pathname.slice(1) + url.search, body, 'get');
};
