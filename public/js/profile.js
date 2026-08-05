import { userProfileStorageKey } from './constants.js';
import { dom, hideDialog, renderAvatar, renderUserMessageAvatars, renderUserProfile, showDialog, showToast } from './dom.js';

/** 创建用户昵称与本地头像的设置控制器。 */
export function createProfileController({ state }) {
  let draftAvatar = '';

  /** 将资料草稿渲染到个人信息弹窗。 */
  function renderDraftProfile() {
    const draft = { nickname: dom.profileNickname.value.trim() || '访客用户', avatar: draftAvatar };
    renderAvatar(dom.profileAvatarPreview, draft);
  }

  /** 打开个人信息弹窗并填充当前已保存资料。 */
  function openProfileSettings() {
    draftAvatar = state.userProfile.avatar;
    dom.profileNickname.value = state.userProfile.nickname;
    dom.profileAvatarInput.value = '';
    renderDraftProfile();
    showDialog(dom.profileSettings);
    dom.profileNickname.focus();
  }

  /** 读取选择的头像文件，并生成用于预览和本地存储的数据地址。 */
  function handleAvatarChange() {
    const [file] = dom.profileAvatarInput.files;
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast(state, '请选择图片文件');
      dom.profileAvatarInput.value = '';
      return;
    }
    if (file.size > 1_000_000) {
      showToast(state, '头像文件不能超过 1MB');
      dom.profileAvatarInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      draftAvatar = typeof reader.result === 'string' ? reader.result : '';
      renderDraftProfile();
    });
    reader.addEventListener('error', () => showToast(state, '头像读取失败，请重新选择'));
    reader.readAsDataURL(file);
  }

  /** 移除资料草稿中的头像并回退到昵称首字母。 */
  function removeAvatar() {
    draftAvatar = '';
    dom.profileAvatarInput.value = '';
    renderDraftProfile();
  }

  /** 保存昵称和头像到本地存储，并刷新所有个人资料展示。 */
  function saveProfile() {
    const nickname = dom.profileNickname.value.trim() || '访客用户';
    const profile = { nickname, avatar: draftAvatar };
    try {
      localStorage.setItem(userProfileStorageKey, JSON.stringify(profile));
    } catch {
      showToast(state, '本地存储空间不足，头像无法保存');
      return;
    }
    state.userProfile = profile;
    renderUserProfile(profile);
    renderUserMessageAvatars(profile);
    hideDialog(dom.profileSettings);
    showToast(state, '个人资料已保存');
  }

  return { handleAvatarChange, openProfileSettings, removeAvatar, renderDraftProfile, saveProfile };
}
