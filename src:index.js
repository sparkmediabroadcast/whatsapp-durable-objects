export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Serve WebSocket connection requests
    if (url.pathname === "/websocket") {
      const roomName = url.searchParams.get("room") || "default";
      const id = env.CHAT_ROOM.idFromName(roomName);
      const roomObject = env.CHAT_ROOM.get(id);
      return roomObject.fetch(request);
    }

    // Serve Frontend HTML UI
    return new Response(getHTML(), {
      headers: { "Content-Type": "text/html;charset=UTF-8" },
    });
  },
};

// --- DURABLE OBJECT CLASS ---
export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.sessions = new Set();
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server);
    this.sessions.add(server);

    server.addEventListener("message", (event) => {
      // Broadcast incoming live chat & WebRTC signals to all other connected clients
      for (const session of this.sessions) {
        if (session !== server) {
          try {
            session.send(event.data);
          } catch (e) {
            this.sessions.delete(session);
          }
        }
      }
    });

    server.addEventListener("close", () => {
      this.sessions.delete(server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}

// --- FRONTEND CLIENT UI ---
function getHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp Web - Durable Objects Edition</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: #111b21; color: #e9edef; display: flex; height: 100vh; }
    #app { display: flex; width: 100%; max-width: 1600px; margin: 0 auto; height: 100vh; }
    .sidebar { width: 30%; border-right: 1px solid #222d34; background: #111b21; display: flex; flex-direction: column; }
    .chat-area { width: 70%; display: flex; flex-direction: column; background: #0b141a; }
    .header { background: #202c33; padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; height: 60px; }
    .messages { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
    .msg { max-width: 65%; padding: 8px 12px; border-radius: 8px; font-size: 14px; line-height: 19px; word-break: break-word; }
    .sent { background: #005c4b; align-self: flex-end; border-top-right-radius: 0; }
    .received { background: #202c33; align-self: flex-start; border-top-left-radius: 0; }
    .input-box { background: #202c33; padding: 10px; display: flex; align-items: center; gap: 10px; }
    input[type="text"] { flex: 1; background: #2a3942; border: none; padding: 10px; border-radius: 8px; color: #fff; outline: none; }
    button { background: #00a884; color: #fff; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; font-weight: bold; }
  </style>
</head>
<body>
  <div id="app">
    <div class="sidebar">
      <div class="header"><h3>WhatsApp DO</h3></div>
      <div style="padding: 15px;">
        <p style="color: #8696a0; font-size: 13px;">Connected Room: <b>global-room</b></p>
      </div>
    </div>
    <div class="chat-area">
      <div class="header">
        <span id="status">Connecting...</span>
      </div>
      <div class="messages" id="msgContainer"></div>
      <div class="input-box">
        <input type="text" id="msgInput" placeholder="Type a message..." onkeydown="if(event.key==='Enter') sendMsg()">
        <button onclick="sendMsg()">Send</button>
      </div>
    </div>
  </div>

  <script>
    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(\`\${wsProtocol}//\${location.host}/websocket?room=global-room\`);
    const status = document.getElementById('status');
    const msgContainer = document.getElementById('msgContainer');

    ws.onopen = () => { status.innerText = 'Online'; };
    ws.onclose = () => { status.innerText = 'Disconnected'; };
    
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      appendMessage(data.text, 'received');
    };

    function sendMsg() {
      const input = document.getElementById('msgInput');
      if (!input.value.trim()) return;
      ws.send(JSON.stringify({ text: input.value }));
      appendMessage(input.value, 'sent');
      input.value = '';
    }

    function appendMessage(text, type) {
      const el = document.createElement('div');
      el.className = \`msg \${type}\`;
      el.innerText = text;
      msgContainer.appendChild(el);
      msgContainer.scrollTop = msgContainer.scrollHeight;
    }
  </script>
</body>
</html>`;
}