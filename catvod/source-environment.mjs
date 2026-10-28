// Forward only network settings to the reviewed bundle, never app credentials.
export function sourceEnvironment(dataRoot, env = process.env) {
  const output = { PATH: env.PATH, NODE_ENV: 'production', NODE_PATH: dataRoot, DEV_HTTP_PORT: '9988' };
  for (const key of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy'])
    if (env[key]) output[key] = env[key];
  if ((env.NODE_OPTIONS || '').split(/\s+/).includes('--use-env-proxy')) output.NODE_OPTIONS = '--use-env-proxy';
  return output;
}
