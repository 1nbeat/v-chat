import { DEFAULT_GLOBAL_PROMPT } from '../config.js';
import {
  activeBotStorageKey,
  botStorageKey,
  defaultDuoIntervalSeconds,
  defaultDuoMaxTurns,
  defaultDuoTotalTurns,
  duoIntervalStorageKey,
  duoMaxTurnsStorageKey,
  duoTotalTurnsStorageKey,
  duoStorageKey,
  activeModelProfileStorageKey,
  modelConfigStorageKey,
  modelProfilesStorageKey,
  legacyConversationKey,
  legacyPromptKey,
  globalPromptStorageKey,
  renderMarkdownStorageKey,
  userProfileStorageKey,
  personalities
} from './constants.js';

/** 创建本地实体使用的唯一 ID。 */
export function createId(prefix = 'bot') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 从本地存储读取并限制一个数字设置。 */
export function loadNumberSetting(key, fallback, min, max, integer) {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  const normalized = integer ? Math.round(value) : value;
  return Math.min(max, Math.max(min, normalized));
}

/** 从本地存储读取布尔类型设置，并在无效时返回默认值。 */
export function loadBooleanSetting(key, fallback) {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

/** 创建默认聊天机器人，并兼容旧版本的提示词设置。 */
export function createDefaultBot() {
  return { id: createId(), name: '唯心 VChat', signature: '你的灵感伙伴', avatar: '', usePreset: true, personality: 'companion', notes: localStorage.getItem(legacyPromptKey) || '' };
}

/** 从本地存储读取用户昵称和头像，并过滤无效数据。 */
export function loadUserProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(userProfileStorageKey) || '{}');
    return { nickname: typeof saved.nickname === 'string' && saved.nickname.trim() ? saved.nickname.trim() : '访客用户', avatar: typeof saved.avatar === 'string' && saved.avatar.startsWith('data:image/') ? saved.avatar : '' };
  } catch {
    return { nickname: '访客用户', avatar: '' };
  }
}

/** 从本地存储读取并校验聊天机器人列表。 */
export function loadBots() {
  try {
    const saved = JSON.parse(localStorage.getItem(botStorageKey) || '[]');
    if (Array.isArray(saved) && saved.length) {
      const validBots = saved.filter(bot => typeof bot?.id === 'string' && typeof bot.name === 'string' && personalities[bot.personality]);
      if (validBots.length) return validBots.map(bot => ({ ...bot, signature: typeof bot.signature === 'string' ? bot.signature : '', avatar: typeof bot.avatar === 'string' && bot.avatar.startsWith('data:image/') ? bot.avatar : '', usePreset: bot.usePreset !== false }));
    }
  } catch {}
  const initial = createDefaultBot();
  localStorage.setItem(botStorageKey, JSON.stringify([initial]));
  return [initial];
}

/** 保存聊天机器人列表。 */
export function saveBots(state) {
  localStorage.setItem(botStorageKey, JSON.stringify(state.bots));
}

/** 从本地存储读取双机器人会话。 */
export function loadDuoSessions() {
  try {
    const saved = JSON.parse(localStorage.getItem(duoStorageKey) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter(session => typeof session?.id === 'string' && Array.isArray(session.transcript) && typeof session.firstId === 'string' && typeof session.secondId === 'string');
  } catch {
    return [];
  }
}

/** 保存最近的双机器人会话，最多保留十条。 */
export function saveDuoSessions(state) {
  state.duoSessions = state.duoSessions.slice(0, 10);
  localStorage.setItem(duoStorageKey, JSON.stringify(state.duoSessions));
}

/** 从本地存储读取旧版单份模型配置。 */
function loadLegacyModelConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(modelConfigStorageKey) || '{}');
    return {
      apiUrl: typeof saved.apiUrl === 'string' ? saved.apiUrl.trim() : '',
      apiKey: typeof saved.apiKey === 'string' ? saved.apiKey.trim() : '',
      model: typeof saved.model === 'string' ? saved.model.trim() : ''
    };
  } catch {
    return { apiUrl: '', apiKey: '', model: '' };
  }
}

