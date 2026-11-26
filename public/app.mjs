import { getRoster, groupRoster, isRoomId, nextResetDelay, nicknameKey, normalizeNickname, startLabel, STATUSES, TEAM_SIZE } from './model.mjs?v=2';

const byId = (id) => document.getElementById(id);
const views = ['home', 'room', 'message'];
const buttons = new Map();
let backendImport;
let roomId;
let room;
let uid;
let online = false;
let clockOffset = 0;
let stopRoom = () => {};
let stopClock = () => {};
let stopConnection = () => {};
let resetTimer;
let copyTimer;
let pendingVote = false;
let lastNickname;
let removeTarget;

function backend() {
  backendImport ??= import('./backend.mjs?v=3').catch((error) => {
    backendImport = undefined;
    throw error;
  });
  return backendImport;
}

function setView(active) {
  for (const view of views) byId(`${view}-view`).hidden = view !== active;
  byId('hero-tools').hidden = active !== 'room';
  byId('home-link').hidden = active === 'home';
}

function setText(id, value) {
  if (byId(id).textContent !== value) byId(id).textContent = value;
}

function textNode(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  return node;
}

function dot() {
  const node = document.createElement('span');
  node.className = 'dot';
  node.setAttribute('aria-hidden', 'true');
  return node;
}

for (const [status, { label, hint }] of Object.entries(STATUSES)) {
  const item = document.createElement('li');
  item.className = 'status-card';
  item.dataset.vote = status;
  const detail = document.createElement('span');
  detail.append(textNode('strong', '', label), textNode('small', '', hint));
  item.append(dot(), detail);
  byId('legend').append(item);

  const button = document.createElement('button');
  button.className = 'status-button';
  button.type = 'button';
  button.dataset.vote = status;
  button.setAttribute('aria-pressed', 'false');
  button.append(dot(), detail.cloneNode(true), textNode('span', 'selected-text', '선택됨'));
  button.lastChild.setAttribute('aria-hidden', 'true');
  button.addEventListener('click', () => saveVote(status));
  buttons.set(status, button);
  byId('status-actions').append(button);
}

function getRecent() {
  try { return localStorage.getItem('jaraeng-recent-room'); } catch { return null; }
}

function saveRecent(id) {
  try { localStorage.setItem('jaraeng-recent-room', id); } catch { /* The invite still works without local storage. */ }
}

function showMessage(title, detail, { retry = false, home = false } = {}) {
  setView('message');
  setText('page-title', title);
  setText('hero-note', '');
  setText('room-message', detail);
  byId('retry').hidden = !retry;
  byId('missing-home').hidden = !home;
}

function participantCard(member) {
  const card = document.createElement('li');
  card.className = member.id === uid ? 'player me' : 'player';
  card.dataset.vote = member.status;
  const avatar = textNode('span', 'avatar', Array.from(member.nickname)[0]);
  avatar.setAttribute('aria-hidden', 'true');
  const name = textNode('span', 'player-name', member.nickname);
  const chips = [];
  if (member.id === room.settings.hostId) chips.push('방장');
  if (member.id === uid) chips.push('나');
  if (chips.length) name.append(' ', textNode('em', '', chips.join(' · ')));
  const status = textNode('span', 'player-status', STATUSES[member.status].label);
  status.prepend(dot());
  card.append(avatar, name, status);
  if (uid === room.settings.hostId && member.id !== uid) {
    const button = textNode('button', 'remove-player', '내보내기');
    button.type = 'button';
    button.setAttribute('aria-label', `${member.nickname} 내보내기`);
    button.addEventListener('click', () => {
      removeTarget = member;
      setText('remove-error', '');
      setText('remove-description', `${member.nickname} 님을 대기실에서 내보낼까요? 같은 링크로 다시 입장할 수 있어요.`);
      byId('remove-dialog').showModal();
    });
    card.append(button);
  }
  return card;
}

function emptyCard() {
  const card = document.createElement('li');
  card.className = 'player empty';
  const avatar = textNode('span', 'avatar', '+');
  avatar.setAttribute('aria-hidden', 'true');
  card.append(avatar, textNode('span', 'player-name', '빈 자리'));
  return card;
}

