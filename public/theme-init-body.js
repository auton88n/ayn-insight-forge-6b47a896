// Sets the body background before the app mounts and flags the document
// ready for the CSS transition gate. Moved out of index.html's inline
// <script> (v3.132.0 security-headers pass), same reasoning as
// theme-init-head.js.
(function () {
  var isLanding = window.location.pathname === '/' || window.location.pathname === '';
  if (isLanding) {
    document.body.style.backgroundColor = '#faf8f3';
  } else {
    var saved = null;
    try { saved = localStorage.getItem('ayn-theme'); } catch (e) {}
    document.body.style.backgroundColor = (saved === 'light') ? '#ffffff' : 'hsl(0 0% 4%)';
  }
  requestAnimationFrame(function () {
    document.documentElement.setAttribute('data-ready', '');
  });
})();
