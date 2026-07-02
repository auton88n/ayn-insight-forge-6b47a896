// constants.js — AYN Resume Tailor shared constants namespace (v1.9.55)
// Loaded before filler.js and content.js. Idempotent under double-injection.
// This file intentionally reserves a window namespace for future extractions
// from content.js without changing today's behavior — content.js still uses
// its own IIFE-scoped consts. Once helpers move here, remove the local copies.
(function () {
  'use strict';
  if (window.AYN_CONST) return;
  const IS_TOP = (() => { try { return window === window.top; } catch (_) { return false; } })();
  window.AYN_CONST = Object.freeze({
    BUILD: '1.9.55',
    MAX_JD_CHARS: 20000,
    VISION_ENABLED: true,
    IS_TOP,
    // ATS host patterns kept in one place so the DNR ruleset and content
    // classifiers cannot drift apart.
    ATS_HOSTS: [
      'myworkdayjobs.com',
      'greenhouse.io',
      'lever.co',
      'ashbyhq.com',
      'icims.com',
      'smartrecruiters.com',
      'taleo.net',
      'successfactors.com',
      'oraclecloud.com',
      'jobvite.com',
    ],
  });
})();
