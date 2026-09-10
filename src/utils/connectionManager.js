import TcpSocket from 'react-native-tcp-socket';
import ADBHelper from './adbHelper';
import tvWsServer from './tvWsServer';

const WS_PORT = 8001;
const HTTP_PORT = 8080;
const ADB_PORT = 5555;
const WS_RECONNECT_DELAY = 1000;
const WS_RECONNECT_MAX = 5;
const HEARTBEAT_INTERVAL = 5000;
const HEARTBEAT_TIMEOUT = 3000;

class ConnectionManager {
  constructor() {
    this._ip = null;
    this._activeLayer = null;
    this._ws = null;
    this._wsReconnectCount = 0;
    this._heartbeatInterval = null;
    this._onStatusChange = null;
    this._pendingCallbacks = new Map();
    this._requestId = 0;
    this._running = false;
  }

  onStatusChange(callback) {
    this._onStatusChange = callback;
  }

  _emit(status, detail) {
    if (this._onStatusChange) this._onStatusChange(status, detail);
  }

  async connect(ip) {
    this._ip = ip;
    this._running = true;
    this._emit('connecting', { ip });
    const layers = [
      { name: 'ws', port: WS_PORT, connect: () => this._tryWs(ip, WS_PORT) },
      { name: 'http', port: HTTP_PORT, connect: () => this._tryHttp(ip, HTTP_PORT) },
      { name: 'adb', port: ADB_PORT, connect: () => this._tryAdb(ip, ADB_PORT) },
    ];
    for (const layer of layers) {
      const ok = await layer.connect();
      if (ok) {
        this._activeLayer = layer.name;
        this._emit('connected', { layer: layer.name, ip, port: layer.port });
        this._startHeartbeat();
        return layer.name;
      }
    }
    this._activeLayer = null;
    this._emit('disconnected', { reason: 'all_layers_failed' });
    return null;
  }

