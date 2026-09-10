/**
 * tvWsServer.js — WebSocket server untuk android_tv_client.
 * Menggunakan react-native-tcp-socket sebagai TCP transport.
 * Implementasi RFC 6455 WebSocket protocol di atas TCP.
 */
import TcpSocket from 'react-native-tcp-socket';
import { Buffer } from 'buffer';
import {
  parseClientMessage, buildRegistered, buildError, buildPing,
} from './tvWsProtocol';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const PING_INTERVAL = 5000;
const STALE_TIMEOUT = 20000;
const MAX_FRAME_SIZE = 64 * 1024;

class TvWsServer {
  constructor() {
    this._server = null;
    this._running = false;
    this._port = 8080;
    this._clients = new Map(); // mejaId -> { socket, nama, lastSeen, screenOn, pendingData }
    this._pingTimer = null;
    this._sweepTimer = null;

    // Callbacks
    this.onClientConnect = null;    // (mejaId, info) => void
    this.onClientDisconnect = null; // (mejaId) => void
    this.onScreenToggle = null;     // (mejaId, screenOn) => void
    this.onMessage = null;          // (mejaId, type, data) => void
    this.onBuildState = null;       // (mejaId) => [{action,...}] — state snapshot saat REGISTER
  }

  // ─── Lifecycle ──────────────────────────────────────────────

  async start(port = 8080) {
    if (this._running) return true;
    this._port = port;

    return new Promise((resolve) => {
      try {
        this._server = TcpSocket.createServer((socket) => {
          this._handleConnection(socket);
        });

        this._server.listen({ port, host: '0.0.0.0', reuseAddress: true }, () => {
          this._running = true;
          this._startHeartbeat();
          console.log(`[TvWsServer] Running on port ${port}`);
          resolve(true);
        });

        this._server.on('error', (err) => {
          console.error('[TvWsServer] Server error:', err.message);
          if (!this._running) resolve(false);
        });
      } catch (e) {
        console.error('[TvWsServer] Failed to start:', e.message);
        resolve(false);
      }
    });
  }

  stop() {
    this._running = false;
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
    if (this._sweepTimer) { clearInterval(this._sweepTimer); this._sweepTimer = null; }

    for (const [mejaId, client] of this._clients) {
      try { client.socket.destroy(); } catch {}
    }
    this._clients.clear();

    if (this._server) {
      try { this._server.close(); } catch {}
      this._server = null;
    }
    console.log('[TvWsServer] Stopped');
  }

  // ─── Connection Handling ────────────────────────────────────

