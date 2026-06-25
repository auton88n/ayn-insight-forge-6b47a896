const $ = (s) => document.querySelector(s);

(async () => {
  const r = await chrome.runtime.sendMessage({ type: "ayn_get_token" });
  if (r?.token) $("#token").value = r.token;
})();

$("#save").addEventListener("click", async () => {
  const token = $("#token").value.trim();
  if (!token.startsWith("ayn_")) {
    $("#status").className = "status err";
    $("#status").textContent = "Token should start with ayn_";
    return;
  }
  const r = await chrome.runtime.sendMessage({ type: "ayn_set_token", token });
  if (r?.ok) {
    $("#status").className = "status ok";
    $("#status").textContent = "Connected. You can close this tab.";
  } else {
    $("#status").className = "status err";
    $("#status").textContent = "Failed: " + (r?.error || "unknown");
  }
});

$("#clear").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "ayn_clear_token" });
  $("#token").value = "";
  $("#status").className = "status ok";
  $("#status").textContent = "Disconnected.";
});
