import { dom, hideDialog, showDialog, showToast } from './dom.js';
import { createId, saveModelProfiles } from './state.js';

/** 管理用户自定义模型的新增、编辑、删除与切换。 */
export function createModelController({ state, renderModelLabel, requestConfirmation }) {
  /** 用表单展示指定模型；未传入时准备新建模型。 */
  function fillModelForm(profile) {
    state.editingModelProfileId = profile?.id || null;
    dom.modelProfileName.value = profile?.name || '';
    dom.modelApiUrl.value = profile?.apiUrl || '';
    dom.modelApiKey.value = profile?.apiKey || '';
    dom.modelName.value = profile?.model || '';
    dom.deleteModel.disabled = !profile;
    dom.modelEditorHint.textContent = profile
      ? profile.id === state.activeModelProfileId ? '当前正在使用此模型配置。' : '保存后会切换为此模型配置。'
      : '填写配置后保存，即可新增并切换到该模型。';
  }

  /** 渲染模型列表和项目默认配置切换按钮。 */
  function renderModelList() {
    dom.modelList.innerHTML = '';
    dom.useDefaultModel.classList.toggle('active', !state.activeModelProfileId);
    for (const profile of state.modelProfiles) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `bot-list-item${profile.id === state.editingModelProfileId ? ' selected' : ''}`;
      button.dataset.modelId = profile.id;
      const name = document.createElement('strong');
      name.textContent = profile.name;
      const detail = document.createElement('span');
      const model = profile.model || '使用项目默认模型';
      detail.textContent = profile.id === state.activeModelProfileId ? `${model} · 当前使用` : model;
      button.append(name, detail);
      dom.modelList.append(button);
    }
    if (!state.modelProfiles.length) dom.modelList.innerHTML = '<div class="history-empty">暂无自定义模型</div>';
  }

  /** 读取当前激活配置并打开管理弹窗。 */
  function openModelSettings() {
    const active = state.modelProfiles.find(profile => profile.id === state.activeModelProfileId);
    fillModelForm(active);
    renderModelList();
    showDialog(dom.modelSettings);
    if (active) dom.modelProfileName.focus();
    else dom.addModel.focus();
  }

  /** 切换到指定模型，同时加载它的编辑内容。 */
  function selectModel(id) {
    const profile = state.modelProfiles.find(item => item.id === id);
    if (!profile) return;
    const previousActiveId = state.activeModelProfileId;
    state.activeModelProfileId = profile.id;
    try {
      saveModelProfiles(state);
    } catch {
      state.activeModelProfileId = previousActiveId;
      showToast(state, '模型切换保存失败，请检查浏览器存储权限');
      return;
    }
    fillModelForm(profile);
    renderModelList();
    renderModelLabel();
    showToast(state, `已切换到 ${profile.name}`);
  }

  /** 回退到项目 .env 中的默认模型配置。 */
  function useProjectDefault() {
    const previousActiveId = state.activeModelProfileId;
    state.activeModelProfileId = '';
    try {
      saveModelProfiles(state);
    } catch {
      state.activeModelProfileId = previousActiveId;
      showToast(state, '默认模型切换保存失败，请检查浏览器存储权限');
      return;
    }
    fillModelForm();
    renderModelList();
    renderModelLabel();
    showToast(state, '已切换到项目默认模型');
  }

  /** 准备一个空白模型表单。 */
  function startNewModel() {
    fillModelForm();
    renderModelList();
    dom.modelProfileName.focus();
  }

  /** 校验并新增或更新模型配置；保存后自动切换到该配置。 */
  function saveModel() {
    const name = dom.modelProfileName.value.trim();
    if (!name) {
      dom.modelProfileName.focus();
      showToast(state, '请输入配置名称');
      return;
    }
    const apiUrl = dom.modelApiUrl.value.trim();
    if (apiUrl) {
      try {
        const parsed = new URL(apiUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
      } catch {
        dom.modelApiUrl.focus();
        showToast(state, 'API 地址必须是 http 或 https 地址');
        return;
      }
    }
    const previousProfiles = state.modelProfiles.map(profile => ({ ...profile }));
    const previousActiveId = state.activeModelProfileId;
    const previousEditingId = state.editingModelProfileId;
    const data = { name, apiUrl, apiKey: dom.modelApiKey.value.trim(), model: dom.modelName.value.trim() };
    if (state.editingModelProfileId) {
      state.modelProfiles = state.modelProfiles.map(profile => profile.id === state.editingModelProfileId ? { ...profile, ...data } : profile);
    } else {
      const profile = { id: createId('model'), ...data };
      state.modelProfiles.unshift(profile);
      state.editingModelProfileId = profile.id;
    }
    state.activeModelProfileId = state.editingModelProfileId;
    try {
      saveModelProfiles(state);
    } catch {
      state.modelProfiles = previousProfiles;
      state.activeModelProfileId = previousActiveId;
      state.editingModelProfileId = previousEditingId;
      showToast(state, '模型配置保存失败，请检查浏览器存储权限');
      return;
    }
    fillModelForm(state.modelProfiles.find(profile => profile.id === state.editingModelProfileId));
    renderModelList();
    renderModelLabel();
    showToast(state, '自定义模型已保存并切换');
  }

  /** 删除正在编辑的模型；删除后自动使用项目默认配置。 */
  async function deleteModel() {
    const profile = state.modelProfiles.find(item => item.id === state.editingModelProfileId);
    if (!profile) return;
    const confirmed = await requestConfirmation(state, {
      title: '删除自定义模型？',
      message: `将删除“${profile.name}”及其本地 API 配置，且无法撤销。`,
      confirmLabel: '删除模型'
    });
    if (!confirmed) return;
    const previousProfiles = state.modelProfiles.map(item => ({ ...item }));
    const previousActiveId = state.activeModelProfileId;
    state.modelProfiles = state.modelProfiles.filter(item => item.id !== profile.id);
    if (state.activeModelProfileId === profile.id) state.activeModelProfileId = '';
    try {
      saveModelProfiles(state);
    } catch {
      state.modelProfiles = previousProfiles;
      state.activeModelProfileId = previousActiveId;
      showToast(state, '模型删除保存失败，请检查浏览器存储权限');
      return;
    }
    fillModelForm();
    renderModelList();
    renderModelLabel();
    showToast(state, '自定义模型已删除');
  }

  return { deleteModel, openModelSettings, renderModelList, saveModel, selectModel, startNewModel, useProjectDefault };
}
