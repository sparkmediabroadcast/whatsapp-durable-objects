export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Serve WebSocket connection requests
    if (url.pathname === "/websocket") {
      // Force all clients to target 'global-room' unless explicitly overridden
      const roomName = url.searchParams.get("room") || "global-room";
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
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept WebSocket into Durable Object Hibernation state
    this.ctx.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  // Called automatically when any client sends a message over WebSocket
  async webSocketMessage(ws, message) {
    // Broadcast incoming message to ALL connected clients in this room
    const sockets = this.ctx.getWebSockets();
    for (const client of sockets) {
      try {
        client.send(message);
      } catch (e) {
        client.close(1011, "WebSocket send error");
      }
    }
  }

  async webSocketClose(ws, code, reason, wasClean) {
    ws.close(code, "Connection closed");
  }

  async webSocketError(ws, error) {
    ws.close(1011, "WebSocket error");
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
    body { background-color: #111b21; color: #e9edef; display: flex; height: 100vh; overflow: hidden; }
    #app { display: flex; width: 100%; max-width: 1600px; margin: 0 auto; height: 100vh; }
    .sidebar { width: 30%; border-right: 1px solid #222d34; background: #111b21; display: flex; flex-direction: column; }
    .chat-area { width: 70%; display: flex; flex-direction: column; background: #0b141a; }
    .header { background: #202c33; padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; height: 60px; }
    .messages { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
    .msg { max-width: 80%; padding: 8px 12px; border-radius: 8px; font-size: 14px; line-height: 19px; word-break: break-word; }
    .sent { background: #005c4b; align-self: flex-end; border-top-right-radius: 0; }
    .received { background: #202c33; align-self: flex-start; border-top-left-radius: 0; }
    .input-box { background: #202c33; padding: 10px; display: flex; align-items: center; gap: 10px; }
    input[type="text"] { flex: 1; background: #2a3942; border: none; padding: 12px; border-radius: 8px; color: #fff; outline: none; font-size: 15px; }
    button { background: #00a884; color: #fff; border: none; padding: 12px 18px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 14px; }
    
    @media (max-width: 768px) {
      .sidebar { display: none; }
      .chat-area { width: 100%; }
      .msg { max-width: 85%; }
    }
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
        <span id="status" style="font-size: 13px; color: #00a884;">Connecting...</span>
      </div>
      <div class="messages" id="msgContainer"></div>
      <div class="input-box">
        <input type="text" id="msgInput" placeholder="Type a message..." onkeydown="if(event.key==='Enter') sendMsg()">
        <button onclick="sendMsg()">Send</button>
      </div>
    </div>
  </div>

  <script>
    const clientId = Math.random().toString(36).substring(7);
    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(\`\${wsProtocol}//\${location.host}/websocket?room=global-room\`);
    const status = document.getElementById('status');
    const msgContainer = document.getElementById('msgContainer');

    ws.onopen = () => { 
      status.innerText = 'Online (' + clientId + ')'; 
      status.style.color = '#00a884';
    };
    
    ws.onclose = () => { 
      status.innerText = 'Disconnected'; 
      status.style.color = '#ea868f';
    };

    ws.onerror = () => {
      status.innerText = 'Error connecting';
      status.style.color = '#ea868f';
    };
    
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data && data.text) {
          const msgType = data.senderId === clientId ? 'sent' : 'received';
          appendMessage(data.text, msgType);
        }
      } catch (err) {
        console.error("Error parsing message frame:", err);
      }
    };

    function sendMsg() {
      const input = document.getElementById('msgInput');
      const text = input.value.trim();
      if (!text) return;

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ text, senderId: clientId }));
        input.value = '';
      } else {
        alert("Socket disconnected. Please refresh.");
      }
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