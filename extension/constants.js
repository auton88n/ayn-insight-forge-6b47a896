// constants.js — AYN Resume Tailor shared constants namespace (v1.9.55)
// Loaded before filler.js and content.js. Also imported by the background
// service worker via importScripts, so we assign to `self` (works in both
// window and worker globals) instead of `window`.
(function () {
  'use strict';
  if (self.AYN_CONST) return;
  const IS_TOP = (() => { try { return typeof window !== 'undefined' && window === window.top; } catch (_) { return false; } })();
  self.AYN_CONST = Object.freeze({
    BUILD: '2.2.0',
    MAX_JD_CHARS: 20000,
    VISION_ENABLED: true,
    RESOLVER_V2: true,
    IS_TOP,
    ATS_HOSTS: [
      'myworkdayjobs.com',
      'greenhouse.io',
      'lever.co',
      'ashbyhq.com',
      'jobs.gem.com',
      'icims.com',
      'smartrecruiters.com',
      'taleo.net',
      'successfactors.com',
      'oraclecloud.com',
      'jobvite.com',
    ],
  });
  // Back-compat for legacy content-script reads.
  try { if (typeof window !== 'undefined' && !window.AYN_CONST) window.AYN_CONST = self.AYN_CONST; } catch (_) {}
})();
