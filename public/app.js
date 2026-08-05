import { requestChat, requestServerConfig } from './js/api.js';
import { createBotsController } from './js/bots.js';
import { createChatController } from './js/chat.js';
import { dom, hideDialog, hideSettingsMenu, renderUserProfile, requestConfirmation, resolveConfirmation, showDialog, showToast, toggleSettingsMenu } from './js/dom.js';
import { createDuoController } from './js/duo.js';
import { createModelController } from './js/model.js';
import { createProfileController } from './js/profile.js';
import { clearAllAppData, clearConversation, createState, currentBot, currentModelProfile, saveConversation, saveDuoSessions } from './js/state.js';

const autoScrollThreshold = 48;
const state = createState();
let botsController;
let defaultModel = '';

/** 显示当前生效的模型名称；用户配置优先于服务端默认值。 */
function renderModelLabel() {
  const profile = currentModelProfile(state);
  dom.modelLabel.textContent = '模型：' + (profile?.model || defaultModel || '默认模型');
}

/** 读取服务端默认模型名称，用于左侧状态展示。 */
async function loadDefaultModel() {
  try {
    const config = await requestServerConfig();
    defaultModel = config.model;
    renderModelLabel();
  } catch {
    // 服务配置展示失败时保留“默认模型”提示，不影响聊天功能。
  }
}

/** 普通聊天在保存记录后刷新最近会话列表。 */
function renderRecentBots() {
  botsController.renderHistory();
}

const chatController = createChatController({
  state,
  currentBot,
  saveConversation,
  requestChat,
  renderRecentBots
});

const duoController = createDuoController({
  state,
  saveDuoSessions,
  renderRecentBots
});

const profileController = createProfileController({ state });
const modelController = createModelController({ state, renderModelLabel, requestConfirmation });

botsController = createBotsController({
  state,
  clearConversation,
  restoreConversation: chatController.restoreConversation,
  saveDuoSessions,
  requestConfirmation
});

/** 处理普通聊天表单提交。 */
function handleComposerSubmit(event) {
  event.preventDefault();
  chatController.sendMessage(dom.input.value);
}

/** 让 Enter 发送，Shift + Enter 保留换行。 */
function handleInputKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    dom.composer.requestSubmit();
  }
}

/** 根据内容调整聊天输入框高度。 */
function resizeInput() {
  dom.input.style.height = 'auto';
  dom.input.style.height = `${Math.min(dom.input.scrollHeight, 130)}px`;
}

/** 记录用户是否停留在消息列表底部。 */
function handleMessageScroll() {
  const currentScrollTop = dom.messages.scrollTop;
  const distanceFromBottom = dom.messages.scrollHeight - currentScrollTop - dom.messages.clientHeight;
  const scrollingUp = currentScrollTop < state.lastMessageScrollTop;
  state.shouldAutoScroll = !scrollingUp && distanceFromBottom <= autoScrollThreshold;
  state.lastMessageScrollTop = currentScrollTop;
}

/** 处理欢迎页中快捷提示词的点击。 */
function handleSuggestedPrompt(event) {
  const prompt = event.target.closest('[data-prompt]');
  if (prompt) chatController.sendMessage(prompt.dataset.prompt);
}

/** 从最近会话列表恢复普通聊天或双聊记录。 */
function handleRecentChatClick(event) {
  if (state.duoRunning) return;
  const item = event.target.closest('[data-bot-id], [data-duo-id]');
  if (item?.dataset.botId) botsController.restoreBotConversation(item.dataset.botId);
  if (item?.dataset.duoId) duoController.restoreDuoSession(item.dataset.duoId);
}

/** 打开新对话的机器人选择弹窗。 */
function handleNewChat() {
  if (state.duoRunning) {
    showToast(state, '请先停止机器人对聊');
    return;
  }
  botsController.renderBotPicker();
  showDialog(dom.botPicker);
}

/** 清空当前正在查看的单聊或机器人对聊本地记录。 */
async function handleClearChat() {
  if (state.duoRunning) {
    showToast(state, '请先停止机器人对聊');
    return;
  }
  const activeDuo = state.activeDuoId ? state.duoSessions.find(session => session.id === state.activeDuoId) : undefined;
  if (activeDuo) {
    if (activeDuo.transcript.length) {
      const confirmed = await requestConfirmation(state, { title: '清空当前记录？', message: '将清空当前机器人对聊的本地记录，且无法撤销。', confirmLabel: '清空记录' });
      if (!confirmed) return;
    }
    state.duoSessions = state.duoSessions.filter(session => session.id !== activeDuo.id);
    state.activeDuoId = undefined;
    saveDuoSessions(state);
    renderRecentBots();
    chatController.showWelcome();
    showToast(state, '机器人对聊记录已清空');
    return;
  }
  if (state.conversation.length) {
    const confirmed = await requestConfirmation(state, { title: '清空当前记录？', message: '将清空当前机器人的本地对话记录，且无法撤销。', confirmLabel: '清空记录' });
    if (!confirmed) return;
  }
  clearConversation(state);
  renderRecentBots();
  chatController.showWelcome();
  showToast(state, '本地对话记录已清空');
}

