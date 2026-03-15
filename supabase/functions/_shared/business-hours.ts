/**
 * Shared business-hours logic used by both shopify-webhook (real-time gating)
 * and flush-pending-notifications (queue flushing).
 *
 * Config shape stored in region_settings → operations.business_hours:
 * {
 *   "timezone": "Pacific/Honolulu",
 *   "start": "08:00",
 *   "end": "19:00",
 *   "active_days": [1,2,3,4,5,6]   // 0=Sun … 6=Sat (JS getDay)
 * }
 */

export interface BusinessHoursConfig {
  timezone: string;
  start: string;   // "HH:MM" 24-hour
  end: string;
  active_days: number[]; // 0–6
}

const DEFAULTS: BusinessHoursConfig = {
  timezone: 'Pacific/Honolulu',
  start: '08:00',
  end: '19:00',
  active_days: [1, 2, 3, 4, 5, 6],
};

const REGION_TZ_FALLBACK: Record<string, string> = {
  hawaii: 'Pacific/Honolulu',
  las_vegas: 'America/Los_Angeles',
};

/** Fetch the business-hours config for a region, falling back to defaults. */
export async function getBusinessHoursConfig(supabase: any, regionId: string): Promise<BusinessHoursConfig> {
  try {
    const { data } = await supabase
      .from('region_settings')
      .select('setting_value')
      .eq('region_id', regionId)
      .eq('setting_key', 'operations.business_hours')
      .single();

    if (data?.setting_value) {
      const v = data.setting_value;
      return {
        timezone: v.timezone || REGION_TZ_FALLBACK[regionId] || DEFAULTS.timezone,
        start: typeof v.start === 'string' ? v.start : DEFAULTS.start,
        end: typeof v.end === 'string' ? v.end : DEFAULTS.end,
        active_days: Array.isArray(v.active_days) ? v.active_days : DEFAULTS.active_days,
      };
    }
  } catch (_) {
    // use defaults
  }
  return { ...DEFAULTS, timezone: REGION_TZ_FALLBACK[regionId] || DEFAULTS.timezone };
}

/**
 * Parse "HH:MM" → { hour, minute }.
 */
function parseTime(t: string): { hour: number; minute: number } {
  const [h, m] = t.split(':').map(Number);
  return { hour: h || 0, minute: m || 0 };
}

/**
 * Get the current local hour, minute, and JS weekday (0=Sun) for a timezone.
 */
function nowInTimezone(timezone: string): { hour: number; minute: number; day: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(now);

  const hourVal = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  const minuteVal = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  const dayStr = parts.find(p => p.type === 'weekday')?.value ?? '';

  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dayMap[dayStr] ?? 0;

  return { hour: hourVal, minute: minuteVal, day };
}

/**
 * Returns whether the current time in the region is within the configured
 * business window. Handles both normal (08:00–19:00) and overnight (18:00–02:00)
 * windows correctly.
 *
 * For overnight windows (start >= end), the active period spans from `start`
 * until midnight on the current active day, plus midnight→end on the *next* active day.
 * Practically: if the current day is active and time >= start, we're within hours.
 * If the *previous* day was active and time < end, we're also within hours.
 */
export async function isWithinBusinessHours(
  supabase: any,
  regionId: string
): Promise<{ within: boolean; currentHour: number; timezone: string; day: number }> {
  const cfg = await getBusinessHoursConfig(supabase, regionId);
  const { hour, minute, day } = nowInTimezone(cfg.timezone);

  const startParsed = parseTime(cfg.start);
  const endParsed = parseTime(cfg.end);

  const currentMinutes = hour * 60 + minute;
  const startMinutes = startParsed.hour * 60 + startParsed.minute;
  const endMinutes = endParsed.hour * 60 + endParsed.minute;

  const isOvernight = startMinutes >= endMinutes;

  let within = false;

  if (isOvernight) {
    // Overnight window: e.g. 18:00 → 02:00
    // Part 1: today is active and time >= start
    if (cfg.active_days.includes(day) && currentMinutes >= startMinutes) {
      within = true;
    }
    // Part 2: *yesterday* was active and time < end
    const yesterday = (day + 6) % 7;
    if (cfg.active_days.includes(yesterday) && currentMinutes < endMinutes) {
      within = true;
    }
  } else {
    // Normal window: e.g. 08:00 → 19:00
    if (cfg.active_days.includes(day) && currentMinutes >= startMinutes && currentMinutes < endMinutes) {
      within = true;
    }
  }

  return { within, currentHour: hour, timezone: cfg.timezone, day };
}
