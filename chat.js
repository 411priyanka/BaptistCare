// chat.js - Dual Agent Integration: Boomi Chat Widget & D-ID Widget Loader

(function () {
  // 1) Inject the Boomi Chat Widget HTML (Moved to bottom-left to avoid D-ID overlap)
  const chatContainer = document.createElement('div');
  chatContainer.id = 'boomi-chat-container';
  chatContainer.innerHTML = `
    <!-- Floating Boomi Text Chat Bubble -->
    <div id="chat-bubble" role="button" aria-label="Open Chat with Boomi Agent">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>

    <!-- Boomi Text Chat Window -->
    <div id="chat-window">
      <div id="chat-header">
        <div class="agent-info">
          <span class="status-indicator online"></span>
          <span>Boomi Assistant</span>
        </div>
        <button id="close-chat" aria-label="Close Chat">&times;</button>
      </div>
      <div id="chat-messages">
        <div class="message agent">
          <div class="msg-bubble">
            Hello! I'm your BaptistCare assistant powered by Boomi. How can I help you today?
          </div>
        </div>
      </div>
      <div id="chat-input-area">
        <textarea id="chat-input-text" placeholder="Type your message..." rows="1"></textarea>
        <button id="chat-send-btn" aria-label="Send message">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(chatContainer);

  // 3) Auto-open D-ID Agent on load when API is ready
  window.addEventListener('load', () => {
    const checkAPI = setInterval(() => {
      if (window.DID_AGENTS_API) {
        clearInterval(checkAPI);
        try {
          console.log("D-ID Agent API ready, triggering auto-open...");
          window.DID_AGENTS_API.open();
        } catch (e) {
          console.warn("Failed to auto-open D-ID Agent widget:", e);
        }
      }
    }, 500);
    // Timeout after 15 seconds
    setTimeout(() => clearInterval(checkAPI), 15000);
  });

  // 4) Grab DOM elements for Boomi Chat
  const chatBubble = document.getElementById('chat-bubble');
  const chatWindow = document.getElementById('chat-window');
  const closeChat = document.getElementById('close-chat');
  const chatInput = document.getElementById('chat-input-text');
  const chatSendBtn = document.getElementById('chat-send-btn');
  const chatMessages = document.getElementById('chat-messages');

  // 5) Boomi Chat Bubble Toggle Logic
  chatBubble.addEventListener('click', () => {
    const isVisible = chatWindow.style.display === 'flex';
    chatWindow.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) {
      chatInput.focus();
    }
  });

  closeChat.addEventListener('click', () => {
    chatWindow.style.display = 'none';
  });

  // 6) Boomi Conversation & Session Management
  let sessionId = localStorage.getItem('boomi_session_id') || "";

  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    // Append User Message
    appendMessage(text, 'user');
    chatInput.value = '';
    chatInput.style.height = 'auto';

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
    }
  }

  function appendMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender);
    msgDiv.innerHTML = `<div class="msg-bubble">${escapeHTML(text)}</div>`;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
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
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return msgDiv;
  }

  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  chatSendBtn.addEventListener('click', sendMessage);

  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = (chatInput.scrollHeight) + 'px';
  });

  // Auto-open Boomi chat window if URL hash is #chat or on contact page
  if (window.location.hash === '#chat' || window.location.pathname.includes('contact.html')) {
    setTimeout(() => {
      chatWindow.style.display = 'flex';
      chatInput.focus();
    }, 500);
  }
})();
