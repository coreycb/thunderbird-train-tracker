// Use global fetch (Node 18+) and a tiny ICS parser below to avoid external deps.

const PRODUCT_DETAILS_URL = "https://product-details.mozilla.org/1.0/thunderbird_versions.json";
const CALENDAR_ICS_URL = "https://calendar.google.com/calendar/ical/c_f7b7f2cea6f65593ef05afaf2abfcfb48f87e25794468cd4a19d16495d17b6d1%40group.calendar.google.com/public/basic.ics";
const ANDROID_NIGHTLY_URL = "https://ftp.mozilla.org/pub/thunderbird-mobile/android/nightly/latest-main/";
const ANDROID_TAGS_URL = "https://api.github.com/repos/thunderbird/thunderbird-android/tags?per_page=100";

/**
 * Checks if a calendar event summary is related to an Android milestone.
 *
 * @param {string} summary - The event summary text to check
 * @returns {boolean} True if the summary indicates an Android milestone
 */
function isAndroidMilestoneSummary(summary = "") {
  if (!summary) return false;
  const text = summary.toString();
  return /^(TfA|TFA)\b/i.test(text) ||
    /Thunderbird\s*(for\s+)?Android/i.test(text) ||
    /\bTbA\b/i.test(text);
}

/**
 * Extracts the major version number from a version string.
 *
 * @param {string} version - Version string (e.g., "132.0b3")
 * @returns {string|null} The major version number or null if not found
 */
function extractMajor(version) {
  if (!version) return null;
  const m = version.match(/(\d+)/);
  return m ? m[1] : null;
}

/**
 * Fetches desktop Thunderbird version information from Mozilla product-details API.
 *
 * @returns {Promise<Object>} Object with daily, release, beta, esr_current, and esr_next versions
 * @throws {Error} If the product details API request fails
 */
export async function getVersions() {
  const res = await fetch(PRODUCT_DETAILS_URL, { method: 'GET' });
  if (!res.ok) throw new Error('Failed to fetch product details: ' + res.status);
  const data = await res.json();
  return {
    daily: data.LATEST_THUNDERBIRD_NIGHTLY_VERSION || null,
    release: data.LATEST_THUNDERBIRD_VERSION || null,
    beta: data.LATEST_THUNDERBIRD_DEVEL_VERSION || null,
    esr_current: data.THUNDERBIRD_ESR || null,
    esr_next: data.THUNDERBIRD_ESR_NEXT || null,
  };
}

/**
 * Fetches the Android nightly version from Mozilla FTP by parsing the directory listing.
 *
 * @returns {Promise<string|null>} The nightly version string or null if not found
 */
