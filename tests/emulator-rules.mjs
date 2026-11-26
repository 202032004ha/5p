import { nicknameKey } from '../public/model.mjs';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const authOrigin = 'http://127.0.0.1:9299/identitytoolkit.googleapis.com';
const dbOrigin = 'http://127.0.0.1:9500';
const namespace = 'demo-jaraeng-default-rtdb';

async function user() {
  const response = await fetch(authOrigin + '/v1/accounts:signUp?key=demo-local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  assert.equal(response.ok, true);
  return response.json();
}

async function request(path, who, method = 'GET', data) {
  const query = new URLSearchParams({ ns: namespace });
  if (who) query.set('auth', who.idToken);
  const response = await fetch(dbOrigin + '/' + path + '.json?' + query, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return [response.status, await response.json()];
}

const [owner, guest, first, second] = await Promise.all([user(), user(), user(), user()]);
const room = 'rooms/' + randomBytes(16).toString('hex');
const stamp = { '.sv': 'timestamp' };
const member = { nickname: '테스트 방장', status: 'yes', joinedAt: stamp, updatedAt: stamp };
const visitor = { ...member, nickname: 'M.ID#[%]/' };
const guestKey = nicknameKey(visitor.nickname);
const settings = { hostId: owner.localId, startTime: '21:00' };
const creation = { settings, members: { [owner.localId]: member }, nicknames: { [nicknameKey(member.nickname)]: owner.localId } };
const check = async (label, code, ...parameters) => {
  const [actual, value] = await request(...parameters);
  assert.equal(actual, code, label + ' ' + JSON.stringify(value));
  console.log('PASS ' + label);
};
await check('authenticated creator can atomically create a room', 200, room, owner, 'PUT', creation);
await check('authenticated invite can read a single room', 200, room, guest);
await check('guest cannot add a member without claiming the nickname', 401, room + '/members/' + guest.localId, guest, 'PUT', visitor);
await check('guest can claim punctuation nickname with own membership', 200, room, guest, 'PATCH', {
  ['members/' + guest.localId]: visitor, ['nicknames/' + guestKey]: guest.localId,
});
await check('guest cannot overwrite another nickname reservation', 401, room + '/nicknames/' + nicknameKey(member.nickname), guest, 'PUT', guest.localId);
const sameKey = nicknameKey('겹치는닉');
const compete = (who) => request(room, who, 'PATCH', {
  ['members/' + who.localId]: { ...member, nickname: '겹치는닉' },
  ['nicknames/' + sameKey]: who.localId,
});
const results = await Promise.all([compete(first), compete(second)]);
assert.deepEqual(results.map(([code]) => code).sort(), [200, 401]);
console.log('PASS simultaneous duplicate claims create one participant');
const [, resultRoom] = await request(room, owner);
assert.equal(Object.keys(resultRoom.members).length, 3);
await check('nickname reservation cannot exist without matching card', 401, room + '/nicknames/' + nicknameKey('빈 닉네임'), guest, 'PUT', guest.localId);
await check('member can vote with server timestamp', 200, room + '/members/' + guest.localId, guest, 'PATCH', { status: 'maybe', updatedAt: stamp });
await check('unauthenticated reads are blocked', 401, room);
await check('rooms cannot be enumerated', 401, 'rooms', guest);
await check('guest cannot change another participant', 401, room + '/members/' + owner.localId, guest, 'PATCH', { status: 'no', updatedAt: stamp });
await check('guest cannot change scheduled time', 401, room + '/settings/startTime', guest, 'PUT', '20:00');
await check('unknown status is blocked', 401, room + '/members/' + guest.localId, guest, 'PATCH', { status: 'other', updatedAt: stamp });
await check('forged future timestamp is blocked', 401, room + '/members/' + guest.localId, guest, 'PATCH', { status: 'yes', updatedAt: Date.now() + 86400000 });
await check('host cannot create someone else’s member', 401, 'rooms/' + randomBytes(16).toString('hex'), owner, 'PUT', { settings, members: { ...creation.members, [guest.localId]: member } });
await check('malformed start time is blocked', 401, 'rooms/' + randomBytes(16).toString('hex'), owner, 'PUT', { ...creation, settings: { ...settings, startTime: '25:00' } });
await check('status updates must include a current timestamp', 401, room + '/members/' + guest.localId + '/status', guest, 'PUT', 'yes');
await check('guest cannot delete another participant or release their nickname', 401, room, guest, 'PATCH', {
  ['members/' + owner.localId]: null, ['nicknames/' + nicknameKey(member.nickname)]: null,
});
await check('host cannot drop their own card', 401, room, owner, 'PATCH', {
  ['members/' + owner.localId]: null, ['nicknames/' + nicknameKey(member.nickname)]: null,
});
await check('host cannot leave a stale nickname by deleting only the card', 401, room + '/members/' + guest.localId, owner, 'DELETE');
await check('host cannot release a nickname while its card is present', 401, room + '/nicknames/' + guestKey.replaceAll('%', '%25'), owner, 'DELETE');
await check('host can remove a participant and release their nickname atomically', 200, room, owner, 'PATCH', {
  ['members/' + guest.localId]: null, ['nicknames/' + guestKey]: null,
});
await check('removed participant can rejoin with same identity and nickname', 200, room, guest, 'PATCH', {
  ['members/' + guest.localId]: visitor, ['nicknames/' + guestKey]: guest.localId,
});
await check('host can edit the scheduled time', 200, room + '/settings/startTime', owner, 'PUT', '23:05');
await check('host cannot save an invalid time', 401, room + '/settings/startTime', owner, 'PUT', '26:00');