function renderRoom() {
  if (!room || byId('room-view').hidden) return;
  const now = Date.now() + clockOffset;
  const roster = getRoster(room, now);
  const { confirmed, waiting } = groupRoster(roster);
  const maybeCount = waiting.filter(({ status }) => status === 'maybe').length;
  const me = roster.find((member) => member.id === uid);

  setText('roster-summary', confirmed.length < TEAM_SIZE
    ? `자랭 시작까지 ${TEAM_SIZE - confirmed.length}명 더 필요해요.`
    : '‘한다’를 선택한 친구들이에요.');
  setText('counter', `확정 ${confirmed.length}명`);
  setText('team-ready', confirmed.length >= TEAM_SIZE ? '5명 이상 모였어요! 자랭할 수 있어요.' : '');
  const cards = confirmed.map(participantCard);
  while (cards.length < TEAM_SIZE) cards.push(emptyCard());
  byId('roster').replaceChildren(...cards);
  setText('waiting-summary', waiting.length
    ? `부족하면 한다 ${maybeCount}명 · 안 한다 ${waiting.length - maybeCount}명`
    : '대기 중인 친구가 없어요.');
  setText('waiting-counter', `대기 ${waiting.length}명`);
  byId('waiting-roster').replaceChildren(...waiting.map(participantCard));
  byId('waiting-roster').hidden = waiting.length === 0;

  setText('actions-title', me ? '내 참여 상태' : '대기실 입장');
  if (me) lastNickname = me.nickname;
  if (!me && lastNickname && !byId('guest-nickname').value) byId('guest-nickname').value = lastNickname;
  const description = lastNickname
    ? '방장이 내보냈어요. 같은 닉네임으로 다시 입장할 수 있어요.'
    : '닉네임을 입력하면 친구들에게 내 카드가 보여요.';
  setText('actions-description', me ? `${me.nickname} 님, 오늘 참여할 수 있나요?` : description);
  byId('join-form').hidden = Boolean(me);
  byId('vote-actions').hidden = !me;
  byId('time-settings').hidden = uid !== room.settings.hostId;
  if (!byId('time-settings').open) byId('new-start-time').value = room.settings.startTime;
  for (const [status, button] of buttons) {
    button.setAttribute('aria-pressed', String(me?.status === status));
    button.setAttribute('aria-disabled', String(!online || pendingVote));
  }

  clearTimeout(resetTimer);
  resetTimer = setTimeout(() => {
    setText('vote-feedback', '');
    renderRoom();
  }, nextResetDelay(now) + 25);
}

function watchConnection(connected) {
  const wasOnline = online;
  online = connected;
  if (wasOnline && !connected) {
    byId('vote-feedback').setAttribute('data-error', '');
    setText('vote-feedback', '연결이 끊겼어요. 다시 연결되면 상태를 바꿀 수 있어요.');
  } else if (!wasOnline && connected && byId('vote-feedback').hasAttribute('data-error')) {
    byId('vote-feedback').removeAttribute('data-error');
    setText('vote-feedback', '');
  }
  renderRoom();
}

async function enterRoom(id, focusHeading = false) {
  roomId = id;
  room = undefined;
  lastNickname = undefined;
  stopRoom();
  stopClock();
  stopConnection();
  clearTimeout(resetTimer);
  showMessage('자랭 대기실', '대기실 연결 중…');

  try {
    const api = await backend();
    uid = await api.connect();
    await api.waitForConnection();
    stopConnection = api.watchConnection(watchConnection);
    stopClock = api.watchClock((offset) => {
      clockOffset = offset;
      renderRoom();
    });
    stopRoom = api.watchRoom(id, (data) => {
      if (!data) {
        room = undefined;
        showMessage('대기실을 찾을 수 없어요', '친구에게 받은 링크 주소를 다시 확인해 주세요.', { home: true });
        return;
      }
      const first = byId('room-view').hidden;
      room = data;
      setView('room');
      setText('page-title', '자랭 대기실');
      setText('hero-note', '친구들과 오늘의 참여 여부를 확인하세요.');
      setText('start-time', startLabel(data.settings.startTime));
      document.title = '자랭 대기실 · 자랭 모여';
      saveRecent(id);
      renderRoom();
      if (first && focusHeading) byId('page-title').focus();
    }, () => showMessage('대기실에 연결할 수 없어요', '잠시 후 다시 연결해 주세요.', { retry: true }));
  } catch {
    showMessage('대기실에 연결할 수 없어요', '인터넷 연결을 확인하고 다시 시도해 주세요.', { retry: true });
  }
}

function bindNicknameForm(formId, errorId, submitText, busyText, task) {
  const form = byId(formId);
  const field = form.elements.nickname;
  const button = form.querySelector('button[type="submit"]');
  const showNicknameError = (message) => {
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', errorId);
    setText(errorId, message);
    field.focus();
  };
  field.addEventListener('input', () => {
    field.removeAttribute('aria-invalid');
    field.removeAttribute('aria-describedby');
    setText(errorId, '');
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    const nickname = normalizeNickname(field.value);
    if (!nickname || /[\x00-\x1f\x7f]/.test(nickname)) {
      showNicknameError(nickname ? '닉네임에서 줄바꿈이나 탭을 빼 주세요.' : '닉네임을 입력해 주세요.');
      return;
    }
    setText(errorId, '');
    button.disabled = true;
    button.textContent = busyText;
    try {
      const result = await task(nickname, new FormData(form));
      if (result === false) {
        showNicknameError('이미 이 방에서 쓰는 닉네임이에요. 내 카드가 있다면 처음 입장한 브라우저에서 열어 주세요.');
      }
    } catch {
      setText(errorId, '연결 상태를 확인하고 다시 시도해 주세요.');
    } finally {
      button.disabled = false;
      button.textContent = submitText;
    }
  });
}