async function getAndroidNightlyVersion() {
  try {
    const res = await fetch(ANDROID_NIGHTLY_URL, { method: 'GET' });
    if (!res.ok) return null;
    const text = await res.text();
    const match = text.match(/thunderbird-([0-9]+\.[0-9]+a1)\.apk/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Converts a GitHub tag name to a version string.
 * Examples: THUNDERBIRD_14_0 -> "14.0", THUNDERBIRD_14_0b1 -> "14.0b1"
 *
 * @param {string} tag - GitHub tag name (e.g., "THUNDERBIRD_14_0b1")
 * @returns {string|null} Formatted version string or null if invalid
 */
function parseAndroidTagToVersion(tag) {
  if (!tag || !tag.startsWith('THUNDERBIRD_')) return null;
  const parts = tag.replace(/^THUNDERBIRD_/, '').split('_');
  if (parts.length === 0) return null;
  const [major, ...rest] = parts;
  let version = major;
  for (const raw of rest) {
    const lower = raw.toLowerCase();
    const prereleaseMatch = lower.match(/^(\d+)([ab])(\d+)$/);
    if (prereleaseMatch) {
      const [, num, phase, build] = prereleaseMatch;
      version += `.${num}${phase}${build}`;
    } else {
      version += `.${raw}`;
    }
  }
  return version;
}

/**
 * Fetches Android beta and release versions from GitHub tags API.
 * Identifies beta versions by 'b' suffix and release versions by lack of pre-release suffix.
 *
 * @returns {Promise<Object>} Object with release and beta version strings
 */
async function getAndroidTagVersions() {
  try {
    const res = await fetch(ANDROID_TAGS_URL, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'thunderbird-version-tracker'
      }
    });
    if (!res.ok) return { release: null, beta: null };
    const data = await res.json();
    if (!Array.isArray(data)) return { release: null, beta: null };

    const tagNames = data.map(t => t?.name || '').filter(Boolean);
    let betaVersion = null;
    let releaseVersion = null;

    for (const name of tagNames) {
      if (!name.startsWith('THUNDERBIRD_')) continue;
      if (!betaVersion && /b\d+/i.test(name)) {
        betaVersion = parseAndroidTagToVersion(name);
      }
      if (!releaseVersion && !/b\d+/i.test(name) && !/a\d+/i.test(name)) {
        releaseVersion = parseAndroidTagToVersion(name);
      }
      if (betaVersion && releaseVersion) break;
    }

    return { release: releaseVersion, beta: betaVersion };
  } catch {
    return { release: null, beta: null };
  }
}

/**
 * Fetches all Android version information (daily, beta, release).
 * Combines data from FTP nightly builds and GitHub tags.
 *
 * @returns {Promise<Object>} Object with daily, beta, and release versions
 */
async function getAndroidVersions() {
  const [nightly, tagVersions] = await Promise.all([
    getAndroidNightlyVersion(),
    getAndroidTagVersions()
  ]);
  return {
    daily: nightly,
    beta: tagVersions.beta,
    release: tagVersions.release
  };
}

/**
 * Fetches and parses calendar events from the public Google Calendar ICS feed.
 * Extracts SUMMARY, DTSTART, DTEND, and DESCRIPTION fields from VEVENT blocks.
 *
 * @returns {Promise<Array>} Array of event objects sorted by start date
 * @throws {Error} If the calendar fetch fails
 */
export async function getCalendarEvents() {
  const res = await fetch(CALENDAR_ICS_URL, { method: 'GET' });
  if (!res.ok) throw new Error('Failed to fetch calendar: ' + res.status);
  const raw = await res.text();
  // Minimal ICS parsing: find VEVENT blocks and extract SUMMARY, DTSTART, DTEND
  const events = [];
  const vevents = raw.split(/BEGIN:VEVENT/).slice(1);
  for (let block of vevents) {
    // unfold folded lines (lines that start with space are continuations)
    block = block.replace(/\r?\n[ \t]/g, '');
    const lines = block.split(/\r?\n/);
    const ev = { summary: '', start: null, end: null, description: '' };
    for (let line of lines) {
      if (!line) continue;
      const [key, ...rest] = line.split(':');
      const value = rest.join(':');
      if (key.startsWith('SUMMARY')) ev.summary = value;
      if (key.startsWith('DESCRIPTION')) ev.description = value;
      if (key.startsWith('DTSTART')) {
        const parsed = parseIcsDate(value);
        if (parsed) ev.start = parsed;
      }
      if (key.startsWith('DTEND')) {
        const parsed = parseIcsDate(value);
        if (parsed) ev.end = parsed;
      }
    }
    events.push(ev);
  }
  // sort by start date
  events.sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  return events;
}

/**
 * Finds the most relevant calendar event for a desktop Thunderbird version.
 * Tries exact version match, then major version match, then upcoming Thunderbird events.
 *
 * @param {Array} events - Array of calendar event objects
 * @param {string} version - Version string to match (e.g., "132.0b3")
 * @returns {Object|null} Best matching event or null if none found
 */
function findBestDesktopEvent(events, version) {
  if (!version) return null;
  const major = extractMajor(version);
  // prefer events that include the full version
  for (const ev of events) {
    if (ev.summary && ev.summary.includes(version)) return ev;
  }
  // then prefer events that include the major version as a token
  if (major) {
    const majorRe = new RegExp("\\b" + major + "\\b");
    for (const ev of events) {
      if (ev.summary && majorRe.test(ev.summary)) return ev;
    }
  }
  // fallback: find an event whose summary mentions "Thunderbird" and a date after now
  const now = new Date().toISOString();
  for (const ev of events) {
    if (ev.summary && /Thunderbird/i.test(ev.summary) && ev.start && ev.start >= now) return ev;
  }
  return null;
}

/**
 * Finds the most relevant calendar event for an Android Thunderbird version.
 * Filters events to Android-specific milestones and matches by version.
 *
 * @param {Array} events - Array of calendar event objects
 * @param {string} version - Version string to match
 * @returns {Object|null} Best matching Android event or null if none found
 */
function findBestAndroidEvent(events, version) {
  const androidEvents = (events || []).filter(ev => isAndroidMilestoneSummary(ev?.summary));
  if (androidEvents.length === 0) return null;
  if (version) {
    const lower = version.toLowerCase();
    for (const ev of androidEvents) {
      if (ev.summary && ev.summary.toLowerCase().includes(lower)) return ev;
    }
    const major = extractMajor(version);
    if (major) {
      const majorRe = new RegExp("\\b" + major + "\\b");
      for (const ev of androidEvents) {
        if (ev.summary && majorRe.test(ev.summary)) return ev;
      }
    }
  }
  return androidEvents[androidEvents.length - 1] || androidEvents[0] || null;
}

/**
 * Parses an ICS date string to ISO format.
 * Handles both datetime (20251004T120000Z) and date-only (20251004) formats.
 *
 * @param {string} value - ICS date string
 * @returns {string|null} ISO date string or null if parsing fails
 */
function parseIcsDate(value) {
  if (!value) return null;
  // value can be like 20251004T120000Z or 20251004 (date only)
  try {
    if (/^\d{8}T\d{6}Z?$/.test(value)) {
      // ensure Z for UTC times is handled by Date
      const v = value.endsWith('Z') ? value : value + 'Z';
      const d = new Date(v);
      if (isNaN(d)) return null;
      return d.toISOString();
    }
    if (/^\d{8}$/.test(value)) {
      // date-only: treat as local midnight
      const y = value.slice(0,4); const m = value.slice(4,6); const day = value.slice(6,8);
      const d = new Date(Number(y), Number(m)-1, Number(day));
      if (isNaN(d)) return null;
      return d.toISOString();
    }
    // fallback, try Date constructor
    const d = new Date(value);
    if (isNaN(d)) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

/**
 * Fetches complete Thunderbird status including versions and milestone dates.
 * Aggregates data from product-details, FTP, GitHub, and Google Calendar.
 * Matches calendar events to each channel's version.
 *
 * @returns {Promise<Object>} Object containing fetchedAt timestamp, channels data, and events array
 * @throws {Error} If any required data source fails
 */
export async function getStatus() {
  const [desktopVersions, androidVersions, events] = await Promise.all([
    getVersions(),
    getAndroidVersions(),
    getCalendarEvents()
  ]);

  const channels = {
    desktop: {
      daily: { version: desktopVersions.daily, milestone: null },
      release: { version: desktopVersions.release, milestone: null },
      beta: { version: desktopVersions.beta, milestone: null },
      esr_current: { version: desktopVersions.esr_current, milestone: null },
      esr_next: { version: desktopVersions.esr_next, milestone: null }
    },
    android: {
      release: { version: androidVersions.release, milestone: null },
      beta: { version: androidVersions.beta, milestone: null },
      daily: { version: androidVersions.daily, milestone: null }
    }
  };

  for (const key of Object.keys(channels.desktop)) {
    const record = channels.desktop[key];
    const ev = findBestDesktopEvent(events, record.version);
    record.milestone = ev ? ev.start : null;
    if (ev) record.eventSummary = ev.summary;
  }

  for (const key of Object.keys(channels.android)) {
    const record = channels.android[key];
    const ev = findBestAndroidEvent(events, record.version);
    record.milestone = ev ? ev.start : null;
    if (ev) record.eventSummary = ev.summary;
  }

  return {
    fetchedAt: new Date().toISOString(),
    channels,
    events,
  };
}
