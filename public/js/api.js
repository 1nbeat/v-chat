let serverConfigPromise;

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function encryptModelConfig(modelConfig, publicKeyJwk) {
  const config = {};
  for (const key of ['apiUrl', 'apiKey', 'model']) {
    if (typeof modelConfig[key] === 'string' && modelConfig[key].trim()) config[key] = modelConfig[key].trim();
  }
  if (!Object.keys(config).length) return '';
  if (!globalThis.crypto?.subtle) throw new Error('当前浏览器不支持安全加密，请使用 HTTPS 访问');
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    publicKeyJwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
  const sessionKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(config));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sessionKey, plaintext);
  const rawSessionKey = await crypto.subtle.exportKey('raw', sessionKey);
  const wrappedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, rawSessionKey);
  return JSON.stringify({
    version: 1,
    wrappedKey: bytesToBase64(new Uint8Array(wrappedKey)),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  });
}

/** 请求本地 API 代理，并提取 Chat Completions 响应文本。 */
export async function requestChat(messages, signal, modelConfig = {}) {
  const body = { messages };
  const config = await requestServerConfig();
  const encryptedConfig = await encryptModelConfig(modelConfig, config.encryptionPublicKey);
  if (encryptedConfig) body.encryptedConfig = encryptedConfig;
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败');
  return data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '我暂时没有生成有效回复。';
}

/** 读取服务端公开的默认模型名称，不返回 API Key 等敏感配置。 */
export async function requestServerConfig() {
  if (!serverConfigPromise) {
    serverConfigPromise = fetch('/api/config', { headers: { Accept: 'application/json' } })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '读取服务配置失败');
        if (!data.encryptionPublicKey || data.encryptionPublicKey.kty !== 'RSA') throw new Error('服务端未提供加密公钥');
        return {
          model: typeof data.model === 'string' ? data.model.trim() : '',
          encryptionPublicKey: data.encryptionPublicKey
        };
      })
      .catch(error => {
        serverConfigPromise = undefined;
        throw error;
      });
  }
  return serverConfigPromise;
}
