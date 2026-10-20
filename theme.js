/* Apply a remembered preference before first paint; otherwise use dark mode. */
(function () {
  'use strict';
  let current = 'dark';
  try {
    const saved = localStorage.getItem('pacg-theme');
    if (saved === 'light' || saved === 'dark') current = saved;
  } catch { /* Browsing and theme switching also work with storage disabled. */ }
  const apply = value => {
    current = value === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = current;
  };
  apply(current);
  window.PACGTheme = {
    get: () => current,
    toggle: () => {
      apply(current === 'dark' ? 'light' : 'dark');
      try { localStorage.setItem('pacg-theme',current); } catch { /* Session-only preference. */ }
      return current;
    }
  };
})();
