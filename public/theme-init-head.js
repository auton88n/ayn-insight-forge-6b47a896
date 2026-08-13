// Prevent FOUC: apply theme before paint. Moved out of index.html's inline
// <script> (v3.132.0 security-headers pass) so a real Content-Security-Policy
// can drop 'unsafe-inline' from script-src instead of trusting inline script
// content. Logic is byte-for-byte what used to sit inline.
(function () {
  try {
    // Landing page owns its own warm paper canvas
    var isLanding = window.location.pathname === '/' || window.location.pathname === '';
    if (isLanding) {
      document.documentElement.classList.add('light');
      document.documentElement.style.colorScheme = 'light';
      document.documentElement.style.backgroundColor = '#faf8f3';
      return;
    }
    // Dashboard / authenticated routes: apply saved theme or default dark
    var saved = null;
    try { saved = localStorage.getItem('ayn-theme'); } catch (e) {}
    var theme = (saved === 'light') ? 'light' : 'dark';
    document.documentElement.classList.add(theme);
    document.documentElement.style.colorScheme = theme;
    var bgColor = (theme === 'light') ? '#ffffff' : 'hsl(0 0% 4%)';
    document.documentElement.style.backgroundColor = bgColor;
    if (document.body) document.body.style.backgroundColor = bgColor;
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
