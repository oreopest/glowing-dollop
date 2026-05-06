/**
 * darkHelpers.js — Week generation & dark-set building utilities.
 *
 * TODO: DATE-PARSING / TIMEZONE WARNING
 * Using new Date('YYYY-MM-DD') is UTC midnight → off-by-one in US timezones.
 * parseLocalDate splits the string to avoid this. Future: use Temporal API.
 */

export function parseLocalDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateDisplay(date) {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

export function getMonday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

export function generateCampaignWeeks(startDate, endDate) {
  const weeks = [];
  let monday = getMonday(startDate);
  while (monday <= endDate) {
    const sunday = addDays(monday, 6);
    weeks.push({ monday: new Date(monday), sunday: new Date(sunday) });
    monday = addDays(monday, 7);
  }
  return weeks;
}

/**
 * Build dark dates Set. darkConfig.darkRanges is array of {start, end}.
 */
export function buildDarkDatesSet(darkConfig, startDate, endDate) {
  const darkSet = new Set();
  if (!darkConfig.darkEnabled) return darkSet;
  const startStr = formatDate(startDate);
  const endStr = formatDate(endDate);

  if (darkConfig.darkMode === 'range') {
    for (const range of (darkConfig.darkRanges || [])) {
      if (!range.start || !range.end) continue;
      const rs = parseLocalDate(range.start);
      const re = parseLocalDate(range.end);
      if (rs > re) continue;
      let cur = new Date(rs);
      while (cur <= re) {
        const ds = formatDate(cur);
        if (ds >= startStr && ds <= endStr) darkSet.add(ds);
        cur = addDays(cur, 1);
      }
    }
  } else if (darkConfig.darkMode === 'weeks') {
    for (const monStr of darkConfig.darkWeekOfMondays) {
      const mon = parseLocalDate(monStr);
      for (let i = 0; i < 7; i++) {
        const day = addDays(mon, i);
        const ds = formatDate(day);
        if (ds >= startStr && ds <= endStr) darkSet.add(ds);
      }
    }
  } else if (darkConfig.darkMode === 'dates') {
    for (const ds of darkConfig.darkSpecificDates) {
      if (ds >= startStr && ds <= endStr) darkSet.add(ds);
    }
  }
  return darkSet;
}

export function classifyWeek(weekObj, startDate, endDate, darkDatesSet) {
  const startStr = formatDate(startDate);
  const endStr = formatDate(endDate);
  let campaignDays = 0, activeDays = 0;
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekObj.monday, i);
    const ds = formatDate(day);
    if (ds >= startStr && ds <= endStr) {
      campaignDays++;
      if (!darkDatesSet.has(ds)) activeDays++;
    }
  }
  return {
    campaignDaysInWeek: campaignDays,
    activeDaysInWeek: activeDays,
    isDark: campaignDays === 7 && activeDays === 0,
  };
}