  async _tryWs(ip, port) {
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(`ws://${ip}:${port}`);
        const timeout = setTimeout(() => {
          ws.close();
          resolve(false);
        }, 3000);
        ws.onopen = () => {
          clearTimeout(timeout);
          this._ws = ws;
          this._wsReconnectCount = 0;
          this._setupWsHandlers(ws);
          resolve(true);
        };
        ws.onerror = () => {
          clearTimeout(timeout);
          resolve(false);
        };
        ws.onclose = () => {
          if (this._activeLayer === 'ws' && this._running) {
            this._tryWsReconnect();
          }
        };
      } catch (e) {
        resolve(false);
      }
    });
  }

  _setupWsHandlers(ws) {
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.cmd && data.status) {
          const cb = this._pendingCallbacks.get(data.cmd);
          if (cb) { cb(data); this._pendingCallbacks.delete(data.cmd); }
        }
      } catch (e) {}
    };
    ws.onclose = () => {
      if (this._activeLayer === 'ws' && this._running) {
        this._tryWsReconnect();
      }
    };
    ws.onerror = () => {};
  }

  _tryWsReconnect() {
    if (this._wsReconnectCount >= WS_RECONNECT_MAX || !this._running) return;
    this._wsReconnectCount++;
    this._emit('reconnecting', { layer: 'ws', attempt: this._wsReconnectCount });
    setTimeout(async () => {
      const ok = await this._tryWs(this._ip, WS_PORT);
      if (ok) {
        this._activeLayer = 'ws';
        this._emit('connected', { layer: 'ws', ip: this._ip });
      } else if (this._running) {
        this._fallbackToNextLayer();
      }
    }, WS_RECONNECT_DELAY * this._wsReconnectCount);
  }

  async _fallbackToNextLayer() {
    if (this._activeLayer === 'ws') {
      const ok = await this._tryHttp(this._ip, HTTP_PORT);
      if (ok) {
        this._activeLayer = 'http';
        this._emit('connected', { layer: 'http', ip: this._ip });
        return;
      }
    }
    if (this._activeLayer === 'ws' || this._activeLayer === 'http') {
      const ok = await this._tryAdb(this._ip, ADB_PORT);
      if (ok) {
        this._activeLayer = 'adb';
        this._emit('connected', { layer: 'adb', ip: this._ip });
        return;
      }
    }
    this._activeLayer = null;
    this._emit('disconnected', { reason: 'all_layers_failed' });
  }

  async _tryHttp(ip, port) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`http://${ip}:${port}/ping`, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        return data.status === 'ok';
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  async _tryAdb(ip, port) {
    try {
      const result = await ADBHelper.directConnect(ip, port);
      return result.sukses;
    } catch (e) {
      return false;
    }
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatInterval = setInterval(() => {
      if (!this._running) { this._stopHeartbeat(); return; }
      this._heartbeat();
    }, HEARTBEAT_INTERVAL);
  }

  _stopHeartbeat() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
  }

  async _heartbeat() {
    const layer = this._activeLayer;
    if (!layer || !this._ip) return;
    let ok = false;
    switch (layer) {
      case 'ws': ok = this._ws && this._ws.readyState === WebSocket.OPEN; break;
      case 'http': ok = await this._tryHttp(this._ip, HTTP_PORT); break;
      case 'adb': ok = await this._tryAdb(this._ip, ADB_PORT); break;
    }
    if (!ok && this._running) {
      this._emit('heartbeat_failed', { layer });
      this._wsReconnectCount = 0;
      this._tryWsReconnect();
    }
    return ok;
  }

  async send(cmd, params = {}) {
    if (!this._activeLayer || !this._ip) return { status: 'error', message: 'Not connected' };
    const request = { cmd, ...params };
    switch (this._activeLayer) {
      case 'ws':
        return this._sendWs(request);
      case 'http':
        return this._sendHttp(request);
      case 'adb':
        return this._sendAdb(request);
      default:
        return { status: 'error', message: 'No active layer' };
    }
  }

  _sendWs(request) {
    return new Promise((resolve) => {
      if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
        resolve({ status: 'error', message: 'WebSocket not connected' });
        return;
      }
      const id = ++this._requestId;
      const msg = JSON.stringify({ ...request, id });
      this._pendingCallbacks.set(request.cmd, resolve);
      const timeout = setTimeout(() => {
        this._pendingCallbacks.delete(request.cmd);
        resolve({ status: 'error', message: 'Command timeout' });
      }, 10000);
      const originalResolve = resolve;
      this._pendingCallbacks.set(request.cmd, (data) => {
        clearTimeout(timeout);
        originalResolve(data);
      });
      try {
        this._ws.send(msg);
      } catch (e) {
        clearTimeout(timeout);
        this._pendingCallbacks.delete(request.cmd);
        resolve({ status: 'error', message: e.message });
      }
    });
  }

  async _sendHttp(request) {
    // HDMI → dedicated route
    if (request.cmd === 'input' && request.action === 'hdmi') {
      const port = request.port || 1;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`http://${this._ip}:${HTTP_PORT}/input/hdmi/${port}`, { signal: controller.signal });
        clearTimeout(timeout);
        return await res.json();
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    }
    const url = `http://${this._ip}:${HTTP_PORT}/${request.cmd}`;
    const queryParams = [];
    for (const [k, v] of Object.entries(request)) {
      if (k !== 'cmd') queryParams.push(`${k}=${encodeURIComponent(String(v))}`);
    }
    const fullUrl = queryParams.length > 0 ? `${url}?${queryParams.join('&')}` : url;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(fullUrl, { signal: controller.signal });
      clearTimeout(timeout);
      return await res.json();
    } catch (e) {
      return { status: 'error', message: e.message };
    }
  }

  async _sendAdb(request) {
    const cmd = request.cmd;
    try {
      switch (cmd) {
        case 'keyevent':
          await ADBHelper.shell(this._ip, `input keyevent ${request.keyCode}`, ADB_PORT);
          return { status: 'ok', cmd: 'keyevent' };
        case 'power':
          if (request.action === 'off') {
            await ADBHelper.powerOff(this._ip, ADB_PORT);
          } else {
            await ADBHelper.shell(this._ip, 'input keyevent 26', ADB_PORT);
          }
          return { status: 'ok', cmd: 'power' };
        case 'home':
          await ADBHelper.home(this._ip, ADB_PORT);
          return { status: 'ok' };
        case 'back':
          await ADBHelper.back(this._ip, ADB_PORT);
          return { status: 'ok' };
        case 'input':
          if (request.action === 'hdmi') {
            const hdmiKeys = {1:188, 2:189, 3:190, 4:191};
            const key = hdmiKeys[request.port] || 188;
            await ADBHelper.shell(this._ip, `input keyevent ${key}`, ADB_PORT);
            return { status: 'ok', cmd: 'input', action: 'hdmi', port: request.port };
          }
          return { status: 'error', message: `input: unknown action ${request.action}` };
        case 'volume':
          if (request.action === 'up') await ADBHelper.volume(this._ip, true, ADB_PORT);
          else if (request.action === 'down') await ADBHelper.volume(this._ip, false, ADB_PORT);
          return { status: 'ok' };
        case 'info':
          return await ADBHelper.getDeviceInfo(this._ip, ADB_PORT);
        case 'ping':
          return { status: 'ok', cmd: 'ping', result: 'pong' };
        case 'set_adb_port':
          await ADBHelper.setTcpipPort(this._ip, request.port || 5555, ADB_PORT);
          return { status: 'ok' };
        default:
          return { status: 'error', message: `ADB: unknown command ${cmd}` };
      }
    } catch (e) {
      return { status: 'error', message: e.message };
    }
  }

  getActiveLayer() {
    return this._activeLayer;
  }

  getActivePort() {
    switch (this._activeLayer) {
      case 'ws': return WS_PORT;
      case 'http': return HTTP_PORT;
      case 'adb': return ADB_PORT;
      default: return null;
    }
  }

  isConnected() {
    return this._activeLayer !== null;
  }

  async disconnect() {
    this._running = false;
    this._stopHeartbeat();
    if (this._ws) {
      try { this._ws.close(); } catch (e) {}
      this._ws = null;
    }
    this._activeLayer = null;
    this._ip = null;
    this._emit('disconnected', { reason: 'manual' });
  }

  async checkClientRunning(ip) {
    // Check billingtv WebSocket connection first
    if (tvWsServer.isRunning) {
      const connected = tvWsServer.getConnectedTvs();
      if (connected.some(tv => tv.connected)) return true;
    }
    // Fallback: check HTTP port
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`http://${ip}:${HTTP_PORT}/ping`, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        return data.status === 'ok';
      }
      return false;
    } catch (e) {
      return false;
    }
  }
}

const connectionManager = new ConnectionManager();
export default connectionManager;
