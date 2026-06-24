/* ============================
   ALL IN 1 EVENTS — APP LOGIC
   ============================ */

(function () {
  'use strict';

  /* -------- STATE -------- */
  const state = {
    chatOpen: false,
    inquiryOpen: false,
    messages: [],        // { role: 'user' | 'assistant', content: string }
    sending: false,
  };

  /* -------- DOM REFS -------- */
  const chatLauncher    = document.getElementById('chat-launcher');
  const chatPanel       = document.getElementById('chat-panel');
  const chatCloseBtn    = document.getElementById('chat-close-btn');
  const chatMessages    = document.getElementById('chat-messages');
  const chatInput       = document.getElementById('chat-input');
  const chatSendBtn     = document.getElementById('chat-send');
  const quickReplies    = document.getElementById('quick-replies');
  const chatInputRow    = document.getElementById('chat-input-row');
  const inquiryToggle   = document.getElementById('inquiry-toggle-btn');
  const inquiryForm     = document.getElementById('inquiry-form');
  const inquirySubmit   = document.getElementById('inquiry-submit');
  const inquiryBack     = document.getElementById('inquiry-back');
  const iqError         = document.getElementById('iq-error');

  const magicMirrorBtn  = document.querySelector('.magic-mirror-btn');
  const lightingBtn     = document.querySelector('.lighting-btn');
  const vipBtn          = document.querySelector('.vip-btn');
  const headerBookBtn   = document.getElementById('header-book-btn');

  /* -------- CHAT OPEN / CLOSE -------- */
  function openChat() {
    if (state.chatOpen) return;
    state.chatOpen = true;
    chatPanel.classList.remove('chat-panel-closed');
    chatPanel.classList.add('chat-panel-open');
    chatPanel.setAttribute('aria-hidden', 'false');
    chatLauncher.setAttribute('aria-expanded', 'true');

    // Remove notification badge if present
    const badge = chatLauncher.querySelector('.notification-badge');
    if (badge) badge.remove();

    if (state.messages.length === 0) {
      addAiMessage("Hi! I'm your AI Event Concierge ✨ Ask me about pricing, availability, or any of our services — or hit \"Start Inquiry\" to get a custom quote.");
    }
    setTimeout(() => chatInput.focus(), 300);
  }

  function closeChat() {
    if (!state.chatOpen) return;
    state.chatOpen = false;
    chatPanel.classList.remove('chat-panel-open');
    chatPanel.classList.add('chat-panel-closed');
    chatPanel.setAttribute('aria-hidden', 'true');
    chatLauncher.setAttribute('aria-expanded', 'false');
  }

  chatLauncher.addEventListener('click', () => state.chatOpen ? closeChat() : openChat());
  chatCloseBtn.addEventListener('click', closeChat);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.chatOpen) closeChat(); });

  /* -------- MESSAGE RENDERING -------- */
  function buildAiAvatar() {
    const wrap = document.createElement('div');
    wrap.className = 'w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 mt-0.5';
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined text-primary';
    icon.style.fontSize = '15px';
    icon.textContent = 'smart_toy';
    wrap.appendChild(icon);
    return wrap;
  }

  function appendMessage(text, role) {
    const row = document.createElement('div');
    row.className = `chat-message-row chat-message-row-${role === 'user' ? 'user' : 'ai'}`;

    if (role === 'assistant') row.appendChild(buildAiAvatar());

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble chat-bubble-${role === 'user' ? 'user' : 'ai'}`;
    bubble.textContent = text; // XSS-safe: always textContent, never innerHTML
    row.appendChild(bubble);

    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function addAiMessage(text) {
    state.messages.push({ role: 'assistant', content: text });
    appendMessage(text, 'assistant');
  }

  function addUserMessage(text) {
    state.messages.push({ role: 'user', content: text });
    appendMessage(text, 'user');
  }

  function showTyping() {
    const row = document.createElement('div');
    row.className = 'chat-message-row chat-message-row-ai';
    row.id = 'typing-row';
    row.appendChild(buildAiAvatar());
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span');
      dot.className = 'typing-dot';
      indicator.appendChild(dot);
    }
    row.appendChild(indicator);
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function removeTyping() {
    const el = document.getElementById('typing-row');
    if (el) el.remove();
  }

  /* -------- SEND MESSAGE -------- */
  async function handleSend() {
    const text = chatInput.value.trim();
    if (!text || state.sending) return;

    state.sending = true;
    chatSendBtn.disabled = true;
    chatInput.value = '';
    chatInput.style.height = 'auto';

    addUserMessage(text);
    showTyping();

    try {
      const reply = await window.AllIn1API.sendChatMessage([...state.messages]);
      removeTyping();
      addAiMessage(reply);
    } catch {
      removeTyping();
      addAiMessage("Sorry, I'm having trouble connecting right now. Please try the inquiry form or email us at concierge@allin1events.com");
    } finally {
      state.sending = false;
      chatSendBtn.disabled = false;
      chatInput.focus();
    }
  }

  chatSendBtn.addEventListener('click', handleSend);

  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Auto-resize textarea
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 112) + 'px';
  });

  /* -------- QUICK REPLIES -------- */
  const QUICK_TEXTS = {
    pricing:      "What are your pricing packages?",
    availability: "How do I check your availability for a date?",
    venues:       "Can you give me a venue guide?",
  };

  document.querySelectorAll('.quick-reply-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const msg = QUICK_TEXTS[btn.dataset.action];
      if (!msg) return;
      if (!state.chatOpen) openChat();
      // defer so openChat greeting renders first if needed
      setTimeout(() => {
        chatInput.value = msg;
        handleSend();
      }, state.messages.length === 0 ? 500 : 0);
    });
  });

  /* -------- INQUIRY FORM -------- */
  function showInquiry() {
    state.inquiryOpen = true;
    quickReplies.classList.add('hidden');
    chatInputRow.classList.add('hidden');
    inquiryForm.classList.remove('hidden');
    inquiryForm.classList.add('flex');
    clearIqError();
  }

  function hideInquiry() {
    state.inquiryOpen = false;
    inquiryForm.classList.add('hidden');
    inquiryForm.classList.remove('flex');
    quickReplies.classList.remove('hidden');
    chatInputRow.classList.remove('hidden');
    clearIqError();
  }

  inquiryToggle.addEventListener('click', () => {
    if (!state.chatOpen) openChat();
    setTimeout(showInquiry, state.messages.length === 0 ? 500 : 0);
  });

  inquiryBack.addEventListener('click', hideInquiry);

  /* -------- INQUIRY VALIDATION & SUBMIT -------- */
  function showIqError(msg) {
    iqError.textContent = msg;
    iqError.classList.remove('hidden');
  }

  function clearIqError() {
    iqError.textContent = '';
    iqError.classList.add('hidden');
  }

  inquirySubmit.addEventListener('click', async () => {
    clearIqError();

    const name  = document.getElementById('iq-name').value.trim();
    const email = document.getElementById('iq-email').value.trim();
    const date  = document.getElementById('iq-date').value;
    const msg   = document.getElementById('iq-msg').value.trim();

    if (!name)                                       return showIqError('Please enter your name.');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                                                     return showIqError('Please enter a valid email address.');
    if (!msg)                                        return showIqError('Please describe your event.');

    inquirySubmit.disabled    = true;
    inquirySubmit.textContent = 'Sending…';

    try {
      await window.AllIn1API.submitInquiry({ name, email, date, message: msg });

      // Replace form with success state
      inquiryForm.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'inquiry-success';
      wrap.innerHTML = `
        <span class="material-symbols-outlined text-primary" style="font-size:52px">check_circle</span>
        <p class="text-on-surface font-bold text-lg">Inquiry Sent!</p>
        <p class="text-on-surface-variant text-sm">Thanks, ${escapeHtml(name)}! We'll be in touch within 24 hours.</p>
      `;
      inquiryForm.appendChild(wrap);
    } catch {
      inquirySubmit.disabled    = false;
      inquirySubmit.textContent = 'Send Inquiry';
      showIqError('Failed to send. Please email concierge@allin1events.com directly.');
    }
  });

  // Minimal HTML escaper used only for the name in the success message
  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* -------- SERVICE CARD CTAs → OPEN CHAT -------- */
  function openChatWith(msg) {
    openChat();
    setTimeout(() => {
      chatInput.value = msg;
      handleSend();
    }, state.messages.length === 0 ? 600 : 150);
  }

  magicMirrorBtn?.addEventListener('click', () =>
    openChatWith("I'm interested in the Magic Mirror Photo Booth. What does a package include?"));

  lightingBtn?.addEventListener('click', () =>
    openChatWith("Tell me about your Atmospheric Lighting packages."));

  vipBtn?.addEventListener('click', () =>
    openChatWith("I'd like to see the VIP Lounge Rental catalog."));

  headerBookBtn?.addEventListener('click', () => {
    openChat();
    setTimeout(showInquiry, state.messages.length === 0 ? 600 : 150);
  });

  /* -------- HERO BUTTONS -------- */
  document.getElementById('hero-explore-btn')?.addEventListener('click', () => {
    document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('hero-inquiry-btn')?.addEventListener('click', () => {
    openChat();
  });

  /* -------- LAUNCHER BADGE (cosmetic — draws attention on first load) -------- */
  setTimeout(() => {
    if (!state.chatOpen) {
      const badge = document.createElement('div');
      badge.className = 'notification-badge';
      badge.textContent = '1';
      chatLauncher.style.position = 'relative';
      chatLauncher.appendChild(badge);
    }
  }, 3500);
})();
