const DESKTOP_CHANNELS = [
  { key: 'esr_current', statusGroup: 'desktop', statusKey: 'esr_current', name: 'ESR (current)', hint: 'Current ESR', img: '/images/TB-Logo-ESR.png', platform: 'desktop' },
  { key: 'esr_next', statusGroup: 'desktop', statusKey: 'esr_next', name: 'ESR (next)', hint: 'Next ESR', img: '/images/TB-Logo-ESR.png', platform: 'desktop' },
  { key: 'release', statusGroup: 'desktop', statusKey: 'release', name: 'Release', hint: 'Stable release channel', img: '/images/TB-Logo-release.png', platform: 'desktop' },
  { key: 'beta', statusGroup: 'desktop', statusKey: 'beta', name: 'Beta', hint: 'Beta testing channel', img: '/images/TB-Logo-beta.png', platform: 'desktop' },
  { key: 'daily', statusGroup: 'desktop', statusKey: 'daily', name: 'Daily', hint: 'Cutting-edge nightly builds', img: '/images/TB-Logo-nightly.png', platform: 'desktop' },
];

const ANDROID_CHANNELS = [
  { key: 'android_release', statusGroup: 'android', statusKey: 'release', name: 'Release', hint: 'Stable Android release channel', img: '/images/TB-Logo-release.png', platform: 'android' },
  { key: 'android_beta', statusGroup: 'android', statusKey: 'beta', name: 'Beta', hint: 'Android beta testing channel', img: '/images/TB-Logo-beta.png', platform: 'android' },
  { key: 'android_daily', statusGroup: 'android', statusKey: 'daily', name: 'Daily', hint: 'Android nightly builds', img: '/images/TB-Logo-nightly.png', platform: 'android' },
];

console.info('Thunderbird Train Tracker milestone tables build loaded (2025-10-07).');

/**
 * Fetches the current status data from the server API.
 *
 * @returns {Promise<Object>} Status object containing channels and events
 * @throws {Error} If the API request fails
 */
async function fetchStatus() {
  const res = await fetch('/api/status');
  if (!res.ok) throw new Error('Failed to load status');
  return await res.json();
}

/**
 * Formats an ISO date string to a readable long format.
 *
 * @param {string} iso - ISO date string
 * @returns {string} Formatted date (e.g., "October 14, 2025") or "—" if invalid
 */
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Formats an ISO date string to a short readable format.
 *
 * @param {string} iso - ISO date string
 * @returns {string} Formatted date (e.g., "October 14, 2025") or "—" if invalid
 */
function formatDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Calculates the number of days until a target date.
 *
 * @param {string} iso - ISO date string
 * @returns {number|null} Number of days until the date, or null if past or invalid
 */
function calculateDaysUntil(iso) {
  if (!iso) return null;
  const target = new Date(iso);
  const now = new Date();
  const diffTime = target - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : null;
}

/**
 * Checks if a calendar event is Android-related based on its summary.
 *
 * @param {Object} event - Calendar event object
 * @returns {boolean} True if the event is an Android milestone
 */
function isAndroidMilestone(event) {
  if (!event) return false;
  const summary = event.summary || '';
  return /^(TfA|TFA)\b/i.test(summary) ||
    /Thunderbird\s*(for\s+)?Android/i.test(summary) ||
    /\bTbA\b/i.test(summary);
}

/**
 * Updates the countdown banner with the next major release information.
 * Uses hardcoded dates for known releases and falls back to calendar events.
 *
 * @param {Object} status - Status object from the API
 */
