import { personalities } from './constants.js';

/** 根据机器人设置拼接最终发送给模型的系统提示词。 */
export function promptFor(globalPrompt, bot) {
  if (!bot.usePreset) return [globalPrompt, bot.notes.trim()].filter(Boolean).join('\n\n');
  const persona = personalities[bot.personality] || personalities.companion;
  return [globalPrompt, `你现在扮演“${bot.name}”。`, persona.prompt, bot.notes.trim()].filter(Boolean).join('\n\n');
}

/** 返回机器人在人机界面中显示的人格摘要。 */
export function personalitySummary(bot) {
  return bot.usePreset === false ? '专属系统设定' : personalities[bot.personality].summary;
}

/** 返回用于界面提示的人格描述。 */
export function personalityTooltip(bot) {
  if (bot.usePreset === false) return bot.notes.trim() || '专属系统设定';
  const persona = personalities[bot.personality] || personalities.companion;
  return `${persona.label}：${persona.summary}`;
}
