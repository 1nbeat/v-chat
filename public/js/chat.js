import { dom, addMessage, resetMessageScroll, setChatContact, showToast } from './dom.js';
import { currentModelConfig } from './state.js';
import { escapeHtml } from './text.js';
import { personalitySummary, personalityTooltip, promptFor } from './prompts.js';

/** 创建普通聊天控制器，并注入状态、存储和 API 依赖。 */
export function createChatController({ state, currentBot, saveConversation, requestChat, renderRecentBots }) {
  /** 切回单聊时清理双聊视图专属状态和控件。 */
  function activateSingleChat() {
    state.activeDuoId = undefined;
    dom.continueDuo.hidden = true;
    dom.stopDuo.hidden = true;
    dom.duoRemaining.hidden = true;
  }

  /** 渲染当前机器人的欢迎页。 */
  function showWelcome() {
    activateSingleChat();
    const bot = currentBot(state);
    setChatContact(bot.name, bot.signature, bot.avatar, true, personalityTooltip(bot));
    const summary = personalitySummary(bot);
    dom.messages.innerHTML = `<div class="welcome"><div class="welcome-icon">✦</div><h1>你好，我是${escapeHtml(bot.name)}</h1><p>${escapeHtml(summary)}。今天想聊点什么？</p><div class="suggestions"><button data-prompt="帮我制定一个高效的学习计划">制定学习计划 <span>↗</span></button><button data-prompt="给我推荐几本值得一读的书">推荐几本好书 <span>↗</span></button><button data-prompt="用通俗的方式解释量子纠缠">解释一个概念 <span>↗</span></button></div></div>`;
    resetMessageScroll(state);
  }

  /** 从状态恢复当前机器人的聊天记录到页面。 */
  function restoreConversation() {
    activateSingleChat();
    const bot = currentBot(state);
    setChatContact(bot.name, bot.signature, bot.avatar, true, personalityTooltip(bot));
    if (!state.conversation.length) {
      showWelcome();
      return;
    }
    dom.messages.innerHTML = '';
    state.shouldAutoScroll = true;
    for (const message of state.conversation) addMessage(state, message.role, message.content);
  }

  /** 发送一条普通聊天消息并保存完整上下文。 */
  async function sendMessage(text) {
    const content = text.trim();
    if (!content || dom.send.disabled) return;
    if (state.activeDuoId) restoreConversation();
    if (dom.messages.querySelector('.welcome')) dom.messages.innerHTML = '';
    state.conversation.push({ role: 'user', content });
    if (!saveConversation(state)) showToast(state, '本地存储空间不足，对话无法继续保存');
    renderRecentBots();
    addMessage(state, 'user', content);
    dom.input.value = '';
    dom.input.style.height = 'auto';
    dom.send.disabled = true;
    const typing = addMessage(state, 'assistant', '');
    typing.querySelector('.bubble').innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
    try {
      const bot = currentBot(state);
      const answer = await requestChat([{ role: 'system', content: promptFor(state.globalPrompt, bot) }, ...state.conversation], undefined, currentModelConfig(state));
      typing.remove();
      state.conversation.push({ role: 'assistant', content: answer });
      if (!saveConversation(state)) showToast(state, '本地存储空间不足，对话无法继续保存');
      renderRecentBots();
      addMessage(state, 'assistant', answer);
    } catch (error) {
      typing.remove();
      addMessage(state, 'assistant', `抱歉，请求没有完成：${error.message}`);
    } finally {
      dom.send.disabled = false;
      dom.input.focus();
    }
  }

  return { showWelcome, restoreConversation, sendMessage };
}
