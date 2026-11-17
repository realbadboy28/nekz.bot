function parseClock(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

function isWithinSchedule(now, start, end) {
  const from = parseClock(start);
  const to = parseClock(end);
  if (from === null || to === null) return true;
  if (from === to) return true;

  const date = new Date(now);
  const minutes = date.getHours() * 60 + date.getMinutes();

  if (from < to) return minutes >= from && minutes < to;
  return minutes >= from || minutes < to;
}

function isAway(config, state, now) {
  if (!state || !state.away) return false;
  return isWithinSchedule(now, config.awayStart, config.awayEnd);
}

function shouldAutoReply(state, from, now, cooldownMs) {
  const last = state && state.lastReplyAt ? state.lastReplyAt[from] : undefined;
  return !last || now - last >= cooldownMs;
}

function markReplied(state, from, now) {
  if (!state) return;
  state.lastReplyAt = { ...(state.lastReplyAt || {}), [from]: now };
}

module.exports = { parseClock, isWithinSchedule, isAway, shouldAutoReply, markReplied };
