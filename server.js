import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { constants as cryptoConstants, createDecipheriv, generateKeyPairSync, privateDecrypt } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
function loadEnv() {
  try {
    const text = readFileSync(join(root, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {}
}
loadEnv();
const port = Number(process.env.PORT || 3000);
const apiUrl = process.env.AI_API_URL || 'https://tokenhub.tencentmaas.com/v1/chat/completions';
const apiKey = process.env.AI_API_KEY;
const model = process.env.AI_MODEL || 'hunyuan-role-latest';
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicExponent: 0x10001,
});
const publicKeyJwk = publicKey.export({ format: 'jwk' });

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 2_000_000) reject(new Error('请求内容过大')); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('请求格式无效')); } });
    req.on('error', reject);
  });
}

function decryptModelConfig(encryptedConfig) {
  if (typeof encryptedConfig !== 'string' || !encryptedConfig.trim()) return {};
  const envelope = JSON.parse(encryptedConfig);
  if (envelope?.version !== 1 || typeof envelope.wrappedKey !== 'string' || typeof envelope.iv !== 'string' || typeof envelope.ciphertext !== 'string') throw new Error('模型配置格式无效');
  const wrappedKey = Buffer.from(envelope.wrappedKey, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  if (wrappedKey.length !== 256 || iv.length !== 12 || ciphertext.length < 17) throw new Error('模型配置格式无效');
  const sessionKey = privateDecrypt({
    key: privateKey,
    padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256'
  }, wrappedKey);
  if (sessionKey.length !== 32) throw new Error('模型配置格式无效');
  const authTag = ciphertext.subarray(-16);
  const decipher = createDecipheriv('aes-256-gcm', sessionKey, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]).toString('utf8');
  const config = JSON.parse(plaintext);
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('模型配置格式无效');
  for (const key of ['apiUrl', 'apiKey', 'model']) {
    if (config[key] !== undefined && typeof config[key] !== 'string') throw new Error('模型配置格式无效');
  }
  return config;
}

async function handleChat(req, res) {
  try {
    const body = await parseBody(req);
    if (!Array.isArray(body.messages) || body.messages.length === 0) return json(res, 400, { error: 'messages 不能为空' });
    if (Object.hasOwn(body, 'apiUrl') || Object.hasOwn(body, 'apiKey') || Object.hasOwn(body, 'model')) return json(res, 400, { error: '模型配置必须加密传输' });
    let modelConfig;
    try {
      modelConfig = decryptModelConfig(body.encryptedConfig);
    } catch {
      return json(res, 400, { error: '模型配置解密失败，请刷新页面后重试' });
    }
    const requestApiUrl = typeof modelConfig.apiUrl === 'string' && modelConfig.apiUrl.trim() ? modelConfig.apiUrl.trim() : apiUrl;
    const requestApiKey = typeof modelConfig.apiKey === 'string' && modelConfig.apiKey.trim() ? modelConfig.apiKey.trim() : apiKey;
    const requestModel = typeof modelConfig.model === 'string' && modelConfig.model.trim() ? modelConfig.model.trim() : model;
    let parsedApiUrl;
    try {
      parsedApiUrl = new URL(requestApiUrl);
      if (!['http:', 'https:'].includes(parsedApiUrl.protocol)) throw new Error('protocol');
    } catch {
      return json(res, 400, { error: 'API 地址必须是 http 或 https 地址' });
    }
    if (!requestApiKey) return json(res, 500, { error: '服务端尚未配置 AI_API_KEY，或请在模型服务设置中填写自己的 API Key。' });
    const upstream = await fetch(parsedApiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${requestApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: requestModel, messages: body.messages, stream: false })
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(text);
  } catch (error) {
    const detail = error.cause?.code || error.cause?.message;
    const message = error.message === 'fetch failed'
      ? '无法连接 AI 服务（请检查 API 地址和当前网络）'
      : error.message || 'AI 服务暂时不可用';
    json(res, 502, { error: detail ? `${message}：${detail}` : message });
  }
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
async function serve(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'POST' && url.pathname === '/api/chat') return handleChat(req, res);
  if (req.method === 'GET' && url.pathname === '/api/config') return json(res, 200, { model, encryptionPublicKey: publicKeyJwk });
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  let path = normalize(url.pathname === '/' ? '/index.html' : url.pathname);
  if (path.includes('..')) return json(res, 403, { error: 'Forbidden' });
  try {
    const file = await readFile(join(root, 'public', path));
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    res.end(file);
  } catch { json(res, 404, { error: 'Not found' }); }
}

http.createServer(serve).listen(port, () => console.log(`AI chat running at http://localhost:${port}`));