/** 从本地存储读取并校验用户自定义模型列表。 */
export function loadModelProfiles() {
  try {
    const saved = JSON.parse(localStorage.getItem(modelProfilesStorageKey) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter(profile => typeof profile?.id === 'string' && typeof profile.name === 'string' && profile.name.trim()).map(profile => ({
      id: profile.id,
      name: profile.name.trim(),
      apiUrl: typeof profile.apiUrl === 'string' ? profile.apiUrl.trim() : '',
      apiKey: typeof profile.apiKey === 'string' ? profile.apiKey.trim() : '',
      model: typeof profile.model === 'string' ? profile.model.trim() : ''
    }));
  } catch {
    return [];
  }
}

/** 读取模型配置列表，并把旧版单份配置迁移为一个可管理的模型。 */
export function loadModelState() {
  let profiles = loadModelProfiles();
  const legacy = loadLegacyModelConfig();
  if (!profiles.length && Object.values(legacy).some(Boolean)) {
    const migrated = { id: createId('model'), name: legacy.model || '自定义模型', ...legacy };
    profiles = [migrated];
    localStorage.setItem(modelProfilesStorageKey, JSON.stringify(profiles));
    localStorage.setItem(activeModelProfileStorageKey, migrated.id);
  }
  localStorage.removeItem(modelConfigStorageKey);
  let activeId = localStorage.getItem(activeModelProfileStorageKey) || '';
  if (!profiles.some(profile => profile.id === activeId)) activeId = '';
  return { profiles, activeId };
}

/** 保存模型列表和当前激活项。空列表会删除相关存储键。 */
export function saveModelProfiles(state) {
  if (state.modelProfiles.length) localStorage.setItem(modelProfilesStorageKey, JSON.stringify(state.modelProfiles));
  else localStorage.removeItem(modelProfilesStorageKey);
  if (state.activeModelProfileId) localStorage.setItem(activeModelProfileStorageKey, state.activeModelProfileId);
  else localStorage.removeItem(activeModelProfileStorageKey);
}

/** 返回当前激活的用户模型配置；无激活项时返回空配置，交由服务端使用 .env 默认值。 */
export function currentModelConfig(state) {
  const profile = state.modelProfiles.find(item => item.id === state.activeModelProfileId);
  return profile ? { apiUrl: profile.apiUrl, apiKey: profile.apiKey, model: profile.model } : { apiUrl: '', apiKey: '', model: '' };
}

/** 返回当前激活的用户模型配置实体。 */
export function currentModelProfile(state) {
  return state.modelProfiles.find(item => item.id === state.activeModelProfileId);
}

/** 返回指定机器人的聊天记录存储键。 */
export function conversationKey(botId) {
  return `vchat-conversation-${botId}`;
}

/** 读取指定机器人的聊天记录，并过滤无效消息。 */
export function loadConversation(botId, firstBotId) {
  try {
    const raw = localStorage.getItem(conversationKey(botId)) || (botId === firstBotId ? localStorage.getItem(legacyConversationKey) : '[]');
    const saved = JSON.parse(raw || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter(message => ['user', 'assistant'].includes(message?.role) && typeof message.content === 'string');
  } catch {
    return [];
  }
}

/** 创建应用初始状态，并恢复上次使用的机器人和设置。 */
export function createState() {
  const bots = loadBots();
  const modelState = loadModelState();
  let activeBotId = localStorage.getItem(activeBotStorageKey) || bots[0].id;
  if (!bots.some(bot => bot.id === activeBotId)) activeBotId = bots[0].id;
  return {
    bots,
    activeBotId,
    activeDuoId: undefined,
    conversation: loadConversation(activeBotId, bots[0].id),
    editingBotId: bots[0].id,
    globalPrompt: localStorage.getItem(globalPromptStorageKey) ?? DEFAULT_GLOBAL_PROMPT,
    renderMarkdown: loadBooleanSetting(renderMarkdownStorageKey, true),
    userProfile: loadUserProfile(),
    maxDuoTurns: loadNumberSetting(duoMaxTurnsStorageKey, defaultDuoMaxTurns, 1, 100, true),
    maxDuoTotalTurns: loadNumberSetting(duoTotalTurnsStorageKey, defaultDuoTotalTurns, 1, 100, true),
    duoIntervalSeconds: loadNumberSetting(duoIntervalStorageKey, defaultDuoIntervalSeconds, 0, 60, false),
    modelProfiles: modelState.profiles,
    activeModelProfileId: modelState.activeId,
    editingModelProfileId: null,
    duoSessions: loadDuoSessions(),
    toastTimer: undefined,
    duoRunning: false,
    duoAbortController: undefined,
    duoDelayTimer: undefined,
    duoDelayResolve: undefined,
    confirmResolve: undefined,
    shouldAutoScroll: true,
    lastMessageScrollTop: 0
  };
}

/** 返回当前激活的聊天机器人。 */
export function currentBot(state) {
  return state.bots.find(bot => bot.id === state.activeBotId) || state.bots[0];
}

/** 保存当前机器人的聊天记录，并更新最近聊天时间。 */
export function saveConversation(state) {
  try {
    localStorage.setItem(conversationKey(state.activeBotId), JSON.stringify(state.conversation));
    const bot = currentBot(state);
    bot.lastChatAt = Date.now();
    saveBots(state);
    localStorage.removeItem(legacyConversationKey);
    return true;
  } catch {
    return false;
  }
}

/** 清空当前激活机器人的聊天记录。 */
export function clearConversation(state) {
  state.conversation = [];
  localStorage.removeItem(conversationKey(state.activeBotId));
}

/** 删除应用写入的全部本地数据，包括旧版本兼容存储。 */
export function clearAllAppData() {
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith('vchat-') || key === legacyPromptKey || key === legacyConversationKey) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
}
