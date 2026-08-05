import { renderMarkdown } from './text.js';

/** 集中查询页面中的交互节点，避免业务模块重复访问 DOM。 */
export const dom = {
  messages: document.querySelector('#messages'),
  input: document.querySelector('#input'),
  composer: document.querySelector('#composer'),
  send: document.querySelector('#send'),
  newChat: document.querySelector('#newChat'),
  clearChat: document.querySelector('#clearChat'),
  userAvatar: document.querySelector('#userAvatar'),
  userNickname: document.querySelector('#userNickname'),
  modelLabel: document.querySelector('#modelLabel'),
  chatContactAvatarInfo: document.querySelector('#chatContactAvatarInfo'),
  chatContactAvatar: document.querySelector('.chat-contact-avatar'),
  chatTitle: document.querySelector('#chatTitle'),
  chatSignature: document.querySelector('#chatSignature'),
  chatPersonaTooltip: document.querySelector('#chatPersonaTooltip'),
  continueDuo: document.querySelector('#continueDuo'),
  stopDuo: document.querySelector('#stopDuo'),
  duoRemaining: document.querySelector('#duoRemaining'),
  settings: document.querySelector('#settings'),
  mobileSettings: document.querySelector('#mobileSettings'),
  settingsMenu: document.querySelector('#settingsMenu'),
  modelSettings: document.querySelector('#modelSettings'),
  closeModelSettings: document.querySelector('#closeModelSettings'),
  modelList: document.querySelector('#modelList'),
  addModel: document.querySelector('#addModel'),
  useDefaultModel: document.querySelector('#useDefaultModel'),
  modelForm: document.querySelector('#modelForm'),
  modelProfileName: document.querySelector('#modelProfileName'),
  modelApiUrl: document.querySelector('#modelApiUrl'),
  modelApiKey: document.querySelector('#modelApiKey'),
  modelName: document.querySelector('#modelName'),
  modelEditorHint: document.querySelector('#modelEditorHint'),
  deleteModel: document.querySelector('#deleteModel'),
  recentBots: document.querySelector('#recentBots'),
  recentDuoChats: document.querySelector('#recentDuoChats'),
  botManager: document.querySelector('#botManager'),
  closeBotManager: document.querySelector('#closeBotManager'),
  botList: document.querySelector('#botList'),
  addBot: document.querySelector('#addBot'),
  botForm: document.querySelector('#botForm'),
  botName: document.querySelector('#botName'),
  botSignature: document.querySelector('#botSignature'),
  botAvatarPreview: document.querySelector('#botAvatarPreview'),
  botAvatarInput: document.querySelector('#botAvatarInput'),
  removeBotAvatar: document.querySelector('#removeBotAvatar'),
  usePersonalityPreset: document.querySelector('#usePersonalityPreset'),
  presetFields: document.querySelector('#presetFields'),
  personalityPreset: document.querySelector('#personalityPreset'),
  generatedPrompt: document.querySelector('#generatedPrompt'),
  botNotes: document.querySelector('#botNotes'),
  botPromptLabel: document.querySelector('#botPromptLabel'),
  deleteBot: document.querySelector('#deleteBot'),
  botPicker: document.querySelector('#botPicker'),
  closeBotPicker: document.querySelector('#closeBotPicker'),
  botPickerList: document.querySelector('#botPickerList'),
  openDuoFromPicker: document.querySelector('#openDuoFromPicker'),
  globalSettings: document.querySelector('#globalSettings'),
  closeGlobalSettings: document.querySelector('#closeGlobalSettings'),
  profileSettings: document.querySelector('#profileSettings'),
  closeProfileSettings: document.querySelector('#closeProfileSettings'),
  profileAvatarPreview: document.querySelector('#profileAvatarPreview'),
  profileAvatarInput: document.querySelector('#profileAvatarInput'),
  removeProfileAvatar: document.querySelector('#removeProfileAvatar'),
  profileNickname: document.querySelector('#profileNickname'),
  saveProfile: document.querySelector('#saveProfile'),
  globalPromptEditor: document.querySelector('#globalPrompt'),
  renderMarkdown: document.querySelector('#renderMarkdown'),
  duoMaxTurnsInput: document.querySelector('#duoMaxTurns'),
  duoTotalTurnsInput: document.querySelector('#duoTotalTurns'),
  duoIntervalSecondsInput: document.querySelector('#duoIntervalSeconds'),
  saveGlobalPrompt: document.querySelector('#saveGlobalPrompt'),
  duoDialog: document.querySelector('#duoDialog'),
  closeDuoDialog: document.querySelector('#closeDuoDialog'),
  cancelDuo: document.querySelector('#cancelDuo'),
  duoForm: document.querySelector('#duoForm'),
  duoFirstBot: document.querySelector('#duoFirstBot'),
  duoSecondBot: document.querySelector('#duoSecondBot'),
  duoTopic: document.querySelector('#duoTopic'),
  duoHint: document.querySelector('#duoHint'),
  startDuo: document.querySelector('#startDuo'),
  continueDuoDialog: document.querySelector('#continueDuoDialog'),
  closeContinueDuoDialog: document.querySelector('#closeContinueDuoDialog'),
  cancelContinueDuo: document.querySelector('#cancelContinueDuo'),
  continueDuoForm: document.querySelector('#continueDuoForm'),
  continueDuoTurns: document.querySelector('#continueDuoTurns'),
  continueDuoHint: document.querySelector('#continueDuoHint'),
  confirmDialog: document.querySelector('#confirmDialog'),
  closeConfirmDialog: document.querySelector('#closeConfirmDialog'),
  confirmTitle: document.querySelector('#confirmTitle'),
  confirmMessage: document.querySelector('#confirmMessage'),
  cancelConfirm: document.querySelector('#cancelConfirm'),
  acceptConfirm: document.querySelector('#acceptConfirm'),
  toast: document.querySelector('#toast')
};

