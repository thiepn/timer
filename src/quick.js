const DEFAULT_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_MS = 1000;

function success(ms, source) {
  return { ok: true, ms: Math.round(ms), source: String(source ?? '').trim() };
}

function failure(error, source) {
  return { ok: false, ms: null, error, source: String(source ?? '').trim() };
}

export function parseDurationInput(value, { minMs = MIN_MS, maxMs = DEFAULT_MAX_MS } = {}) {
  const source = String(value ?? '').trim();
  if (!source) return failure('Enter a duration.', source);

  let totalMs = null;

  // Colon notation: m:ss or h:mm:ss. The right-hand fields must be clock-like.
  if (/^\d+(?::\d{1,2}){1,2}$/.test(source)) {
    const parts = source.split(':').map(Number);
    if (parts.length === 2) {
      const [minutes, seconds] = parts;
      if (seconds >= 60) return failure('Seconds must be below 60 in m:ss format.', source);
      totalMs = (minutes * 60 + seconds) * 1000;
    } else {
      const [hours, minutes, seconds] = parts;
      if (minutes >= 60 || seconds >= 60) return failure('Minutes and seconds must be below 60 in h:mm:ss format.', source);
      totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
    }
  } else if (/^\d+(?:\.\d+)?$/.test(source)) {
    // A bare number is intentionally seconds. "90" therefore means 90 seconds.
    totalMs = Number(source) * 1000;
  } else {
    // Unit notation: 1h 20m, 3m, 90s, 1.5m, with or without spaces.
    const compact = source.toLowerCase().replace(/\s+/g, '');
    const token = /(\d+(?:\.\d+)?)(d|h|m|s)/g;
    let cursor = 0;
    let totalSeconds = 0;
    let match;
    let tokens = 0;
    while ((match = token.exec(compact))) {
      if (match.index !== cursor) return failure('Use durations like 90s, 3m, 1:30, or 1h 20m.', source);
      const amount = Number(match[1]);
      const unit = match[2];
      const multiplier = unit === 'd' ? 86400 : unit === 'h' ? 3600 : unit === 'm' ? 60 : 1;
      totalSeconds += amount * multiplier;
      cursor = token.lastIndex;
      tokens += 1;
    }
    if (!tokens || cursor !== compact.length) return failure('Use durations like 90s, 3m, 1:30, or 1h 20m.', source);
    totalMs = totalSeconds * 1000;
  }

  if (!Number.isFinite(totalMs) || totalMs < minMs) return failure(`Duration must be at least ${Math.ceil(minMs / 1000)} second${minMs > 1000 ? 's' : ''}.`, source);
  if (totalMs > maxMs) return failure('That duration is longer than the Quick Timer limit.', source);
  return success(totalMs, source);
}

export function quickDurationDial(milliseconds) {
  const ms = Math.max(MIN_MS, Math.round(Number(milliseconds) || MIN_MS));
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const withinHourSeconds = totalSeconds % 3600;
  const ratio = hours > 0 && withinHourSeconds === 0 ? 1 : withinHourSeconds / 3600;
  return {
    hours,
    withinHourSeconds,
    sweepDegrees: Math.max(2, Math.min(360, Math.round(ratio * 360)))
  };
}

export function durationInputText(milliseconds) {
  const totalSeconds = Math.max(1, Math.round(Number(milliseconds || 0) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || !parts.length) parts.push(`${seconds}s`);
  return parts.join(' ');
}

export function normalizeDurationList(values, { limit = 8, minMs = MIN_MS, maxMs = DEFAULT_MAX_MS } = {}) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const ms = Math.round(Number(value));
    if (!Number.isFinite(ms) || ms < minMs || ms > maxMs || seen.has(ms)) continue;
    seen.add(ms);
    out.push(ms);
    if (out.length >= limit) break;
  }
  return out;
}

export function pushRecentDuration(values, milliseconds, limit = 8) {
  const ms = Math.round(Number(milliseconds));
  if (!Number.isFinite(ms) || ms < MIN_MS || ms > DEFAULT_MAX_MS) return normalizeDurationList(values, { limit });
  return normalizeDurationList([ms, ...(values || []).filter((value) => Number(value) !== ms)], { limit });
}

export const DEFAULT_QUICK_PRESETS = Object.freeze([30000, 60000, 120000, 180000, 300000, 600000]);
export const DEFAULT_QUICK_ADJUSTMENTS = Object.freeze([10000, 30000, 60000]);
