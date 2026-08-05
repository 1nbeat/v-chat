import { dom, addDuoMessage, hideDialog, resetMessageScroll, setChatContact, setDuoRemaining, showDialog, showToast } from './dom.js';
import { requestChat } from './api.js';
import { promptFor } from './prompts.js';
import { currentModelConfig } from './state.js';
import { escapeHtml } from './text.js';

/** 创建双机器人对聊控制器。 */
export function createDuoController({ state, saveDuoSessions, renderRecentBots }) {
  const summaryRequests = new Set();

  /** 格式化当前双聊设置的提示文案。 */
  function duoSettingsHint() {
    const interval = Number.isInteger(state.duoIntervalSeconds) ? state.duoIntervalSeconds : state.duoIntervalSeconds.toFixed(1);
    return `本次最多 ${state.maxDuoTurns} 轮，单会话累计最多 ${state.maxDuoTotalTurns} 轮，间隔约 ${interval} 秒；可随时停止。`;
  }

  /** 打开双聊配置弹窗，并填充机器人选项。 */
  function openDuoDialog() {
    const options = state.bots.map(bot => `<option value="${bot.id}">${escapeHtml(bot.name)}</option>`).join('');
    dom.duoFirstBot.innerHTML = options;
    dom.duoSecondBot.innerHTML = options;
    if (state.bots.length > 1) dom.duoSecondBot.selectedIndex = 1;
    const unavailable = state.bots.length < 2;
    dom.startDuo.disabled = unavailable;
    dom.duoFirstBot.disabled = unavailable;
    dom.duoSecondBot.disabled = unavailable;
    dom.duoHint.textContent = unavailable ? '请先在机器人管理中新建至少两个机器人。' : duoSettingsHint();
    dom.duoHint.classList.toggle('error', unavailable);
    showDialog(dom.duoDialog);
    if (!unavailable) dom.duoTopic.focus();
  }

  /** 将双聊记录按当前机器人视角转换为模型消息。 */
  function buildDuoMessages(bot, transcript, topic) {
    const messages = [{ role: 'system', content: promptFor(state.globalPrompt, bot) }];
    if (!transcript.length) messages.push({ role: 'user', content: `请和另一位机器人围绕这个主题开始一段自然对话：${topic}` });
    for (const entry of transcript) {
      const role = entry.botId === bot.id ? 'assistant' : 'user';
      messages.push({ role, content: role === 'assistant' ? entry.content : `${entry.name}：${entry.content}` });
    }
    return messages;
  }

  /** 以可中断请求的方式获取一个机器人的下一句回复。 */
  async function requestDuoReply(bot, transcript, topic) {
    state.duoAbortController = new AbortController();
    return requestChat(buildDuoMessages(bot, transcript, topic), state.duoAbortController.signal, currentModelConfig(state));
  }

  /** 渲染双聊顶部的 AI 概述，尚未生成时展示主题说明。 */
  function renderDuoNotice(first, second, session, isRunning) {
    const fallback = isRunning
      ? `${first?.name || '已删除机器人'} 与 ${second?.name || '已删除机器人'} 正在围绕“${session.topic}”对聊`
      : `${first?.name || '已删除机器人'} 与 ${second?.name || '已删除机器人'} 曾围绕“${session.topic}”对聊`;
    const content = session.summary?.trim() || fallback;
    const notice = dom.messages.querySelector('.duo-notice');
    if (notice) notice.textContent = content;
    else dom.messages.innerHTML = `<div class="duo-notice">${escapeHtml(content)}</div>`;
  }

  /** 根据双聊主题请求一段简洁概述，并写回双聊记录。 */
  async function generateDuoSummary(first, second, topic, session) {
    if (summaryRequests.has(session.id)) return;
    summaryRequests.add(session.id);
    try {
      const content = await requestChat([
        { role: 'system', content: '你是对话摘要助手。请根据机器人对聊主题生成一句简洁的中文概述，只输出概述本身，不要加引号、标题或解释，控制在 30 字以内。' },
        { role: 'user', content: `机器人 A：${first?.name || '已删除机器人'}\n机器人 B：${second?.name || '已删除机器人'}\n对话主题：${topic}\n请概括这段对聊的主题。` }
      ], undefined, currentModelConfig(state));
      if (!state.duoSessions.some(item => item.id === session.id)) return;
      const summary = content.replace(/\s+/g, ' ').trim();
      if (!summary) return;
      session.summary = summary.length > 50 ? `${summary.slice(0, 50)}…` : summary;
      saveDuoSessions(state);
      renderRecentBots();
      if (state.activeDuoId === session.id) renderDuoNotice(first, second, session, state.duoRunning);
    } catch {
      // 概述生成失败时保留主题说明。
    } finally {
      summaryRequests.delete(session.id);
    }
  }

  /** 返回当前双聊会话在总轮次上限内还可追加的轮数。 */
  function remainingDuoTurns(session) {
    return Math.max(0, state.maxDuoTotalTurns - session.transcript.length);
  }

  /** 按当前选中的双聊会话状态显示或隐藏继续对聊按钮。 */
  function updateContinueDuoButton() {
    const session = state.duoSessions.find(item => item.id === state.activeDuoId);
    dom.continueDuo.hidden = state.duoRunning || !session || remainingDuoTurns(session) === 0;
  }

  /** 切换双聊运行状态及其对应的页面控件。 */
  function setDuoRunning(running) {
    state.duoRunning = running;
    dom.stopDuo.hidden = !running;
    dom.duoRemaining.hidden = !running;
    updateContinueDuoButton();
    dom.send.disabled = running;
    dom.input.disabled = running;
    if (!running) {
      state.duoAbortController = undefined;
      dom.input.focus();
    }
  }

  /** 等待设置的轮次间隔，并允许停止操作提前结束等待。 */
  function waitBetweenDuoTurns() {
    return new Promise(resolve => {
      const finish = () => {
        clearTimeout(state.duoDelayTimer);
        state.duoDelayTimer = undefined;
        state.duoDelayResolve = undefined;
        resolve();
      };
      state.duoDelayResolve = finish;
      state.duoDelayTimer = setTimeout(finish, state.duoIntervalSeconds * 1000);
    });
  }

  /** 中止正在进行的网络请求或等待，并结束双聊。 */
  function stopDuoConversation() {
    if (!state.duoRunning) return;
    state.duoAbortController?.abort();
    state.duoDelayResolve?.();
    setDuoRunning(false);
    showToast(state, '机器人对聊已停止');
  }

  /** 打开追加轮数弹窗，并按当前会话的剩余额度限制输入。 */
  function openContinueDuoDialog() {
    const session = state.duoSessions.find(item => item.id === state.activeDuoId);
    if (!session || state.duoRunning) return;
    const remaining = remainingDuoTurns(session);
    if (!remaining) {
      updateContinueDuoButton();
      showToast(state, `该会话已达到 ${state.maxDuoTotalTurns} 轮上限`);
      return;
    }
    const suggested = Math.min(state.maxDuoTurns, remaining);
    dom.continueDuoTurns.max = String(remaining);
    dom.continueDuoTurns.value = String(suggested);
    dom.continueDuoHint.textContent = `当前已完成 ${session.transcript.length} 轮，还可追加 ${remaining} 轮；单会话总上限为 ${state.maxDuoTotalTurns} 轮。`;
    showDialog(dom.continueDuoDialog);
    dom.continueDuoTurns.focus();
    dom.continueDuoTurns.select();
  }

  /** 显示保存过的双聊记录。 */
  function restoreDuoSession(id) {
    const session = state.duoSessions.find(item => item.id === id);
    if (!session || state.duoRunning) return;
    state.activeDuoId = id;
    renderRecentBots();
    const first = state.bots.find(bot => bot.id === session.firstId);
    const second = state.bots.find(bot => bot.id === session.secondId);
    setChatContact(`${first?.name || '已删除机器人'} × ${second?.name || '已删除机器人'}`, '机器人对聊记录');
    dom.messages.innerHTML = '<div class="duo-notice"></div>';
    renderDuoNotice(first, second, session, false);
    if (!session.summary?.trim()) void generateDuoSummary(first, second, session.topic, session);
    resetMessageScroll(state);
    for (const entry of session.transcript) {
      const bot = state.bots.find(item => item.id === entry.botId) || { name: entry.name || '已删除机器人' };
      addDuoMessage(state, bot, entry.content, entry.botId === session.firstId ? 'left' : 'right');
    }
    updateContinueDuoButton();
  }

  /** 交替请求两个机器人，并把本次追加的内容接在现有会话后。 */
  async function runDuoTurns(session, requestedTurns) {
    const first = state.bots.find(bot => bot.id === session.firstId);
    const second = state.bots.find(bot => bot.id === session.secondId);
    if (!first || !second || first.id === second.id) return;
    const turns = Math.min(requestedTurns, remainingDuoTurns(session));
    if (!turns) return;
    const previousTurns = session.transcript.length;
    state.activeDuoId = session.id;
    setDuoRunning(true);
    setDuoRemaining(turns);
    setChatContact(`${first.name} × ${second.name}`, '机器人对聊中');
    renderDuoNotice(first, second, session, true);
    try {
      for (let turn = 0; turn < turns && state.duoRunning; turn += 1) {
        const absoluteTurn = previousTurns + turn;
        const bot = absoluteTurn % 2 === 0 ? first : second;
        const side = absoluteTurn % 2 === 0 ? 'left' : 'right';
        setDuoRemaining(turns - turn);
        const typing = addDuoMessage(state, bot, '', side);
        typing.querySelector('.duo-body').innerHTML = '<span class="duo-typing"><span class="typing"><span></span><span></span><span></span></span></span>';
        try {
          const content = await requestDuoReply(bot, session.transcript, session.topic);
          if (!state.duoRunning) {
            typing.remove();
            break;
          }
          typing.remove();
          session.transcript.push({ botId: bot.id, name: bot.name, content });
          setDuoRemaining(turns - (session.transcript.length - previousTurns));
          session.updatedAt = Date.now();
          saveDuoSessions(state);
          renderRecentBots();
          addDuoMessage(state, bot, content, side);
          if (turn < turns - 1 && state.duoRunning) await waitBetweenDuoTurns();
        } catch (error) {
          typing.remove();
          if (error.name !== 'AbortError' && state.duoRunning) {
            addDuoMessage(state, bot, `对聊请求失败：${error.message}`, side);
            showToast(state, '对聊因请求错误停止');
          }
          break;
        }
      }
      const completedTurns = session.transcript.length - previousTurns;
      if (state.duoRunning && completedTurns === turns) {
        const remaining = remainingDuoTurns(session);
        showToast(state, remaining ? `已完成 ${completedTurns} 轮，可继续对聊` : `已达到单会话 ${state.maxDuoTotalTurns} 轮上限`);
      }
    } finally {
      if (state.duoRunning) setDuoRunning(false);
      else updateContinueDuoButton();
    }
  }

  /** 新建一条双聊会话，并按全局单次轮数启动首轮对话。 */
  async function runDuoConversation(firstId, secondId, topic) {
    const first = state.bots.find(bot => bot.id === firstId);
    const second = state.bots.find(bot => bot.id === secondId);
    if (!first || !second || first.id === second.id) return;
    hideDialog(dom.duoDialog);
    resetMessageScroll(state);
    const session = { id: `duo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, firstId, secondId, topic, summary: '', transcript: [], updatedAt: Date.now() };
    dom.messages.innerHTML = '<div class="duo-notice"></div>';
    renderDuoNotice(first, second, session, true);
    state.duoSessions.unshift(session);
    state.activeDuoId = session.id;
    renderRecentBots();
    void generateDuoSummary(first, second, topic, session);
    await runDuoTurns(session, Math.min(state.maxDuoTurns, remainingDuoTurns(session)));
  }

  /** 校验用户选择的追加轮数，并从当前会话继续对聊。 */
  async function continueDuoConversation() {
    const session = state.duoSessions.find(item => item.id === state.activeDuoId);
    if (!session || state.duoRunning) return;
    const turns = Number(dom.continueDuoTurns.value);
    const remaining = remainingDuoTurns(session);
    if (!Number.isInteger(turns) || turns < 1 || turns > remaining) {
      dom.continueDuoTurns.focus();
      showToast(state, `追加轮数需为 1 到 ${remaining} 的整数`);
      return;
    }
    hideDialog(dom.continueDuoDialog);
    await runDuoTurns(session, turns);
  }

  return { continueDuoConversation, openContinueDuoDialog, openDuoDialog, restoreDuoSession, runDuoConversation, stopDuoConversation };
}
