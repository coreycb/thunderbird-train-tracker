import { getStatus } from '../src/fetcher.js';

(async () => {
  try {
    const s = await getStatus();
    console.log('Status fetched OK');
    console.log(JSON.stringify({
      desktop: {
        daily: s.channels.desktop.daily.version,
        release: s.channels.desktop.release.version,
        beta: s.channels.desktop.beta.version,
        esr_current: s.channels.desktop.esr_current.version,
        esr_next: s.channels.desktop.esr_next.version,
      },
      android: {
        daily: s.channels.android.daily.version,
        beta: s.channels.android.beta.version,
        release: s.channels.android.release.version,
      }
    }, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Smoke test failed:', err);
    process.exit(2);
  }
})();
