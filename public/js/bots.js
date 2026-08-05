import { dom, hideDialog, renderBotAvatar, renderBotMessageAvatars, rerenderAssistantMessages, setChatContact, showDialog, showToast } from './dom.js';
import { personalities, activeBotStorageKey, duoIntervalStorageKey, duoMaxTurnsStorageKey, duoTotalTurnsStorageKey, globalPromptStorageKey, legacyConversationKey, renderMarkdownStorageKey } from './constants.js';
import { conversationKey, createId, currentBot, loadConversation, saveBots } from './state.js';
import { personalityTooltip, promptFor } from './prompts.js';

/** 创建机器人、历史记录和全局设置控制器。 */
export function createBotsController({ state, clearConversation, restoreConversation, saveDuoSessions, requestConfirmation }) {
  let draftAvatar = '';

  /** 判断给定机器人是否拥有可恢复的聊天记录。 */
  function hasConversation(bot) {
    if (bot.id === state.activeBotId) return state.conversation.length > 0;
    return loadConversation(bot.id, state.bots[0].id).length > 0;
  }

  /** 渲染单聊或机器人对聊分区中的会话按钮。 */
  function renderHistoryItems(container, chats, emptyMessage) {
    container.innerHTML = '';
    if (!chats.length) {
      container.innerHTML = `<div class="history-empty">${emptyMessage}</div>`;
      return;
    }
    for (const chat of chats) {
      const item = document.createElement('button');
      item.type = 'button';
      const active = (chat.type === 'bot' && chat.id === state.activeBotId && !state.activeDuoId) || (chat.type === 'duo' && chat.id === state.activeDuoId);
      item.className = `history-item${active ? ' active' : ''}`;
      if (chat.type === 'bot') item.dataset.botId = chat.id;
      else item.dataset.duoId = chat.id;
      const dot = document.createElement('span');
      if (chat.type === 'duo') {
        dot.className = 'history-duo-dot';
        dot.textContent = '↔';
      } else {
        dot.className = 'history-avatar';
        renderBotAvatar(dot, chat.bot);
      }
      const name = document.createElement('span');
      name.className = 'history-text';
      name.textContent = chat.label;
      item.append(dot, name);
      container.append(item);
    }
  }

  /** 将最近单聊与机器人对聊按类型分区渲染。 */
  function renderHistory() {
    const singleChats = state.bots.filter(hasConversation)
      .map(bot => ({ type: 'bot', id: bot.id, bot, label: bot.name, updatedAt: bot.lastChatAt || 0 }))
      .sort((left, right) => right.updatedAt - left.updatedAt);
    const duoChats = state.duoSessions.filter(session => session.transcript.length).map(session => {
      const first = state.bots.find(bot => bot.id === session.firstId);
      const second = state.bots.find(bot => bot.id === session.secondId);
      return { type: 'duo', id: session.id, label: `${first?.name || '已删除机器人'} × ${second?.name || '已删除机器人'}`, updatedAt: session.updatedAt || 0 };
    }).sort((left, right) => right.updatedAt - left.updatedAt);
    renderHistoryItems(dom.recentBots, singleChats, '暂无单聊');
    renderHistoryItems(dom.recentDuoChats, duoChats, '暂无机器人对聊');
  }

  /** 填充人格预设的下拉选项。 */
  function fillPersonalityOptions() {
    dom.personalityPreset.innerHTML = Object.entries(personalities).map(([id, persona]) => `<option value="${id}">${persona.label} · ${persona.summary}</option>`).join('');
  }

  /** 读取机器人编辑表单中的草稿值。 */
  function draftBot() {
    return { name: dom.botName.value.trim(), signature: dom.botSignature.value.trim(), avatar: draftAvatar, usePreset: dom.usePersonalityPreset.checked, personality: dom.personalityPreset.value, notes: dom.botNotes.value.trim() };
  }

  /** 切换人格预设和手动提示词两种编辑模式。 */
  function updatePromptMode() {
    const usingPreset = dom.usePersonalityPreset.checked;
    dom.presetFields.hidden = !usingPreset;
    dom.botPromptLabel.textContent = usingPreset ? '补充设定（可选）' : '系统提示词';
    dom.botNotes.placeholder = usingPreset ? '例如：不要暴露任何模型相关信息' : '请输入这个机器人的系统提示词';
    updatePromptPreview();
  }

  /** 更新人格预设模式下的只读提示词预览。 */
  function updatePromptPreview() {
    const draft = draftBot();
    dom.generatedPrompt.value = promptFor(state.globalPrompt, { name: draft.name || '未命名机器人', usePreset: true, personality: draft.personality, notes: draft.notes });
    renderBotAvatar(dom.botAvatarPreview, { name: draft.name || '未命名机器人', avatar: draft.avatar });
  }

  /** 读取机器人头像文件，并更新编辑表单中的头像预览。 */
  function handleAvatarChange() {
    const [file] = dom.botAvatarInput.files;
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast(state, '请选择图片文件');
      dom.botAvatarInput.value = '';
      return;
    }
    if (file.size > 1_000_000) {
      showToast(state, '头像文件不能超过 1MB');
      dom.botAvatarInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      draftAvatar = typeof reader.result === 'string' ? reader.result : '';
      updatePromptPreview();
    });
    reader.addEventListener('error', () => showToast(state, '头像读取失败，请重新选择'));
    reader.readAsDataURL(file);
  }

  /** 移除机器人头像草稿并回退到名称首字头像。 */
  function removeAvatar() {
    draftAvatar = '';
    dom.botAvatarInput.value = '';
    updatePromptPreview();
  }

  /** 初始化新建机器人时的头像草稿。 */
  function resetAvatarDraft() {
    draftAvatar = '';
    dom.botAvatarInput.value = '';
    updatePromptPreview();
  }

  /** 渲染机器人管理弹窗左侧的机器人列表。 */
  function renderBotList() {
    dom.botList.innerHTML = '';
    for (const bot of state.bots) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `bot-list-item${bot.id === state.editingBotId ? ' selected' : ''}`;
      button.dataset.botId = bot.id;
      const name = document.createElement('strong');
      name.textContent = bot.name;
      const persona = document.createElement('span');
      persona.textContent = bot.usePreset === false ? '手动系统提示词' : personalities[bot.personality].label;
      button.append(name, persona);
      dom.botList.append(button);
    }
  }

  /** 将机器人数据加载到编辑表单。 */
  function editBot(id) {
    const bot = state.bots.find(item => item.id === id);
    if (!bot) return;
    state.editingBotId = id;
    dom.botName.value = bot.name;
    dom.botSignature.value = bot.signature || '';
    draftAvatar = bot.avatar || '';
    dom.botAvatarInput.value = '';
    dom.usePersonalityPreset.checked = bot.usePreset !== false;
    dom.personalityPreset.value = bot.personality;
    dom.botNotes.value = bot.notes || '';
    dom.deleteBot.disabled = state.bots.length === 1;
    updatePromptMode();
    renderBotList();
  }

  /** 打开机器人管理弹窗。 */
  function openBotManager() {
    editBot(state.editingBotId);
    showDialog(dom.botManager);
  }

  /** 渲染开启新对话时的机器人选择列表。 */
  function renderBotPicker() {
    dom.botPickerList.innerHTML = '';
    for (const bot of state.bots) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'picker-bot';
      button.dataset.botId = bot.id;
      const avatarInfo = document.createElement('div');
      avatarInfo.className = 'picker-bot-avatar-info';
      const tooltipId = `picker-persona-${bot.id}`;
      button.setAttribute('aria-describedby', tooltipId);
      const avatar = document.createElement('div');
      avatar.className = 'picker-bot-avatar';
      renderBotAvatar(avatar, bot);
      const tooltip = document.createElement('div');
      tooltip.id = tooltipId;
      tooltip.className = 'persona-tooltip';
      tooltip.setAttribute('role', 'tooltip');
      tooltip.textContent = personalityTooltip(bot);
      avatarInfo.append(avatar, tooltip);
      const details = document.createElement('div');
      details.className = 'picker-bot-details';
      const name = document.createElement('strong');
      name.textContent = bot.name;
      const signature = document.createElement('span');
      signature.textContent = bot.signature || '暂无签名';
      details.append(name, signature);
      button.append(avatarInfo, details);
      dom.botPickerList.append(button);
    }
  }

  /** 切换机器人并创建一段空白的新聊天。 */
  function startBotConversation(id) {
    state.activeBotId = id;
    state.activeDuoId = undefined;
    localStorage.setItem(activeBotStorageKey, id);
    clearConversation(state);
    renderHistory();
    restoreConversation();
    hideDialog(dom.botPicker);
    showToast(state, `已切换到 ${currentBot(state).name}`);
    dom.input.focus();
  }

  /** 切换机器人并恢复其已有聊天记录。 */
  function restoreBotConversation(id) {
    state.activeBotId = id;
    state.activeDuoId = undefined;
    localStorage.setItem(activeBotStorageKey, id);
    state.conversation = loadConversation(id, state.bots[0].id);
    renderHistory();
    restoreConversation();
    dom.input.focus();
  }

  /** 将当前所有全局设置回填进编辑弹窗。 */
  function openGlobalSettings() {
    dom.globalPromptEditor.value = state.globalPrompt;
    dom.renderMarkdown.checked = state.renderMarkdown;
    dom.duoMaxTurnsInput.value = state.maxDuoTurns;
    dom.duoTotalTurnsInput.value = state.maxDuoTotalTurns;
    dom.duoIntervalSecondsInput.value = state.duoIntervalSeconds;
    showDialog(dom.globalSettings);
    dom.globalPromptEditor.focus();
  }

  /** 保存机器人编辑表单，并新建或更新对应机器人。 */
  function saveBot() {
    const name = dom.botName.value.trim();
    if (!name) {
      dom.botName.focus();
      return;
    }
    const data = { name, signature: dom.botSignature.value.trim(), avatar: draftAvatar, usePreset: dom.usePersonalityPreset.checked, personality: dom.personalityPreset.value, notes: dom.botNotes.value.trim() };
    if (!data.usePreset && !data.notes) {
      dom.botNotes.focus();
      showToast(state, '请输入系统提示词');
      return;
    }
    if (state.editingBotId) state.bots = state.bots.map(bot => bot.id === state.editingBotId ? { ...bot, ...data } : bot);
    else {
      const bot = { id: createId(), ...data };
      state.bots.push(bot);
      state.editingBotId = bot.id;
    }
    saveBots(state);
    if (state.activeBotId === state.editingBotId && !state.activeDuoId) {
      setChatContact(data.name, data.signature, data.avatar, true, personalityTooltip(data));
      renderBotMessageAvatars({ name: data.name, avatar: data.avatar });
    }
    renderHistory();
    renderBotList();
    editBot(state.editingBotId);
    showToast(state, '机器人已保存');
  }

  /** 删除当前正在编辑的机器人及与其关联的本地记录。 */
  async function deleteCurrentBot() {
    if (!state.editingBotId || state.bots.length === 1) return;
    const confirmed = await requestConfirmation(state, { title: '删除机器人？', message: '将删除这个机器人及其本地对话记录，且无法撤销。', confirmLabel: '删除机器人' });
    if (!confirmed) return;
    const removedId = state.editingBotId;
    const removedWasFirstBot = state.bots[0].id === removedId;
    state.bots = state.bots.filter(bot => bot.id !== removedId);
    localStorage.removeItem(conversationKey(removedId));
    if (removedWasFirstBot) localStorage.removeItem(legacyConversationKey);
    state.duoSessions = state.duoSessions.filter(session => session.firstId !== removedId && session.secondId !== removedId);
    if (!state.duoSessions.some(session => session.id === state.activeDuoId)) state.activeDuoId = undefined;
    saveDuoSessions(state);
    if (state.activeBotId === removedId) {
      state.activeBotId = state.bots[0].id;
      localStorage.setItem(activeBotStorageKey, state.activeBotId);
      state.conversation = loadConversation(state.activeBotId, state.bots[0].id);
      restoreConversation();
    }
    state.editingBotId = state.bots[0].id;
    saveBots(state);
    renderHistory();
    editBot(state.editingBotId);
    showToast(state, '机器人已删除');
  }

  /** 校验并保存全局提示词与双聊参数。 */
  function saveGlobalSettings() {
    const nextMaxTurns = Number(dom.duoMaxTurnsInput.value);
    const nextTotalTurns = Number(dom.duoTotalTurnsInput.value);
    const nextInterval = Number(dom.duoIntervalSecondsInput.value);
    if (!Number.isInteger(nextMaxTurns) || nextMaxTurns < 1 || nextMaxTurns > 100) {
      dom.duoMaxTurnsInput.focus();
      showToast(state, '每次自动对话轮数需为 1 到 100 的整数');
      return;
    }
    if (!Number.isInteger(nextTotalTurns) || nextTotalTurns < 1 || nextTotalTurns > 100) {
      dom.duoTotalTurnsInput.focus();
      showToast(state, '单会话总轮次上限需为 1 到 100 的整数');
      return;
    }
    if (nextMaxTurns > nextTotalTurns) {
      dom.duoMaxTurnsInput.focus();
      showToast(state, '每次自动对话轮数不能超过总轮次上限');
      return;
    }
    if (!Number.isFinite(nextInterval) || nextInterval < 0 || nextInterval > 60) {
      dom.duoIntervalSecondsInput.focus();
      showToast(state, '响应间隔需为 0 到 60 秒');
      return;
    }
    state.maxDuoTurns = nextMaxTurns;
    state.maxDuoTotalTurns = nextTotalTurns;
    state.duoIntervalSeconds = Math.round(nextInterval * 10) / 10;
    state.renderMarkdown = dom.renderMarkdown.checked;
    state.globalPrompt = dom.globalPromptEditor.value.trim();
    localStorage.setItem(globalPromptStorageKey, state.globalPrompt);
    localStorage.setItem(renderMarkdownStorageKey, String(state.renderMarkdown));
    localStorage.setItem(duoMaxTurnsStorageKey, String(state.maxDuoTurns));
    localStorage.setItem(duoTotalTurnsStorageKey, String(state.maxDuoTotalTurns));
    localStorage.setItem(duoIntervalStorageKey, String(state.duoIntervalSeconds));
    const activeDuo = state.duoSessions.find(session => session.id === state.activeDuoId);
    if (activeDuo) dom.continueDuo.hidden = state.duoRunning || activeDuo.transcript.length >= state.maxDuoTotalTurns;
    rerenderAssistantMessages(state);
    hideDialog(dom.globalSettings);
    showToast(state, '全局设置已保存');
  }

  return {
    deleteCurrentBot,
    editBot,
    fillPersonalityOptions,
    handleAvatarChange,
    openBotManager,
    openGlobalSettings,
    renderBotList,
    renderBotPicker,
    renderHistory,
    removeAvatar,
    resetAvatarDraft,
    restoreBotConversation,
    saveBot,
    saveGlobalSettings,
    startBotConversation,
    updatePromptMode,
    updatePromptPreview
  };
}