/** 显示一个短暂的底部提示，并自动清理旧计时器。 */
export function showToast(state, message) {
  clearTimeout(state.toastTimer);
  dom.toast.textContent = message;
  dom.toast.classList.add('show');
  state.toastTimer = setTimeout(() => dom.toast.classList.remove('show'), 2600);
}

/** 打开指定弹窗并锁定页面滚动。 */
export function showDialog(dialog) {
  dialog.hidden = false;
  document.body.classList.add('dialog-open');
}

/** 关闭指定弹窗，并在没有其他弹窗时恢复页面滚动。 */
export function hideDialog(dialog) {
  dialog.hidden = true;
  if (dom.botManager.hidden && dom.botPicker.hidden && dom.globalSettings.hidden && dom.modelSettings.hidden && dom.profileSettings.hidden && dom.duoDialog.hidden && dom.continueDuoDialog.hidden && dom.confirmDialog.hidden) document.body.classList.remove('dialog-open');
}

/** 显示站内确认弹窗，并在用户选择后返回确认结果。 */
export function requestConfirmation(state, { title, message, confirmLabel = '确认' }) {
  dom.confirmTitle.textContent = title;
  dom.confirmMessage.textContent = message;
  dom.acceptConfirm.textContent = confirmLabel;
  showDialog(dom.confirmDialog);
  dom.acceptConfirm.focus();
  return new Promise(resolve => {
    state.confirmResolve = resolve;
  });
}

/** 关闭确认弹窗并把用户选择返回给请求方。 */
export function resolveConfirmation(state, accepted) {
  if (dom.confirmDialog.hidden) return;
  hideDialog(dom.confirmDialog);
  state.confirmResolve?.(accepted);
  state.confirmResolve = undefined;
}

/** 隐藏顶部设置菜单。 */
export function hideSettingsMenu() {
  dom.settingsMenu.hidden = true;
}

/** 根据触发按钮的位置切换顶部设置菜单。 */
export function toggleSettingsMenu(trigger) {
  if (!dom.settingsMenu.hidden) {
    hideSettingsMenu();
    return;
  }
  const bounds = trigger.getBoundingClientRect();
  dom.settingsMenu.hidden = false;
  dom.settingsMenu.style.right = `${Math.max(12, window.innerWidth - bounds.right)}px`;
  if (trigger === dom.mobileSettings) {
    dom.settingsMenu.style.top = `${bounds.bottom + 8}px`;
    dom.settingsMenu.style.bottom = 'auto';
    dom.settingsMenu.style.left = 'auto';
  } else {
    dom.settingsMenu.style.top = `${bounds.bottom + 8}px`;
    dom.settingsMenu.style.bottom = 'auto';
    dom.settingsMenu.style.left = `${bounds.left}px`;
    dom.settingsMenu.style.right = 'auto';
  }
}

/** 按用户滚动状态决定是否把消息区域滚动到底部。 */
export function scrollMessagesIfNeeded(state) {
  if (!state.shouldAutoScroll) return;
  dom.messages.scrollTop = dom.messages.scrollHeight;
  state.lastMessageScrollTop = dom.messages.scrollTop;
}

/** 重置消息区域的滚动位置。 */
export function resetMessageScroll(state) {
  state.shouldAutoScroll = true;
  dom.messages.scrollTop = 0;
  state.lastMessageScrollTop = 0;
}

