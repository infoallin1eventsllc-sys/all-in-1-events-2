/* All in 1 Events — page behaviour.
 *
 * Drives the concierge panel and the inquiry form. Every piece of text that
 * originates from a person or a model is inserted with `textContent`, never
 * `innerHTML` — that is the repo's XSS rule and the reason a chat reply can
 * never inject markup into the page.
 */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const panel      = $("chat-panel");
  const launcher   = $("chat-launcher");
  const closeBtn   = $("chat-close-btn");
  const messages   = $("chat-messages");
  const input      = $("chat-input");
  const sendBtn    = $("chat-send");
  const quickWrap  = $("quick-replies");
  const inputRow   = $("chat-input-row");
  const inquiry    = $("inquiry-form");
  const inquiryOn  = $("inquiry-toggle-btn");
  const inquiryOff = $("inquiry-back");
  const submitBtn  = $("inquiry-submit");
  const errorEl    = $("iq-error");
  const bookBtn    = $("header-book-btn");

  if (!panel) return;   // Not the events page.

  const history = [];
  let greeted = false;
  let busy = false;

  /* ===== Panel ===== */

  function openPanel(showInquiry) {
    panel.classList.remove("chat-panel-closed");
    panel.setAttribute("aria-hidden", "false");
    if (showInquiry) showInquiryForm();
    if (!greeted) {
      greeted = true;
      addMessage(
        "bot",
        "Welcome to All in 1 Events. I can help with pricing, availability and " +
        "what we bring to a room. What are you planning?"
      );
    }
    // Focus the field the visitor is most likely to want next.
    setTimeout(() => (showInquiry ? $("iq-name") : input).focus(), 260);
  }

  function closePanel() {
    panel.classList.add("chat-panel-closed");
    panel.setAttribute("aria-hidden", "true");
    launcher && launcher.focus();
  }

  function panelOpen() {
    return !panel.classList.contains("chat-panel-closed");
  }

  launcher && launcher.addEventListener("click", () =>
    panelOpen() ? closePanel() : openPanel(false));
  closeBtn && closeBtn.addEventListener("click", closePanel);
  bookBtn  && bookBtn.addEventListener("click", () => openPanel(true));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panelOpen()) closePanel();
  });

  /* ===== Messages ===== */

  function addMessage(who, text) {
    const el = document.createElement("div");
    el.className = "msg " + (who === "user" ? "msg-user" : who === "note" ? "msg-note" : "msg-bot");
    el.textContent = text;                 // never innerHTML — see file header
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }

  function addTyping() {
    const el = document.createElement("div");
    el.className = "msg msg-bot";
    el.setAttribute("aria-label", "Concierge is typing");
    const dots = document.createElement("span");
    dots.className = "typing";
    dots.appendChild(document.createElement("span"));
    dots.appendChild(document.createElement("span"));
    dots.appendChild(document.createElement("span"));
    el.appendChild(dots);
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }

  async function send(text) {
    const msg = String(text || "").trim();
    if (!msg || busy) return;

    busy = true;
    sendBtn.disabled = true;
    addMessage("user", msg);
    history.push({ role: "user", content: msg });
    input.value = "";
    input.style.height = "auto";

    const typing = addTyping();
    const { reply, live } = await sendChat(msg, history.slice(-10));
    typing.remove();

    addMessage("bot", reply);
    history.push({ role: "assistant", content: reply });

    // Say once, honestly, that answers are scripted rather than letting a canned
    // line pass for a considered reply.
    if (!live && !messages.dataset.notedFallback) {
      messages.dataset.notedFallback = "1";
      addMessage("note",
        "Answering from our standard information — the live concierge isn't connected yet. " +
        "For anything specific, use Start Inquiry and a person will reply.");
    }

    busy = false;
    sendBtn.disabled = false;
    input.focus();
  }

  sendBtn && sendBtn.addEventListener("click", () => send(input.value));

  input && input.addEventListener("keydown", (e) => {
    // Enter sends, Shift+Enter makes a new line.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input.value);
    }
  });

  // Grow the textarea with its content, up to the CSS max-height.
  input && input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 112) + "px";
  });

  /* ===== Quick replies ===== */

  quickWrap && quickWrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".quick-reply-btn");
    if (!btn) return;
    const action = btn.dataset.action;
    const label = btn.textContent.trim();
    addMessage("user", label);
    const answer = FAQ[action];
    if (answer) {
      addMessage("bot", answer);
      history.push({ role: "user", content: label }, { role: "assistant", content: answer });
    } else {
      send(label);
    }
  });

  /* ===== Inquiry form ===== */

  function showInquiryForm() {
    inquiry.classList.remove("hidden");
    inquiry.classList.add("flex");
    messages.classList.add("hidden");
    quickWrap.classList.add("hidden");
    inputRow.classList.add("hidden");
  }

  function hideInquiryForm() {
    inquiry.classList.add("hidden");
    inquiry.classList.remove("flex");
    messages.classList.remove("hidden");
    quickWrap.classList.remove("hidden");
    inputRow.classList.remove("hidden");
  }

  inquiryOn  && inquiryOn.addEventListener("click", showInquiryForm);
  inquiryOff && inquiryOff.addEventListener("click", hideInquiryForm);

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove("hidden");
  }
  function clearError() {
    errorEl.textContent = "";
    errorEl.classList.add("hidden");
  }

  submitBtn && submitBtn.addEventListener("click", async () => {
    clearError();
    const name  = $("iq-name").value.trim();
    const email = $("iq-email").value.trim();
    const date  = $("iq-date").value;
    const msg   = $("iq-msg").value.trim();

    if (!email) { showError("Add an email so we can reply."); $("iq-email").focus(); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      showError("That email address doesn't look right."); $("iq-email").focus(); return;
    }

    submitBtn.disabled = true;
    const label = submitBtn.textContent;
    submitBtn.textContent = "Sending…";

    const result = await sendInquiry({
      name,
      email,
      source: "allin1events:concierge",
      message: [
        date ? "Event date: " + date : null,
        msg || null
      ].filter(Boolean).join(" — ") || "Inquiry from the website concierge."
    });

    submitBtn.disabled = false;
    submitBtn.textContent = label;

    if (result.delivered) {
      hideInquiryForm();
      addMessage("bot", result.message);
      $("iq-name").value = "";
      $("iq-email").value = "";
      $("iq-date").value = "";
      $("iq-msg").value = "";
    } else {
      // Leave the fields filled so nothing typed is lost on a failure.
      showError(result.message);
    }
  });
})();
