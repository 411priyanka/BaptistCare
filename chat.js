// chat.js - Dual Chat Widgets: D-ID Video Chat (Bottom-Left) & Boomi Text Chat (Bottom-Right)

(function () {
  // 1) Inject the Dual Chat Widget HTML
  const chatContainer = document.createElement('div');
  chatContainer.id = 'dual-chat-container';
  chatContainer.innerHTML = `
    <!-- LEFT SIDE: D-ID Video Chat Capsule Bubble -->
    <div id="did-bubble" role="button" aria-label="Open Video Chat with AI">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M23 7l-7 5 7 5V7z"></path>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
      </svg>
      <span>Video Chat with AI</span>
    </div>

    <!-- LEFT SIDE: D-ID Video Chat Window -->
    <div id="did-window">
      <div id="did-header">
        <div class="agent-info">
          <span class="status-indicator online"></span>
          <span>Video Chat with AI</span>
        </div>
        <button id="close-did" aria-label="Close Video Chat">&times;</button>
      </div>
      <div id="did-iframe-container">
        <iframe 
          src="https://studio.d-id.com/agents/share?id=v2_agt_aBjzNEx3&key=WVhWMGFEQjhOamd4WVdSbVltRTVZVE5sTVRnM1pqSmtaVFJtWVRVNU9qQXdPSHB2Vm01SlJYQnRVR0ZQU0hWdmFqQnFMUT09" 
          width="100%" 
          height="100%" 
          style="border: none; width: 100%; height: 100%;"
          allow="microphone; camera; clipboard-write; autoplay">
        </iframe>
      </div>
    </div>

    <!-- RIGHT SIDE: Boomi Text Chat Bubble -->
    <div id="boomi-bubble" role="button" aria-label="Open Boomi Chat">
      <svg id="boomi-bubble-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z"></path>
      </svg>
      <span id="boomi-bubble-close" style="display: none; font-size: 24px; line-height: 1; color: white;">&times;</span>
    </div>

    <!-- RIGHT SIDE: Boomi Text Chat Window -->
    <div id="boomi-window">
      <div id="boomi-header">
        <div class="agent-info">
          <span class="status-indicator online"></span>
          <span>BaptistCare Agent</span>
        </div>
        <div class="header-actions">
          <button id="reset-boomi" aria-label="Restart Conversation" title="Start new conversation">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1 4 1 10 7 10"></polyline>
              <path d="M3.51 15a9 9 0 1 0 .49-4.5"></path>
            </svg>
          </button>
          <button id="close-boomi" aria-label="Close Chat">&times;</button>
        </div>
      </div>
      <div id="boomi-messages">
        <div class="message agent">
          <div class="msg-bubble">
            Hello! I'm your BaptistCare assistant powered by Boomi. How can I help you today?
          </div>
        </div>
      </div>
      <div id="boomi-input-area">
        <textarea id="boomi-input-text" placeholder="Type your message..." rows="1"></textarea>
        <button id="boomi-send-btn" aria-label="Send message">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"></path>
          </svg>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(chatContainer);

  // 2) Grab elements
  const didBubble = document.getElementById('did-bubble');
  const didWindow = document.getElementById('did-window');
  const closeDid = document.getElementById('close-did');

  const boomiBubble = document.getElementById('boomi-bubble');
  const boomiBubbleIcon = document.getElementById('boomi-bubble-icon');
  const boomiBubbleClose = document.getElementById('boomi-bubble-close');
  const boomiWindow = document.getElementById('boomi-window');
  const closeBoomi = document.getElementById('close-boomi');
  const resetBoomi = document.getElementById('reset-boomi');

  const boomiInput = document.getElementById('boomi-input-text');
  const boomiSendBtn = document.getElementById('boomi-send-btn');
  const boomiMessages = document.getElementById('boomi-messages');

  // 3) Toggle D-ID Video Agent Window
  didBubble.addEventListener('click', () => {
    const isVisible = didWindow.style.display === 'flex';
    didWindow.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) {
      boomiWindow.style.display = 'none'; // Close other window to prevent clutter
      setBoomiBubbleActive(false);
    }
  });

  closeDid.addEventListener('click', () => {
    didWindow.style.display = 'none';
  });

  // 4) Toggle Boomi Text Agent Window
  boomiBubble.addEventListener('click', () => {
    const isVisible = boomiWindow.style.display === 'flex';
    boomiWindow.style.display = isVisible ? 'none' : 'flex';
    setBoomiBubbleActive(!isVisible);
    if (!isVisible) {
      didWindow.style.display = 'none'; // Close other window to prevent clutter
      boomiInput.focus();
    }
  });

  closeBoomi.addEventListener('click', () => {
    boomiWindow.style.display = 'none';
    setBoomiBubbleActive(false);
  });

  function setChatInputDisabled(disabled, placeholderText = "Type your message...") {
    boomiInput.disabled = disabled;
    boomiSendBtn.disabled = disabled;
    if (disabled) {
      boomiInput.placeholder = placeholderText;
      boomiSendBtn.style.opacity = "0.5";
      boomiSendBtn.style.cursor = "not-allowed";
    } else {
      boomiInput.placeholder = "Type your message...";
      boomiSendBtn.style.opacity = "1";
      boomiSendBtn.style.cursor = "pointer";
    }
  }

  resetBoomi.addEventListener('click', async () => {
    // Clear session details
    sessionId = "";
    localStorage.removeItem('boomi_session_id');
    
    // Clear messages
    boomiMessages.innerHTML = '';
    
    // Disable inputs
    setChatInputDisabled(true, "Starting new conversation...");
    
    // Show typing dots
    const typingIndicator = showTypingIndicator();
    
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          session_id: "",
          message: "hello" // Send initial hello silently to start the session
        })
      });
      
      typingIndicator.remove();
      
      if (!response.ok) {
        throw new Error(`Server status ${response.status}`);
      }
      
      const data = await response.json();
      if (data.session_id) {
        sessionId = data.session_id;
        localStorage.setItem('boomi_session_id', sessionId);
      }
      
      // Append the welcome response from Boomi
      appendMessage(data.response || "Hello! How can I help you today?", 'agent');
      
    } catch (error) {
      console.error('Failed to start new session:', error);
      typingIndicator.remove();
      appendMessage("Hello! I'm your BaptistCare assistant powered by Boomi. How can I help you today?", 'agent');
    }
    
    // Enable inputs
    setChatInputDisabled(false);
    
    // Reset input textbox
    boomiInput.value = "";
    boomiInput.style.height = 'auto';
    boomiInput.focus();
  });

  function setBoomiBubbleActive(active) {
    if (active) {
      boomiBubbleIcon.style.display = 'none';
      boomiBubbleClose.style.display = 'inline';
      boomiBubble.classList.add('active-close');
    } else {
      boomiBubbleIcon.style.display = 'inline';
      boomiBubbleClose.style.display = 'none';
      boomiBubble.classList.remove('active-close');
    }
  }

  // 5) Boomi Conversation & Session Management
  let sessionId = localStorage.getItem('boomi_session_id') || "";

  async function sendMessage() {
    const text = boomiInput.value.trim();
    if (!text) return;

    // Append User Message
    appendMessage(text, 'user');
    boomiInput.value = '';
    boomiInput.style.height = 'auto';

    // Disable inputs
    setChatInputDisabled(true, "Thinking...");

    // Show typing dots
    const typingIndicator = showTypingIndicator();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          session_id: sessionId,
          message: text
        })
      });

      typingIndicator.remove();

      if (!response.ok) {
        throw new Error(`Server status ${response.status}`);
      }

      const data = await response.json();
      
      if (data.session_id) {
        sessionId = data.session_id;
        localStorage.setItem('boomi_session_id', sessionId);
      }

      appendMessage(data.response || "I didn't receive a response from the Boomi Agent.", 'agent');

    } catch (error) {
      console.error('Boomi connection failed:', error);
      typingIndicator.remove();
      appendMessage("Sorry, I'm having trouble connecting to my Boomi Assistant. Please try again shortly.", 'agent');
      // Clear session ID on failure so the next attempt starts fresh
      sessionId = "";
      localStorage.removeItem('boomi_session_id');
    }

    // Enable inputs
    setChatInputDisabled(false);
    boomiInput.focus();
  }

  function appendMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender);
    msgDiv.innerHTML = `<div class="msg-bubble">${formatMessage(text)}</div>`;
    boomiMessages.appendChild(msgDiv);
    boomiMessages.scrollTop = boomiMessages.scrollHeight;
  }

  function formatMessage(text) {
    let escaped = escapeHTML(text);
    // Parse **bold** markdown tags
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Convert newlines to HTML line breaks
    escaped = escaped.replace(/\n/g, '<br>');
    return escaped;
  }

  function showTypingIndicator() {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', 'agent');
    msgDiv.innerHTML = `
      <div class="msg-bubble typing">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;
    boomiMessages.appendChild(msgDiv);
    boomiMessages.scrollTop = boomiMessages.scrollHeight;
    return msgDiv;
  }

  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  boomiInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  boomiSendBtn.addEventListener('click', sendMessage);

  boomiInput.addEventListener('input', () => {
    boomiInput.style.height = 'auto';
    boomiInput.style.height = (boomiInput.scrollHeight) + 'px';
  });

  // Auto-open Boomi chat window if URL hash is #chat or on contact page
  if (window.location.hash === '#chat' || window.location.pathname.includes('contact.html')) {
    setTimeout(() => {
      boomiWindow.style.display = 'flex';
      setBoomiBubbleActive(true);
      boomiInput.focus();
    }, 500);
  }
})();
