(function () {
  'use strict';
  const button = document.getElementById('theme-toggle');
  function update() {
    const target = window.PACGTheme.get() === 'dark' ? 'light' : 'dark';
    button.textContent = `${target === 'light' ? 'Light' : 'Dark'} mode`;
    button.setAttribute('aria-label', `Switch to ${target} mode`);
  }
  button.addEventListener('click', () => { window.PACGTheme.toggle(); update(); });
  update();
})();
