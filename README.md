# Thunderbird Train Tracker

Website that reports current Thunderbird versions for desktop and mobile release channels and shows milestone dates from Thunderbird Releases & Events calendar.

This project fetches:
- Desktop Thunderbird versions from: `https://product-details.mozilla.org/1.0/thunderbird_versions.json`
- Android nightly builds from: `https://ftp.mozilla.org/pub/thunderbird-mobile/android/nightly/latest-main/`
- Android release/beta versions from: `https://api.github.com/repos/thunderbird/thunderbird-android/tags?per_page=100`
- Milestone dates from Thunderbird Releases & Events calendar (ICS):
  `https://calendar.google.com/calendar/ical/c_f7b7f2cea6f65593ef05afaf2abfcfb48f87e25794468cd4a19d16495d17b6d1%40group.calendar.google.com/public/basic.ics`

Quick start

1. Install dependencies

```bash
npm install
```

2. Run server

```bash
npm start
```

3. Open http://localhost:3000 in your browser.

API

- GET /api/status — returns JSON with grouped channel data (`channels.desktop`, `channels.android`), version strings, and discovered milestone dates (ISO).

Notes

- The calendar is parsed from the public ICS feed; no API key is required.
- This is a small starter implementation. Follow-ups: better event matching heuristics, caching, tests, and deployment instructions.
