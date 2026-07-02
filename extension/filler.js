// filler.js — AYN Resume Tailor filler namespace (v1.9.55)
// Loaded after constants.js and before content.js. Idempotent.
// Reserved as the future home of aynFillTextbox, aynSettleReapply, the
// verify-and-retry executor, radio/checkbox/select handlers, and structural
// radio grouping. Today it exposes an empty namespace so extractions from
// content.js can land here without a manifest change.
(function () {
  'use strict';
  if (window.AYN_FILLER) return;
  window.AYN_FILLER = {};
})();