/** 清除应用全部本地数据，并恢复到首次打开时的状态。 */
async function handleResetLocalData() {
  const confirmed = await requestConfirmation(state, {
    title: '重置全部本地数据？',
    message: '将删除用户资料、机器人、单聊和双聊记录以及所有设置，且无法撤销。页面会恢复初始状态。',
    confirmLabel: '确认重置'
  });
  if (!confirmed) return;
  if (state.duoRunning) duoController.stopDuoConversation();
  try {
    clearAllAppData();
  } catch {
    showToast(state, '本地数据清理失败，请检查浏览器存储权限');
    return;
  }
  window.location.reload();
}

/** 打开或关闭桌面端、移动端共用的设置菜单。 */
function handleSettingsClick(event) {
  toggleSettingsMenu(event.currentTarget);
}

/** 根据设置菜单的选项打开对应弹窗。 */
function handleSettingsMenuClick(event) {
  const action = event.target.closest('[data-settings-action]')?.dataset.settingsAction;
  if (!action) return;
  hideSettingsMenu();
  if (action === 'bots') botsController.openBotManager();
  if (action === 'model') modelController.openModelSettings();
  if (action === 'global') botsController.openGlobalSettings();
  if (action === 'profile') profileController.openProfileSettings();
  if (action === 'reset') handleResetLocalData();
}

/** 在机器人管理列表中切换当前编辑项。 */
function handleBotListClick(event) {
  const item = event.target.closest('[data-bot-id]');
  if (item) botsController.editBot(item.dataset.botId);
}

/** 初始化一个空白机器人编辑表单。 */
function handleAddBot() {
  state.editingBotId = null;
  dom.botName.value = '';
  dom.botSignature.value = '';
  botsController.resetAvatarDraft();
  dom.usePersonalityPreset.checked = true;
  dom.personalityPreset.value = 'companion';
  dom.botNotes.value = '';
  dom.deleteBot.disabled = true;
  botsController.updatePromptMode();
  botsController.renderBotList();
  dom.botName.focus();
}

/** 保存机器人编辑表单。 */
function handleBotFormSubmit(event) {
  event.preventDefault();
  botsController.saveBot();
}

/** 删除当前编辑的机器人。 */
function handleDeleteBot() {
  botsController.deleteCurrentBot();
}

/** 在机器人选择器中开始一段新聊天。 */
function handleBotPickerClick(event) {
  const item = event.target.closest('[data-bot-id]');
  if (item) botsController.startBotConversation(item.dataset.botId);
}

/** 在自定义模型列表中切换当前使用的模型。 */
function handleModelListClick(event) {
  const item = event.target.closest('[data-model-id]');
  if (item) modelController.selectModel(item.dataset.modelId);
}

/** 保存新增或编辑中的自定义模型。 */
function handleModelFormSubmit(event) {
  event.preventDefault();
  modelController.saveModel();
}

/** 打开双机器人对聊配置弹窗。 */
function handleOpenDuo() {
  hideDialog(dom.botPicker);
  duoController.openDuoDialog();
}

/** 校验双聊参数并启动机器人对话。 */
function handleDuoFormSubmit(event) {
  event.preventDefault();
  const topic = dom.duoTopic.value.trim();
  if (!topic) {
    dom.duoTopic.focus();
    dom.duoHint.textContent = '请输入一个对话主题。';
    dom.duoHint.classList.add('error');
    return;
  }
  if (dom.duoFirstBot.value === dom.duoSecondBot.value) {
    dom.duoHint.textContent = '请选择两个不同的机器人。';
    dom.duoHint.classList.add('error');
    return;
  }
  dom.duoHint.classList.remove('error');
  duoController.runDuoConversation(dom.duoFirstBot.value, dom.duoSecondBot.value, topic);
}

/** 打开当前机器人对聊的追加轮数弹窗。 */
function handleOpenContinueDuo() {
  duoController.openContinueDuoDialog();
}

/** 校验追加轮数并继续当前机器人对聊。 */
function handleContinueDuoFormSubmit(event) {
  event.preventDefault();
  duoController.continueDuoConversation();
}

/** 在页面空白处点击时关闭设置菜单。 */
function handleDocumentClick(event) {
  if (!dom.settingsMenu.hidden && !event.target.closest('#settingsMenu, #settings, #mobileSettings')) hideSettingsMenu();
}

/** 用 Escape 关闭所有已打开的设置类弹窗。 */
function handleDocumentKeydown(event) {
  if (event.key !== 'Escape') return;
  hideSettingsMenu();
  if (!dom.botManager.hidden) hideDialog(dom.botManager);
  if (!dom.botPicker.hidden) hideDialog(dom.botPicker);
  if (!dom.globalSettings.hidden) hideDialog(dom.globalSettings);
  if (!dom.modelSettings.hidden) hideDialog(dom.modelSettings);
  if (!dom.profileSettings.hidden) hideDialog(dom.profileSettings);
  if (!dom.duoDialog.hidden) hideDialog(dom.duoDialog);
  if (!dom.continueDuoDialog.hidden) hideDialog(dom.continueDuoDialog);
  if (!dom.confirmDialog.hidden) resolveConfirmation(state, false);
}

