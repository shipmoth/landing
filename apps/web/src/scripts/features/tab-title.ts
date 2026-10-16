/* ---------- tab title: the moth notices when you leave ---------- */

const AWAY_TITLE = 'come back, the moth misses you';

export function initTabTitle(): void {
  const title = document.title;
  document.addEventListener('visibilitychange', () => {
    document.title = document.hidden ? AWAY_TITLE : title;
  });
}