/** 向消息区域追加普通聊天消息。 */
export function addMessage(state, role, content) {
  const row = document.createElement('div');
  row.className = `message ${role}`;
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  if (role === 'user') renderAvatar(avatar, state.userProfile);
  else renderBotAvatar(avatar, state.bots.find(bot => bot.id === state.activeBotId));
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.dataset.rawContent = content;
  renderMessageContent(bubble, content, role === 'assistant' && state.renderMarkdown);
  row.append(avatar, bubble);
  dom.messages.append(row);
  scrollMessagesIfNeeded(state);
  return row;
}

/** 向消息区域追加带有发言人信息的双聊消息。 */
export function addDuoMessage(state, bot, content, side) {
  const row = document.createElement('div');
  row.className = `message assistant duo-message duo-${side}`;
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  renderBotAvatar(avatar, bot);
  const contentWrap = document.createElement('div');
  contentWrap.className = 'duo-content';
  const speaker = document.createElement('span');
  speaker.className = 'duo-speaker';
  speaker.textContent = bot.name;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const body = document.createElement('div');
  body.className = 'duo-body';
  body.dataset.rawContent = content;
  renderMessageContent(body, content, Boolean(content) && state.renderMarkdown);
  bubble.append(body);
  contentWrap.append(speaker, bubble);
  row.append(avatar, contentWrap);
  dom.messages.append(row);
  scrollMessagesIfNeeded(state);
  return row;
}

/** 更新顶部的双聊剩余轮次提示。 */
export function setDuoRemaining(remaining) {
  dom.duoRemaining.textContent = `剩余 ${remaining} 轮`;
}

/** 根据开关将消息内容渲染为 Markdown 或普通纯文本。 */
export function renderMessageContent(element, content, renderMarkdownEnabled) {
  element.classList.toggle('markdown', Boolean(renderMarkdownEnabled && content));
  if (renderMarkdownEnabled && content) element.innerHTML = renderMarkdown(content);
  else element.textContent = content;
}

/** 按当前设置重新渲染页面中已经存在的 AI 消息。 */
export function rerenderAssistantMessages(state) {
  for (const element of dom.messages.querySelectorAll('.message.assistant:not(.duo-message) .bubble, .message.assistant .duo-body')) {
    if (element.querySelector('.typing')) continue;
    renderMessageContent(element, element.dataset.rawContent || '', state.renderMarkdown);
  }
}

/** 更新聊天顶部的对方名称、签名和单聊机器人头像。 */
export function setChatContact(name, signature = '', avatar = '', isBot = false, personality = '') {
  dom.chatTitle.textContent = name;
  dom.chatSignature.textContent = signature || ' ';
  dom.chatSignature.hidden = !signature;
  dom.chatPersonaTooltip.textContent = personality;
  dom.chatContactAvatarInfo.classList.toggle('has-persona', Boolean(personality));
  if (personality) {
    dom.chatContactAvatarInfo.tabIndex = 0;
    dom.chatContactAvatarInfo.setAttribute('aria-describedby', 'chatPersonaTooltip');
  } else {
    dom.chatContactAvatarInfo.tabIndex = -1;
    dom.chatContactAvatarInfo.removeAttribute('aria-describedby');
  }
  dom.chatContactAvatar.replaceChildren();
  if (isBot) renderBotAvatar(dom.chatContactAvatar, { name, avatar });
  else dom.chatContactAvatar.textContent = '✦';
}

/** 在指定节点展示机器人头像或名称首字的默认头像。 */
export function renderBotAvatar(element, bot) {
  element.replaceChildren();
  const name = bot?.name || 'AI';
  if (bot?.avatar) {
    const image = document.createElement('img');
    image.src = bot.avatar;
    image.alt = `${name}的头像`;
    element.append(image);
    return;
  }
  element.textContent = Array.from(name)[0]?.toUpperCase() || 'A';
}

/** 在指定节点展示上传头像或昵称首字母的默认头像。 */
export function renderAvatar(element, profile) {
  element.replaceChildren();
  if (profile.avatar) {
    const image = document.createElement('img');
    image.src = profile.avatar;
    image.alt = `${profile.nickname}的头像`;
    element.append(image);
    return;
  }
  element.textContent = profile.nickname.slice(0, 1).toUpperCase() || 'Q';
}

/** 更新左侧个人资料区域。 */
export function renderUserProfile(profile) {
  dom.userNickname.textContent = profile.nickname;
  renderAvatar(dom.userAvatar, profile);
}

/** 刷新当前聊天区域中所有用户消息的头像。 */
export function renderUserMessageAvatars(profile) {
  for (const avatar of document.querySelectorAll('.message.user .message-avatar')) renderAvatar(avatar, profile);
}

/** 刷新当前单聊区域中所有机器人回复的头像。 */
export function renderBotMessageAvatars(bot) {
  for (const avatar of document.querySelectorAll('.message.assistant:not(.duo-message) .message-avatar')) renderBotAvatar(avatar, bot);
}