/** 关闭确认弹窗并视为取消当前操作。 */
function handleCancelConfirmation() {
  resolveConfirmation(state, false);
}

/** 确认当前危险操作。 */
function handleAcceptConfirmation() {
  resolveConfirmation(state, true);
}

/** 点击确认弹窗遮罩区域时取消当前操作。 */
function handleConfirmBackdropClick(event) {
  if (event.target === dom.confirmDialog) resolveConfirmation(state, false);
}

/** 绑定全部页面事件，并恢复初始页面状态。 */
function initializeApp() {
  dom.composer.addEventListener('submit', handleComposerSubmit);
  dom.input.addEventListener('keydown', handleInputKeydown);
  dom.input.addEventListener('input', resizeInput);
  dom.messages.addEventListener('scroll', handleMessageScroll);
  document.addEventListener('click', handleSuggestedPrompt);
  dom.recentBots.addEventListener('click', handleRecentChatClick);
  dom.recentDuoChats.addEventListener('click', handleRecentChatClick);
  dom.newChat.addEventListener('click', handleNewChat);
  dom.clearChat.addEventListener('click', handleClearChat);
  dom.settings.addEventListener('click', handleSettingsClick);
  dom.mobileSettings.addEventListener('click', handleSettingsClick);
  dom.settingsMenu.addEventListener('click', handleSettingsMenuClick);
  dom.closeBotManager.addEventListener('click', () => hideDialog(dom.botManager));
  dom.closeBotPicker.addEventListener('click', () => hideDialog(dom.botPicker));
  dom.closeDuoDialog.addEventListener('click', () => hideDialog(dom.duoDialog));
  dom.cancelDuo.addEventListener('click', () => hideDialog(dom.duoDialog));
  dom.closeGlobalSettings.addEventListener('click', () => hideDialog(dom.globalSettings));
  dom.closeModelSettings.addEventListener('click', () => hideDialog(dom.modelSettings));
  dom.closeProfileSettings.addEventListener('click', () => hideDialog(dom.profileSettings));
  dom.profileAvatarInput.addEventListener('change', profileController.handleAvatarChange);
  dom.removeProfileAvatar.addEventListener('click', profileController.removeAvatar);
  dom.botAvatarInput.addEventListener('change', botsController.handleAvatarChange);
  dom.removeBotAvatar.addEventListener('click', botsController.removeAvatar);
  dom.profileNickname.addEventListener('input', profileController.renderDraftProfile);
  dom.saveProfile.addEventListener('click', profileController.saveProfile);
  dom.closeConfirmDialog.addEventListener('click', handleCancelConfirmation);
  dom.cancelConfirm.addEventListener('click', handleCancelConfirmation);
  dom.acceptConfirm.addEventListener('click', handleAcceptConfirmation);
  dom.confirmDialog.addEventListener('click', handleConfirmBackdropClick);
  dom.botList.addEventListener('click', handleBotListClick);
  dom.addBot.addEventListener('click', handleAddBot);
  dom.usePersonalityPreset.addEventListener('change', botsController.updatePromptMode);
  dom.personalityPreset.addEventListener('change', botsController.updatePromptPreview);
  dom.botName.addEventListener('input', botsController.updatePromptPreview);
  dom.botNotes.addEventListener('input', botsController.updatePromptPreview);
  dom.botForm.addEventListener('submit', handleBotFormSubmit);
  dom.deleteBot.addEventListener('click', handleDeleteBot);
  dom.botPickerList.addEventListener('click', handleBotPickerClick);
  dom.modelList.addEventListener('click', handleModelListClick);
  dom.addModel.addEventListener('click', modelController.startNewModel);
  dom.useDefaultModel.addEventListener('click', modelController.useProjectDefault);
  dom.modelForm.addEventListener('submit', handleModelFormSubmit);
  dom.deleteModel.addEventListener('click', modelController.deleteModel);
  dom.openDuoFromPicker.addEventListener('click', handleOpenDuo);
  dom.saveGlobalPrompt.addEventListener('click', botsController.saveGlobalSettings);
  dom.duoForm.addEventListener('submit', handleDuoFormSubmit);
  dom.continueDuo.addEventListener('click', handleOpenContinueDuo);
  dom.closeContinueDuoDialog.addEventListener('click', () => hideDialog(dom.continueDuoDialog));
  dom.cancelContinueDuo.addEventListener('click', () => hideDialog(dom.continueDuoDialog));
  dom.continueDuoForm.addEventListener('submit', handleContinueDuoFormSubmit);
  dom.stopDuo.addEventListener('click', duoController.stopDuoConversation);
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleDocumentKeydown);
  botsController.fillPersonalityOptions();
  renderUserProfile(state.userProfile);
  renderModelLabel();
  void loadDefaultModel();
  renderRecentBots();
  chatController.restoreConversation();
}

initializeApp();
