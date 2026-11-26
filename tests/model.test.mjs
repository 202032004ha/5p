import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, effectiveStatus, getRoster, groupRoster, isRoomId, nicknameKey, nextResetDelay, normalizeNickname, startLabel } from '../public/model.mjs';

const midnight = Date.parse('2026-11-26T15:00:00Z');

test('responses expire precisely at midnight in Seoul', () => {
  assert.notEqual(dayKey(midnight - 1), dayKey(midnight));
  assert.equal(effectiveStatus({ status: 'yes', updatedAt: midnight - 1 }, midnight - 1), 'yes');
  assert.equal(effectiveStatus({ status: 'yes', updatedAt: midnight - 1 }, midnight), 'no');
  assert.equal(effectiveStatus({ status: 'maybe', updatedAt: midnight - 1 }, midnight), 'no');
  assert.equal(effectiveStatus({ status: 'maybe', updatedAt: midnight }, midnight), 'maybe');
  assert.equal(nextResetDelay(midnight - 1), 1);
  assert.equal(nextResetDelay(midnight), 86400000);
});

test('the host is first, a future response is not counted until its day, and yellow stays separate', () => {
  const members = {
    later: { nickname: '복숭아', joinedAt: midnight + 2, updatedAt: midnight, status: 'yes' },
    host: { nickname: '방장', joinedAt: midnight + 3, updatedAt: midnight, status: 'maybe' },
    old: { nickname: '이전', joinedAt: midnight - 10, updatedAt: midnight - 1, status: 'yes' },
    future: { nickname: '다음', joinedAt: midnight + 4, updatedAt: midnight + 86400000, status: 'yes' },
  };
  const roster = getRoster({ settings: { hostId: 'host' }, members }, midnight);
  assert.deepEqual(roster.map(({ id, status }) => [id, status]), [
    ['host', 'maybe'], ['old', 'no'], ['later', 'yes'], ['future', 'no'],
  ]);
});

test('invites, Korean nicknames and displayed times use consistent inputs', () => {
  assert.equal(isRoomId('a0'.repeat(16)), true);
  assert.equal(isRoomId('abc/foo'), false);
  assert.equal(normalizeNickname('  소환사  '), '소환사');
  assert.equal(normalizeNickname('   '), '');
  assert.equal(startLabel('21:30'), '오후 9:30');
  assert.equal(startLabel('00:00'), '오전 12:00');
});

test('status groups keep all ten people and promote or demote a card as its status changes', () => {
  const roster = Array.from({ length: 10 }, (_, id) => ({
    id, status: id < 6 ? 'yes' : id < 8 ? 'maybe' : 'no',
  }));
  const first = groupRoster(roster);
  assert.deepEqual(first.confirmed.map(({ id }) => id), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(first.waiting.map(({ id }) => id), [6, 7, 8, 9]);
  roster[0].status = 'no';
  roster[6].status = 'yes';
  const second = groupRoster(roster);
  assert.deepEqual(second.confirmed.map(({ id }) => id), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(second.waiting.map(({ id }) => id), [7, 0, 8, 9]);
});

test('nickname keys ignore outside spaces and case while keeping punctuation unambiguous', () => {
  assert.equal(nicknameKey('  MID#1 '), nicknameKey('mid#1'));
  assert.notEqual(nicknameKey('mid#1'), nicknameKey('mid%231'));
  assert.equal(nicknameKey('가/나.다$라[마]'), 'n:가%2f나%2e다%24라%5b마%5d');
});