  _handleConnection(socket) {
    const addr = socket.address();
    const clientKey = `${addr?.address || 'unknown'}:${addr?.port || 0}`;

    let handshakeDone = false;
    let mejaId = null;
    let pendingData = Buffer.alloc(0);

    socket.on('data', (data) => {
      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);

      if (!handshakeDone) {
        pendingData = Buffer.concat([pendingData, chunk]);
        const str = pendingData.toString('utf8');
        const headerEnd = str.indexOf('\r\n\r\n');
        if (headerEnd === -1) return; // belum lengkap

        const rawHeaders = str.substring(0, headerEnd);
        pendingData = pendingData.slice(headerEnd + 4);

        const acceptHash = this._extractWsAccept(rawHeaders);
        if (!acceptHash) {
          socket.destroy();
          return;
        }

        // Kirim 101 Switching Protocols
        const response = [
          'HTTP/1.1 101 Switching Protocols',
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Accept: ${acceptHash}`,
          '',
          '',
        ].join('\r\n');
        socket.write(response);
        handshakeDone = true;

        // Process remaining data as WebSocket frames
        if (pendingData.length > 0) {
          this._processFrames(socket, pendingData, (mid) => { mejaId = mid; });
        }
        return;
      }

      // WebSocket frames
      this._processFrames(socket, chunk, (mid) => { mejaId = mid; });
    });

    socket.on('error', (err) => {
      console.log(`[TvWsServer] Socket error (${clientKey}):`, err.message);
    });

    socket.on('close', () => {
      if (mejaId) {
        const client = this._clients.get(mejaId);
        if (client && client.socket === socket) {
          this._clients.delete(mejaId);
          console.log(`[TvWsServer] Client disconnected: ${mejaId}`);
          if (this.onClientDisconnect) this.onClientDisconnect(mejaId);
        }
      }
    });
  }

  // ─── WebSocket Handshake ────────────────────────────────────

  _extractWsAccept(rawHeaders) {
    const lines = rawHeaders.split('\r\n');
    let key = null;
    let isUpgrade = false;

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.startsWith('sec-websocket-key:')) {
        key = line.split(':')[1].trim();
      }
      if (lower === 'upgrade: websocket' || lower.startsWith('upgrade:')) {
        isUpgrade = true;
      }
    }

    if (!key || !isUpgrade) return null;

    // SHA-1 hash synchronously using expo-crypto
    try {
      const combined = key + WS_GUID;
      // expo-crypto works with strings; we need raw SHA-1 then Base64
      // Use a simpler approach: SHA-1 via pure JS
      const hash = this._sha1Base64(combined);
      return hash;
    } catch {
      return null;
    }
  }

  // ─── SHA-1 + Base64 (pure JS, no native dependency) ─────────

  _sha1Base64(data) {
    // SHA-1 implementation per RFC 3174
    const msg = [];
    for (let i = 0; i < data.length; i++) msg.push(data.charCodeAt(i) & 0xff);

    const bitLen = msg.length * 8;
    msg.push(0x80);
    while (msg.length % 64 !== 56) msg.push(0);
    for (let i = 56; i >= 0; i -= 8) msg.push((bitLen / Math.pow(2, i)) & 0xff);

    let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE,
        h3 = 0x10325476, h4 = 0xC3D2E1F0;

    for (let i = 0; i < msg.length; i += 64) {
      const w = [];
      for (let j = 0; j < 16; j++) {
        w[j] = (msg[i + j * 4] << 24) | (msg[i + j * 4 + 1] << 16) |
               (msg[i + j * 4 + 2] << 8) | msg[i + j * 4 + 3];
      }
      for (let j = 16; j < 80; j++) {
        w[j] = this._rotl32(w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16], 1);
      }

      let [a, b, c, d, e] = [h0, h1, h2, h3, h4];

      for (let j = 0; j < 80; j++) {
        let f, k;
        if (j < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
        else if (j < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
        else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
        else { f = b ^ c ^ d; k = 0xCA62C1D6; }

        const temp = (this._rotl32(a, 5) + f + e + k + w[j]) | 0;
        e = d; d = c; c = this._rotl32(b, 30); b = a; a = temp;
      }

      h0 = (h0 + a) | 0;
      h1 = (h1 + b) | 0;
      h2 = (h2 + c) | 0;
      h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0;
    }

    const bytes = [
      (h0 >> 24) & 0xff, (h0 >> 16) & 0xff, (h0 >> 8) & 0xff, h0 & 0xff,
      (h1 >> 24) & 0xff, (h1 >> 16) & 0xff, (h1 >> 8) & 0xff, h1 & 0xff,
      (h2 >> 24) & 0xff, (h2 >> 16) & 0xff, (h2 >> 8) & 0xff, h2 & 0xff,
      (h3 >> 24) & 0xff, (h3 >> 16) & 0xff, (h3 >> 8) & 0xff, h3 & 0xff,
      (h4 >> 24) & 0xff, (h4 >> 16) & 0xff, (h4 >> 8) & 0xff, h4 & 0xff,
    ];

    return Buffer.from(bytes).toString('base64');
  }

  _rotl32(val, n) {
    return ((val << n) | (val >>> (32 - n))) >>> 0;
  }

  // ─── WebSocket Frame Processing ─────────────────────────────

  _processFrames(socket, data, onRegister) {
    let offset = 0;

    while (offset < data.length) {
      if (offset + 2 > data.length) break; // incomplete frame header

      const b0 = data[offset];
      const b1 = data[offset + 1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let payloadLen = b1 & 0x7f;
      let headerLen = 2;

      if (payloadLen === 126) {
        if (offset + 4 > data.length) break;
        payloadLen = (data[offset + 2] << 8) | data[offset + 3];
        headerLen = 4;
      } else if (payloadLen === 127) {
        if (offset + 10 > data.length) break;
        payloadLen = 0;
        for (let i = 0; i < 8; i++) {
          payloadLen = (payloadLen * 256) + data[offset + 2 + i];
        }
        headerLen = 10;
      }

      const maskLen = masked ? 4 : 0;
      const totalLen = headerLen + maskLen + payloadLen;
      if (offset + totalLen > data.length) break; // incomplete

      let payload = data.slice(offset + headerLen + maskLen, offset + totalLen);

      // Unmask
      if (masked) {
        const maskKey = data.slice(offset + headerLen, offset + headerLen + 4);
        for (let i = 0; i < payload.length; i++) {
          payload[i] = payload[i] ^ maskKey[i % 4];
        }
      }

      offset += totalLen;

      // Handle opcode
      switch (opcode) {
        case 0x01: // Text frame
          this._handleTextFrame(socket, payload.toString('utf8'), onRegister);
          break;
        case 0x08: // Close
          this._sendWsFrame(socket, 0x8, Buffer.alloc(0));
          socket.destroy();
          return;
        case 0x09: // Ping
          this._sendWsFrame(socket, 0xa, payload); // Pong
          break;
        case 0x0a: // Pong
          // Ignore
          break;
      }
    }
  }

  _handleTextFrame(socket, text, onRegister) {
    const parsed = parseClientMessage(text);
    if (!parsed) return;

    // Find which client this socket belongs to
    let currentMejaId = null;
    for (const [mid, client] of this._clients) {
      if (client.socket === socket) { currentMejaId = mid; break; }
    }

    switch (parsed.type) {
      case 'REGISTER': {
        const { mejaId, nama, device } = parsed;
        if (!mejaId) {
          this._sendWsJson(socket, buildError('meja_id wajib diisi'));
          return;
        }

        // Remove old registration if same socket
        if (currentMejaId && currentMejaId !== mejaId) {
          this._clients.delete(currentMejaId);
        }

        this._clients.set(mejaId, {
          socket,
          nama: nama || mejaId,
          device: device || 'android_tv',
          lastSeen: Date.now(),
          screenOn: null,
        });

        console.log(`[TvWsServer] Registered: ${mejaId} (${nama})`);
        this._sendWsJson(socket, buildRegistered(mejaId));

        // Build state snapshot & kirim ke client (mirip tv_ws_hub.py)
        if (this.onBuildState) {
          try {
            const cmds = this.onBuildState(mejaId);
            if (cmds && cmds.length > 0) {
              for (const cmd of cmds) {
                this._sendWsJson(socket, cmd);
              }
            }
          } catch (e) {
            console.log(`[TvWsServer] onBuildState error: ${e.message}`);
          }
        }

        if (onRegister) onRegister(mejaId);
        if (this.onClientConnect) this.onClientConnect(mejaId, { nama, device });
        break;
      }

      case 'PONG': {
        if (currentMejaId) {
          const client = this._clients.get(currentMejaId);
          if (client) client.lastSeen = Date.now();
        }
        break;
      }

      case 'SCREEN_STATE': {
        if (currentMejaId) {
          const client = this._clients.get(currentMejaId);
          if (client) {
            client.screenOn = parsed.screenOn;
            client.lastSeen = Date.now();
          }
          if (this.onScreenToggle) this.onScreenToggle(currentMejaId, parsed.screenOn);
          if (this.onMessage) this.onMessage(currentMejaId, 'SCREEN_STATE', parsed);
        }
        break;
      }

      case 'GET_TVS': {
        const tvs = this.getConnectedTvs();
        this._sendWsJson(socket, { type: 'TVS_RESPONSE', tvs });
        break;
      }
    }
  }

  // ─── Frame Encoding ─────────────────────────────────────────

  _sendWsFrame(socket, opcode, payload) {
    try {
      const len = payload.length;
      const header = [];

      header.push(0x80 | (opcode & 0x0f)); // FIN + opcode

      if (len < 126) {
        header.push(len);
      } else if (len < 65536) {
        header.push(126);
        header.push((len >> 8) & 0xff);
        header.push(len & 0xff);
      } else {
        header.push(127);
        for (let i = 7; i >= 0; i--) {
          header.push((len / Math.pow(256, i)) & 0xff);
        }
      }

      const buf = Buffer.concat([
        Buffer.from(header),
        payload,
      ]);
      socket.write(buf);
    } catch {}
  }

  _sendWsJson(socket, obj) {
    const json = JSON.stringify(obj, false);
    this._sendWsFrame(socket, 0x1, Buffer.from(json, 'utf8'));
  }

  // ─── Public API ─────────────────────────────────────────────

  sendTo(mejaId, message) {
    const client = this._clients.get(mejaId);
    if (!client) return false;
    try {
      this._sendWsJson(client.socket, message);
      return true;
    } catch {
      return false;
    }
  }

  broadcast(message) {
    let sent = 0;
    for (const [, client] of this._clients) {
      try {
        this._sendWsJson(client.socket, message);
        sent++;
      } catch {}
    }
    return sent;
  }

  isConnected(mejaId) {
    const client = this._clients.get(mejaId);
    if (!client) return false;
    return (Date.now() - client.lastSeen) < STALE_TIMEOUT;
  }

  getConnectedTvs() {
    const result = [];
    for (const [mejaId, client] of this._clients) {
      result.push({
        mejaId,
        nama: client.nama,
        device: client.device,
        screenOn: client.screenOn,
        connected: (Date.now() - client.lastSeen) < STALE_TIMEOUT,
        lastSeen: client.lastSeen,
      });
    }
    return result;
  }

  getConnectedIds() {
    return [...this._clients.keys()];
  }

  getScreenOn(mejaId) {
    const client = this._clients.get(mejaId);
    return client ? client.screenOn : null;
  }

  // ─── Heartbeat ──────────────────────────────────────────────

  _startHeartbeat() {
    this._pingTimer = setInterval(() => {
      if (!this._running) return;
      this.broadcast(buildPing());
      this._sweepStale();
    }, PING_INTERVAL);
  }

  _sweepStale() {
    const now = Date.now();
    for (const [mejaId, client] of this._clients) {
      if (now - client.lastSeen > STALE_TIMEOUT) {
        console.log(`[TvWsServer] Stale client removed: ${mejaId}`);
        try { client.socket.destroy(); } catch {}
        this._clients.delete(mejaId);
        if (this.onClientDisconnect) this.onClientDisconnect(mejaId);
      }
    }
  }

  // ─── Getter ─────────────────────────────────────────────────

  get isRunning() { return this._running; }
  get port() { return this._port; }
  get clientCount() { return this._clients.size; }
}

// Singleton
const tvWsServer = new TvWsServer();
export default tvWsServer;