function updateCountdownBanner(status) {
  const banner = document.getElementById('countdown-banner');
  if (!banner) return;

  const versionEl = document.getElementById('countdown-version');
  const dateEl = document.getElementById('countdown-date');
  const remainingEl = document.getElementById('countdown-remaining');
  if (!versionEl || !dateEl || !remainingEl) {
    banner.style.display = 'none';
    return;
  }

  const releaseData = status?.channels?.desktop?.release || {};

  if (!releaseData.version) {
    banner.style.display = 'none';
    return;
  }

  // Extract next major version from current release
  const currentMajor = parseInt(releaseData.version.match(/(\d+)/)?.[1] || '0');
  const nextMajor = currentMajor + 1;

  // Hardcoded known release dates
  const knownReleases = {
    144: '2025-10-14T16:00:00Z'
  };

  let nextReleaseDate = null;
  let useKnownDate = false;

  // Check if we have a hardcoded date for the next major version
  if (knownReleases[nextMajor]) {
    nextReleaseDate = knownReleases[nextMajor];
    useKnownDate = true;
  } else {
    // Find events for the next major version from calendar
    const nextReleaseEvents = (status.events || []).filter(ev =>
      ev.summary && new RegExp('\\b' + nextMajor + '\\b').test(ev.summary) &&
      ev.summary.toLowerCase().includes('release')
    );

    if (nextReleaseEvents.length === 0) {
      banner.style.display = 'none';
      return;
    }

    // Use the earliest release event
    const nextRelease = nextReleaseEvents.sort((a, b) => (a.start || '').localeCompare(b.start || ''))[0];
    nextReleaseDate = nextRelease.start;
  }

  const daysUntil = calculateDaysUntil(nextReleaseDate);

  if (!daysUntil || daysUntil < 0) {
    banner.style.display = 'none';
    return;
  }

  // Update banner content
  versionEl.textContent = `Thunderbird ${nextMajor}.0`;
  dateEl.textContent = formatDateShort(nextReleaseDate);
  remainingEl.textContent = daysUntil;

  banner.style.display = 'block';
}

/**
 * Filters calendar events for a specific channel (desktop or Android).
 *
 * @param {Array} events - Array of calendar events
 * @param {Object} channelDef - Channel definition object
 * @returns {Array} Filtered events relevant to the channel
 */
function filterEventsForChannel(events, channelDef) {
  const list = events || [];
  if (channelDef.platform === 'android') {
    const androidEvents = list.filter(ev => isAndroidMilestone(ev));
    return androidEvents;
  }
  return list.filter(ev => !ev.summary || !/^TfA/i.test(ev.summary));
}

/**
 * Builds a channel card DOM element with icon, name, version, and action button.
 *
 * @param {Object} channelDef - Channel definition object
 * @param {Object} channelData - Channel data with version and milestone
 * @param {Array} allEvents - All calendar events
 * @returns {HTMLElement} Article element representing the channel card
 */
function buildCard(channelDef, channelData, allEvents) {
  const article = document.createElement('article');
  article.className = 'channel';
  article.setAttribute('data-channel', channelDef.key);
  article.dataset.platform = channelDef.platform;

  const icon = document.createElement('div');
  icon.className = 'channel-icon';
  const imgUrl = channelDef.img;
  if (imgUrl) {
    const img = document.createElement('img');
    img.src = imgUrl;
    img.alt = channelDef.name;
    icon.appendChild(img);
  } else {
    const fallback = document.createElement('span');
    fallback.textContent = channelDef.name.slice(0, 1).toUpperCase();
    icon.appendChild(fallback);
  }

  const name = document.createElement('span');
  name.className = 'channel-name';
  name.textContent = channelDef.name;

  const version = document.createElement('span');
  version.className = 'channel-version';
  if (channelData.version) {
    version.textContent = channelData.version;
  } else {
    version.textContent = '—';
    version.classList.add('is-empty');
  }

  const action = document.createElement('button');
  action.className = 'channel-action';
  action.type = 'button';
  action.textContent = 'Milestones';
  action.addEventListener('click', () => openModal(channelDef, channelData, allEvents));

  article.appendChild(icon);
  article.appendChild(name);
  article.appendChild(version);
  article.appendChild(action);

  return article;
}

/**
 * Opens the milestone modal dialog for a specific channel.
 * Filters and displays relevant calendar events in a table.
 *
 * @param {Object} channelDef - Channel definition object
 * @param {Object} channelData - Channel data with version information
 * @param {Array} allEvents - All calendar events to filter from
 */
