// Floating overlay UI: shows ranked word suggestions and lets the user
// click one to fill it into the chat input.

(function (root) {
  "use strict";

  let overlayEl = null;
  let bodyEl = null;
  let onPickCallback = null;

  function ensureOverlay(onPick) {
    onPickCallback = onPick;
    if (overlayEl) return overlayEl;

    overlayEl = document.createElement("div");
    overlayEl.id = "skribbl-guesser-overlay";

    const header = document.createElement("div");
    header.className = "sg-header";
    header.innerHTML = `<span>Guess Helper</span>`;
    const toggle = document.createElement("button");
    toggle.className = "sg-toggle";
    toggle.textContent = "–";
    toggle.addEventListener("click", () => {
      overlayEl.classList.toggle("sg-collapsed");
      toggle.textContent = overlayEl.classList.contains("sg-collapsed")
        ? "+"
        : "–";
    });
    header.appendChild(toggle);

    bodyEl = document.createElement("div");
    bodyEl.className = "sg-body";
    setStatus("Waiting for a round…");

    overlayEl.appendChild(header);
    overlayEl.appendChild(bodyEl);
    document.body.appendChild(overlayEl);

    makeDraggable(overlayEl, header);

    return overlayEl;
  }

  function setStatus(text) {
    if (!bodyEl) return;
    bodyEl.innerHTML = "";
    const p = document.createElement("div");
    p.className = "sg-status";
    p.textContent = text;
    bodyEl.appendChild(p);
  }

  function setCandidates(words) {
    if (!bodyEl) return;
    bodyEl.innerHTML = "";
    if (!words || words.length === 0) {
      setStatus("No matches — check word list.");
      return;
    }
    for (const word of words) {
      const btn = document.createElement("button");
      btn.className = "sg-word-btn";
      btn.textContent = word;
      btn.addEventListener("click", () => {
        if (onPickCallback) onPickCallback(word);
      });
      bodyEl.appendChild(btn);
    }
  }

  function makeDraggable(el, handle) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener("mousedown", (e) => {
      dragging = true;
      const rect = el.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      el.style.left = `${e.clientX - offsetX}px`;
      el.style.top = `${e.clientY - offsetY}px`;
      el.style.right = "auto";
    });

    document.addEventListener("mouseup", () => {
      dragging = false;
    });
  }

  root.SkribblOverlay = { ensureOverlay, setStatus, setCandidates };
})(typeof window !== "undefined" ? window : globalThis);