bindNicknameForm('create-form', 'create-error', '방 만들기', '방 만드는 중…', async (nickname, form) => {
  const api = await backend();
  uid = await api.connect();
  await api.waitForConnection();
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)),
    (number) => number.toString(16).padStart(2, '0')).join('');
  await api.createRoom(id, uid, nickname, form.get('startTime'));
  history.replaceState(null, '', `/r/${id}`);
  await enterRoom(id, true);
});

bindNicknameForm('join-form', 'join-error', '입장하기', '입장하는 중…', async (nickname) => {
  const key = nicknameKey(nickname);
  const alreadyTaken = Object.entries(room?.members ?? {})
    .some(([id, member]) => id !== uid && nicknameKey(member.nickname) === key);
  if (alreadyTaken) return false;
  const api = await backend();
  await api.waitForConnection();
  if (!await api.joinRoom(roomId, uid, nickname)) return false;
  const active = byId('status-actions').querySelector('[aria-pressed="true"]');
  active?.focus();
});

const removeDialog = byId('remove-dialog');
const confirmRemove = byId('confirm-remove');
const cancelRemove = byId('cancel-remove');
removeDialog.addEventListener('cancel', (event) => {
  if (confirmRemove.disabled) event.preventDefault();
});
byId('remove-form').addEventListener('submit', async (event) => {
  if (event.submitter !== confirmRemove) return;
  event.preventDefault();
  if (confirmRemove.disabled || uid !== room?.settings.hostId || !removeTarget) return;
  const member = room.members?.[removeTarget.id];
  if (!member) {
    removeDialog.close();
    return;
  }
  if (!online) {
    setText('remove-error', '연결이 끊겼어요. 다시 연결되면 시도해 주세요.');
    return;
  }

  confirmRemove.disabled = true;
  cancelRemove.disabled = true;
  setText('remove-error', '');
  setText('room-action-feedback', '');
  const key = nicknameKey(member.nickname);
  try {
    await (await backend()).removeMember(roomId, removeTarget.id,
      room.nicknames?.[key] === removeTarget.id ? key : null);
    removeDialog.close();
    setText('room-action-feedback', `${member.nickname} 님을 내보냈어요.`);
    byId('roster-title').focus();
  } catch {
    setText('remove-error', '참가자를 내보내지 못했어요. 다시 시도해 주세요.');
  } finally {
    confirmRemove.disabled = false;
    cancelRemove.disabled = false;
  }
});

const timeSettings = byId('time-settings');
byId('time-settings-summary').addEventListener('click', () => {
  if (timeSettings.open) return;
  setText('time-error', '');
  setText('time-feedback', '');
});

byId('time-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  if (!button || button.disabled || uid !== room?.settings.hostId) return;
  if (!online) {
    setText('time-error', '연결이 끊겼어요. 다시 연결되면 시도해 주세요.');
    return;
  }
  button.disabled = true;
  setText('time-error', '');
  const time = byId('new-start-time').value;
  try {
    if (time !== room.settings.startTime) await (await backend()).changeStartTime(roomId, time);
    timeSettings.open = false;
    setText('time-feedback', `시작 시간을 ${startLabel(time)}로 저장했어요.`);
    byId('time-settings-summary').focus();
  } catch {
    setText('time-error', '시작 시간을 저장하지 못했어요. 다시 시도해 주세요.');
  } finally {
    button.disabled = false;
  }
});

async function saveVote(status) {
  if (!online || pendingVote || !room?.members?.[uid]) return;
  pendingVote = true;
  byId('vote-feedback').removeAttribute('data-error');
  setText('vote-feedback', '');
  renderRoom();
  try {
    await (await backend()).vote(roomId, uid, status);
    setText('vote-feedback', `‘${STATUSES[status].label}’로 저장했어요.`);
  } catch {
    byId('vote-feedback').setAttribute('data-error', '');
    setText('vote-feedback', '상태를 저장하지 못했어요. 다시 시도해 주세요.');
  } finally {
    pendingVote = false;
    renderRoom();
  }
}

byId('retry').addEventListener('click', () => enterRoom(roomId, true));
byId('copy-link').addEventListener('click', async () => {
  const url = new URL(`/r/${roomId}`, location.origin).href;
  clearTimeout(copyTimer);
  try {
    await navigator.clipboard.writeText(url);
    byId('manual-copy').hidden = true;
    setText('copy-feedback', '링크를 복사했어요.');
    copyTimer = setTimeout(() => setText('copy-feedback', ''), 3000);
  } catch {
    byId('manual-copy').hidden = false;
    byId('invite-url').value = url;
    byId('invite-url').focus();
    byId('invite-url').select();
    setText('copy-feedback', '아래 주소를 복사해 주세요.');
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) renderRoom();
});
window.addEventListener('pageshow', renderRoom);

if (location.pathname === '/') {
  const recent = getRecent();
  if (isRoomId(recent)) {
    byId('recent-room').href = `/r/${recent}`;
    byId('recent-room').hidden = false;
  }
} else {
  const match = /^\/r\/([0-9a-f]{32})\/?$/.exec(location.pathname);
  if (match) enterRoom(match[1]);
  else showMessage('초대 링크를 확인해 주세요', '링크 주소가 올바르지 않아요.', { home: true });
}
