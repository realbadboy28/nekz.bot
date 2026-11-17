const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isWithinSchedule, isAway, shouldAutoReply } = require('../src/away');

const at = (hours, minutes) => new Date(2026, 0, 1, hours, minutes, 0).getTime();

test('same-day schedule', () => {
  assert.equal(isWithinSchedule(at(10, 0), '09:00', '17:00'), true);
  assert.equal(isWithinSchedule(at(9, 0), '09:00', '17:00'), true);
  assert.equal(isWithinSchedule(at(17, 0), '09:00', '17:00'), false);
  assert.equal(isWithinSchedule(at(8, 59), '09:00', '17:00'), false);
});

test('overnight schedule', () => {
  assert.equal(isWithinSchedule(at(23, 30), '22:00', '07:00'), true);
  assert.equal(isWithinSchedule(at(6, 59), '22:00', '07:00'), true);
  assert.equal(isWithinSchedule(at(12, 0), '22:00', '07:00'), false);
});

test('missing schedule means always inside', () => {
  assert.equal(isWithinSchedule(at(12, 0), '', ''), true);
});

test('away mode requires the toggle and the schedule', () => {
  const config = { awayStart: '22:00', awayEnd: '07:00' };
  assert.equal(isAway(config, { away: false }, at(23, 0)), false);
  assert.equal(isAway(config, { away: true }, at(23, 0)), true);
  assert.equal(isAway(config, { away: true }, at(12, 0)), false);
  assert.equal(isAway({ awayStart: '', awayEnd: '' }, { away: true }, at(12, 0)), true);
});

test('cooldown is tracked per sender', () => {
  const state = { away: true, lastReplyAt: {} };
  const now = at(12, 0);

  assert.equal(shouldAutoReply(state, '111', now, 60000), true);

  state.lastReplyAt['111'] = now - 1000;
  assert.equal(shouldAutoReply(state, '111', now, 60000), false);
  assert.equal(shouldAutoReply(state, '222', now, 60000), true);

  state.lastReplyAt['111'] = now - 61000;
  assert.equal(shouldAutoReply(state, '111', now, 60000), true);
});