function openModal(channelDef, channelData, allEvents) {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');
  const title = document.getElementById('modal-title');
  title.textContent = `${channelDef.name} — ${channelData.version || '—'}`;
  // filter events by full version first, then by major-version token (e.g. '145' for 145.0a1)
  const version = channelData.version || '';
  let major = null;
  let candidates = [];
  const isEsrChannel = channelDef.key.startsWith('esr');

  if (version) {
    // Extract major version number
    major = (version.match(/(\d+)/) || [])[1];

    if (major) {
      // Find ALL events that contain this major version number
      // This will match "145", "145.0", "145.0.1", "Thunderbird 145", etc.
      const majorRe = new RegExp('\\b' + major + '(?:\\.\\d+)*\\b');
      candidates = allEvents.filter(ev => ev.summary && majorRe.test(ev.summary));
    }
  }

  const filterEsrEvents = (eventsList) => {
    if (!major) return [];
    const patterns = [
      new RegExp(`\\b${major}\\.0a1\\b`, 'i'),
      new RegExp(`\\b${major}\\.0b\\d+\\b`, 'i'),
      new RegExp(`\\b${major}(?:\\.\\d+){1,3}esr\\b`, 'i')
    ];
    return (eventsList || []).filter(ev => {
      const summary = ev.summary || '';
      return patterns.some(re => re.test(summary));
    });
  };

  if (isEsrChannel) {
    candidates = filterEsrEvents(candidates);
    if (candidates.length === 0) {
      candidates = filterEsrEvents(allEvents);
    }
  }

  // fallback: events that mention Thunderbird if we still have none
  if (candidates.length === 0 && channelDef.platform === 'android') {
    const androidFallback = allEvents.filter(ev => isAndroidMilestone(ev));
    if (androidFallback.length > 0) {
      candidates = androidFallback;
    }
  }

  if (candidates.length === 0 && !isEsrChannel) {
    const thunderbirdFallback = allEvents.filter(ev => ev.summary && /thunderbird/i.test(ev.summary));
    if (thunderbirdFallback.length > 0) {
      candidates = thunderbirdFallback;
    }
  }

  if (candidates.length === 0 && Array.isArray(allEvents)) {
    candidates = allEvents.slice();
  }

  body.innerHTML = '';

  if (candidates.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'no-events';
    empty.innerHTML = '<p>No matching milestones found in the calendar.</p>';
    body.appendChild(empty);
  } else {
    const table = document.createElement('table');
    table.className = 'milestone-table';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th scope="col">Date</th>
        <th scope="col">Milestone</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const ev of candidates) {
      const row = document.createElement('tr');

      const dateCell = document.createElement('td');
      dateCell.className = 'milestone-date';
      dateCell.textContent = formatDate(ev.start);

      const summaryCell = document.createElement('td');
      summaryCell.className = 'milestone-summary';
      summaryCell.innerHTML = `<span class="summary-text">${ev.summary || '—'}</span>`;

      row.appendChild(dateCell);
      row.appendChild(summaryCell);
      tbody.appendChild(row);
    }

    table.appendChild(tbody);
    body.appendChild(table);
  }
  modal.setAttribute('aria-hidden', 'false');
}

/**
 * Closes the milestone modal dialog.
 */
function closeModal() {
  const modal = document.getElementById('modal');
  modal.setAttribute('aria-hidden', 'true');
}

/**
 * Fetches status from the API and updates the UI.
 * Called on page load and every 60 seconds.
 */
async function refresh() {
  try {
    const status = await fetchStatus();

    // Update countdown banner
    updateCountdownBanner(status);

    renderChannelGroup('channel-strip', DESKTOP_CHANNELS, status);
    renderChannelGroup('android-strip', ANDROID_CHANNELS, status);
  } catch (err) {
    const desktopStrip = document.getElementById('channel-strip');
    if (desktopStrip) desktopStrip.innerText = 'Error loading status: ' + err.message;
    const androidStrip = document.getElementById('android-strip');
    if (androidStrip) androidStrip.innerText = 'Error loading status: ' + err.message;
  }
}

/**
 * Renders a group of channel cards into a container element.
 *
 * @param {string} stripId - ID of the container element
 * @param {Array} channelDefs - Array of channel definition objects
 * @param {Object} status - Status object from the API
 */
function renderChannelGroup(stripId, channelDefs, status) {
  const strip = document.getElementById(stripId);
  if (!strip) return;

  strip.innerHTML = '';
  const events = status.events || [];
  const esrNextVersion = status?.channels?.desktop?.esr_next?.version;

  for (const def of channelDefs) {
    const group = status?.channels?.[def.statusGroup] || {};
    const data = group[def.statusKey] || { version: null, milestone: null, eventSummary: null };

    if (def.statusKey === 'esr_next' && def.statusGroup === 'desktop' && !esrNextVersion) {
      continue;
    }

    let effectiveDef = def;
    if (def.statusKey === 'esr_current' && def.statusGroup === 'desktop' && !esrNextVersion) {
      effectiveDef = { ...def, name: 'ESR' };
    }

    const filteredEvents = filterEventsForChannel(events, effectiveDef);
    const card = buildCard(effectiveDef, data, filteredEvents);
    strip.appendChild(card);
  }
}

document.getElementById('modal-close').addEventListener('click', () => closeModal());
document.getElementById('modal-backdrop').addEventListener('click', () => closeModal());
document.addEventListener('keydown', (e)=>{
  if (e.key === 'Escape') closeModal();
});

// initial load
refresh();
setInterval(refresh, 60_000);
