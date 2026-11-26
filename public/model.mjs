const day = 86_400_000;
const koreaOffset = 9 * 60 * 60 * 1000;

export const TEAM_SIZE = 5;
export const STATUSES = {
  yes: { label: '한다', hint: '시간 맞춰 참여할게요' },
  maybe: { label: '부족하면 한다', hint: '인원이 모자라면 합류할게요' },
  no: { label: '안 한다', hint: '오늘은 참여하지 않아요' },
};

export const isRoomId = (value) => /^[0-9a-f]{32}$/.test(value ?? '');
export const normalizeNickname = (value) => value.trim();

export function nicknameKey(nickname) {
  const key = normalizeNickname(nickname).toLowerCase()
    .replaceAll('%', '%25')
    .replaceAll('.', '%2e')
    .replaceAll('#', '%23')
    .replaceAll('$', '%24')
    .replaceAll('/', '%2f')
    .replaceAll('[', '%5b')
    .replaceAll(']', '%5d');
  return `n:${key}`;
}

export function dayKey(time) {
  return Math.floor((time + koreaOffset) / day);
}

export function nextResetDelay(time) {
  return (dayKey(time) + 1) * day - koreaOffset - time;
}

export function effectiveStatus(member, now) {
  const isToday = dayKey(member.updatedAt) === dayKey(now);
  return isToday && Object.hasOwn(STATUSES, member.status) ? member.status : 'no';
}

export function getRoster(room, now) {
  const hostId = room.settings.hostId;
  return Object.entries(room.members ?? {})
    .map(([id, member]) => ({ ...member, id, status: effectiveStatus(member, now) }))
    .sort((a, b) => Number(b.id === hostId) - Number(a.id === hostId)
      || a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
}

export function groupRoster(roster) {
  return {
    confirmed: roster.filter(({ status }) => status === 'yes'),
    waiting: [...roster.filter(({ status }) => status === 'maybe'), ...roster.filter(({ status }) => status === 'no')],
  };
}

export function startLabel(time) {
  const [hours, minutes] = time.split(':');
  return `${Number(hours) < 12 ? '오전' : '오후'} ${Number(hours) % 12 || 12}:${minutes}`;
}
