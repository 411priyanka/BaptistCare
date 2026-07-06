// chat.js - Modern Floating Chat Bubble & Interactive Window hosting D-ID Agent share page

(function () {
  // Inject the Chat Bubble & IFrame Window HTML
  const chatContainer = document.createElement('div');
  chatContainer.id = 'boomi-chat-container';
  chatContainer.innerHTML = `
    <!-- Floating Chat Bubble -->
    <div id="chat-bubble" role="button" aria-label="Open Chat with D-ID AI Agent">
      <!-- Chat Icon (SVG Speech Bubble) -->
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>

    <!-- Chat Window -->
    <div id="chat-window">
      <div id="chat-header">
        <div class="agent-info">
          <span class="status-indicator online"></span>
          <span>BaptistCare AI Assistant</span>
        </div>
        <button id="close-chat" aria-label="Close Chat">&times;</button>
      </div>
      <!-- D-ID IFrame Container -->
      <div id="did-agent-container" style="width: 100%; height: calc(100% - 56px); background: #ffffff; overflow: hidden;">
        <iframe 
          src="https://studio.d-id.com/agents/share?id=v2_agt_aBjzNEx3&key=WVhWMGFEQjhOamd4WVdSbVltRTVZVE5sTVRnM1pqSmtaVFJtWVRVNU9qQXdPSHB2Vm01SlJYQnRVR0ZQU0hWdmFqQnFMUT09" 
          width="100%" 
          height="100%" 
          style="border: none; width: 100%; height: 100%;" 
          allow="microphone; camera; clipboard-write; autoplay">
        </iframe>
      </div>
    </div>
  `;
  document.body.appendChild(chatContainer);

  // Grab elements
  const chatBubble = document.getElementById('chat-bubble');
  const chatWindow = document.getElementById('chat-window');
  const closeChat = document.getElementById('close-chat');

  // Toggle chat window
  chatBubble.addEventListener('click', () => {
    const isVisible = chatWindow.style.display === 'flex';
    chatWindow.style.display = isVisible ? 'none' : 'flex';
  });

  closeChat.addEventListener('click', () => {
    chatWindow.style.display = 'none';
  });

  // Auto-open chat if URL hash matches #chat or on contact page
  if (window.location.hash === '#chat' || window.location.pathname.includes('contact.html')) {
    setTimeout(() => {
      chatWindow.style.display = 'flex';
    }, 500);
  }
})();
