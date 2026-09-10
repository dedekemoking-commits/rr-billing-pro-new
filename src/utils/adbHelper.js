/**
 * ADB Helper untuk React Native
 *
 * Menggunakan raw TCP socket untuk terhubung ke ADB over Wi-Fi.
 * Library adbkit tidak compatible dengan Metro/React Native bundler,
 * jadi kita implementasikan handshake ADB minimal secara manual.
 */

import TcpSocket from 'react-native-tcp-socket';
import * as Network from 'expo-network';
import { Buffer } from 'buffer';
import { NativeModules, Platform, NativeEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';

const ADB_KEY_PRIV = 'rr_adb_privkey';
const ADB_KEY_PUB = 'rr_adb_pubkey';

let globalPublicKey = null;
let _keyInitPromise = null;

async function loadOrGenerateAdbKey() {
  if (Platform.OS !== 'android' || !NativeModules.AdbKeyModule) {
    throw new Error('AdbKeyModule not available on this platform');
  }
  const pubKey = await NativeModules.AdbKeyModule.getAdbPublicKey();
  if (!pubKey) throw new Error('getAdbPublicKey returned empty');
  globalPublicKey = pubKey;
  return { publicKey: pubKey };
}

function initGlobalKey() {
  _keyInitPromise = loadOrGenerateAdbKey().then(({ publicKey }) => {
    globalPublicKey = publicKey;
  });
}

initGlobalKey();

export async function ensureKeyReady() {
  if (_keyInitPromise) await _keyInitPromise;
}

export async function setCustomAdbKey(pemPrivateKey) {
  if (Platform.OS !== 'android' || !NativeModules.AdbKeyModule) {
    return false;
  }
  try {
    await NativeModules.AdbKeyModule.importAdbKey(pemPrivateKey);
    const pubKey = await NativeModules.AdbKeyModule.getAdbPublicKey();
    globalPublicKey = pubKey;
    AsyncStorage.setItem(ADB_KEY_PRIV, pemPrivateKey).catch(() => {});
    AsyncStorage.setItem(ADB_KEY_PUB, pubKey).catch(() => {});
    return true;
  } catch (e) {
    return false;
  }
}

const CMD = {
  CNXN: 0x4e584e43,
  AUTH: 0x48545541,
  OPEN: 0x4e45504f,
  OKAY: 0x59414b4f,
  CLSE: 0x45534c43,
  WRTE: 0x45545257,
};

const AUTH_TYPE = {
  TOKEN: 1,
  SIGNATURE: 2,
  PUBLIC_KEY: 3,
};

const ADB_DEFAULT_PORT = 5555;
const ADB_CONNECT_TIMEOUT = 8000;
const ADB_VERSION = 0x01000000;
const ADB_MAX_DATA = 4096;
const ADB_HOST_STRING = 'host::\0';

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = ((c & 1) !== 0) ? 0xedb88320 ^ (c >>> 1) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  const bytes = buffer instanceof Buffer ? buffer : Buffer.from(buffer);
  for (let i = 0; i < bytes.length; i += 1) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32LE(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value, 0);
  return buf;
}

function uint32BE(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value, 0);
  return buf;
}

function toBuffer(payload) {
  if (Buffer.isBuffer(payload)) return payload;
  return Buffer.from(payload, 'utf8');
}

function createAdbMessage(command, arg0, arg1, data = Buffer.alloc(0)) {
  const payload = toBuffer(data);
  const header = Buffer.alloc(24);
  header.writeUInt32LE(command, 0);
  header.writeUInt32LE(arg0, 4);
  header.writeUInt32LE(arg1, 8);
  header.writeUInt32LE(payload.length, 12);
  header.writeUInt32LE(crc32(payload), 16);
  header.writeUInt32LE((command ^ 0xffffffff) >>> 0, 20);
  return Buffer.concat([header, payload]);
}

function parseAdbHeader(buffer) {
  return {
    command: buffer.readUInt32LE(0),
    arg0: buffer.readUInt32LE(4),
    arg1: buffer.readUInt32LE(8),
    dataLength: buffer.readUInt32LE(12),
    dataCrc32: buffer.readUInt32LE(16),
    magic: buffer.readUInt32LE(20),
  };
}

function mpIntToBuffer(bigInt) {
  let hex = bigInt.toString(16);
  if (hex.length % 2 === 1) hex = `0${hex}`;
  let result = Buffer.from(hex, 'hex');
  if (result.length === 0) {
    result = Buffer.from([0]);
  }
  if ((result[0] & 0x80) !== 0) {
    result = Buffer.concat([Buffer.from([0]), result]);
  }
  return result;
}

function normalizeData(data) {
  if (typeof data === 'string') {
    return Buffer.from(data, 'utf8');
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  return data;
}

function bufferFromData(data) {
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === 'string') return Buffer.from(data, 'utf8');
  return Buffer.from(data);
}

class ADBConnection {
  constructor(ip, port) {
    this.ip = ip;
    this.port = port;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.connected = false;
    this.handshakePromise = null;
    this.handshakeResolve = null;
    this.handshakeReject = null;
    this.publicKey = null;
    this._sentSignature = false;
    this._sentPublicKey = false;
    this.stream = null;
    this.nextLocalId = 1;
  }

  ensureKeyPair() {
    if (!this.publicKey) {
      this.publicKey = globalPublicKey;
    }
  }

  createSocket() {
    this._sentSignature = false;
    this._sentPublicKey = false;
    this.connected = false;
    this.buffer = Buffer.alloc(0);
    this.stream = null;
    const conn = TcpSocket.createConnection({ host: this.ip, port: this.port, timeout: ADB_CONNECT_TIMEOUT }, () => {
      this.sendCnxn();
    });

    conn.setTimeout(0);

    conn.on('data', (raw) => {
      try {
        const chunk = normalizeData(raw);
        this.buffer = Buffer.concat([this.buffer, chunk]);
        this.processIncoming();
      } catch (e) {
        if (this.handshakeReject) {
          this.handshakeReject(e);
        }
        this.close();
      }
    });

    conn.on('error', (error) => {
      if (this.handshakeReject) {
        this.handshakeReject(error);
      }
      this.close();
    });

    conn.on('close', () => {
      if (!this.connected && this.handshakeReject) {
        this.handshakeReject(new Error('Connection closed before handshake completed'));
      }
      this.connected = false;
      this.socket = null;
    });

    conn.on('timeout', () => {
      if (this.handshakeReject) {
        this.handshakeReject(new Error('Connection timed out')); 
      }
      this.close();
    });

    this.socket = conn;
  }

  async connect(options = {}) {
    if (this.connected) {
      return true;
    }
    if (this.handshakePromise) {
      return this.handshakePromise;
    }
    this._sentSignature = false;
    this._sentPublicKey = false;

    const timeout = options.handshakeTimeout || 60000;
    this.handshakePromise = new Promise((resolve, reject) => {
      this.handshakeResolve = resolve;
      this.handshakeReject = reject;
      this.createSocket();
      setTimeout(() => {
        if (!this.connected) {
          reject(new Error('ADB handshake timeout'));
          this.close();
        }
      }, timeout);
    });

    return this.handshakePromise;
  }

  sendCnxn() {
    if (!this.socket) return;
    const payload = Buffer.concat([uint32LE(ADB_VERSION), uint32LE(ADB_MAX_DATA), Buffer.from(ADB_HOST_STRING, 'ascii')]);
    this.socket.write(createAdbMessage(CMD.CNXN, ADB_VERSION, ADB_MAX_DATA, payload));
  }

  async sendAuthSignature(token) {
    if (!this.socket) return;
    const tokenB64 = Buffer.from(token).toString('base64');
    const sigB64 = await NativeModules.AdbKeyModule.signToken(tokenB64);
    const signature = Buffer.from(sigB64, 'base64');
    const authSig = createAdbMessage(CMD.AUTH, AUTH_TYPE.SIGNATURE, 0, signature);
    this.socket.write(authSig);
  }

  sendAuthPublicKey() {
    if (!this.socket) return;
    const authKey = createAdbMessage(CMD.AUTH, AUTH_TYPE.PUBLIC_KEY, 0, Buffer.from(this.publicKey, 'ascii'));
    this.socket.write(authKey);
  }

  processIncoming() {
    while (this.buffer.length >= 24) {
      const header = parseAdbHeader(this.buffer.slice(0, 24));
      const totalLength = 24 + header.dataLength;
      if (this.buffer.length < totalLength || totalLength < 24) {
        return;
      }
      const payload = this.buffer.slice(24, totalLength);
      this.buffer = this.buffer.slice(totalLength);
      try {
        this.handleMessage(header, payload);
      } catch (e) {
        if (this.handshakeReject) {
          this.handshakeReject(e);
        }
        this.close();
        return;
      }
    }
  }

  handleMessage(header, payload) {
    if (header.magic !== ((header.command ^ 0xffffffff) >>> 0)) {
      return;
    }

    switch (header.command) {
      case CMD.AUTH:
        this.handleAuth(header, payload).catch((e) => {
          if (this.handshakeReject) this.handshakeReject(e);
          this.close();
        });
        break;
      case CMD.CNXN:
        this.connected = true;
        if (this.handshakeResolve) {
          this.handshakeResolve(true);
          this.handshakeResolve = null;
          this.handshakeReject = null;
        }
        break;
      case CMD.OKAY:
        this.handleOkay(header);
        break;
      case CMD.WRTE:
        this.handleWrite(header, payload);
        break;
      case CMD.CLSE:
        this.handleClose(header);
        break;
      default:
        break;
    }
  }

  async handleAuth(header, payload) {
    if (this.connected) return;
    const authType = header.arg0;
    if (authType === AUTH_TYPE.TOKEN) {
      this.ensureKeyPair();
      if (this.connected) return;
      if (!this._sentSignature) {
        this._sentSignature = true;
        await this.sendAuthSignature(payload);
      } else {
        // TV rejected our signature — send public key
        this._sentPublicKey = true;
        this.sendAuthPublicKey();
      }
      // Handshake timeout will fire if user doesn't accept.
    }
  }

  handleOkay(header) {
    if (!this.stream) return;
    const localId = header.arg1;
    if (localId !== this.stream.localId) return;
    if (!this.stream.remoteId) {
      this.stream.remoteId = header.arg0;
      this.stream.opened = true;
      if (this.stream.openResolve) {
        this.stream.openResolve();
        this.stream.openResolve = null;
      }
    }
  }

  handleWrite(header, payload) {
    if (!this.stream) return;
    const localId = header.arg1;
    if (localId !== this.stream.localId) return;

    if (this.stream.mode === 'sync') {
      if (payload.length >= 8) {
        const cmd = payload.readUInt32LE(0);
        const len = payload.readUInt32LE(4);
        if (cmd === 0x59414b4f) { // OKAY
          if (this.stream.syncResolve) {
            this.stream.syncResolve(true);
            this.stream.syncResolve = null;
          }
        } else if (cmd === 0x4c494146) { // FAIL
          const msg = len > 0 ? payload.slice(8, 8 + len).toString('utf8') : 'Unknown error';
          if (this.stream.syncReject) {
            this.stream.syncReject(new Error(msg));
            this.stream.syncReject = null;
          }
        }
      }
      this.sendOkay(header.arg1, header.arg0);
      return;
    }

    const text = payload.toString('utf8');
    if (this.stream.mode === 'persistent' && this.stream.onData) {
      this.stream.onData(text);
    } else {
      this.stream.output += text;
    }
    this.sendOkay(header.arg1, header.arg0);
  }

  handleClose(header) {
    if (!this.stream) return;
    const localId = header.arg1;
    if (localId !== this.stream.localId) return;
    if (this.stream.mode === 'persistent' && this.stream.onData) {
      this.stream.onData(null);
    }
    if (this.stream.closeResolve) {
      this.stream.closeResolve(this.stream.output);
      this.stream.closeResolve = null;
    }
    this.stream = null;
  }

  sendOkay(localId, remoteId) {
    if (!this.socket) return;
    this.socket.write(createAdbMessage(CMD.OKAY, localId, remoteId, Buffer.alloc(0)));
  }
  async openShell(command) {
    if (!this.socket) throw new Error('Socket not connected');
    if (this.stream) {
      this.stream = null;
    }
    const shellCmd = `shell:${command}\0`;
    const localId = this.nextLocalId++;
    this.stream = {
      localId,
      remoteId: 0,
      output: '',
      opened: false,
      openResolve: null,
      openReject: null,
      closeResolve: null,
      closeReject: null,
      mode: 'oneshot',
      onData: null,
    };

    const openPromise = new Promise((resolve, reject) => {
      this.stream.openResolve = resolve;
      this.stream.openReject = reject;
      setTimeout(() => {
        if (!this.stream || !this.stream.opened) {
          reject(new Error('Shell open timeout'));
          this.stream = null;
        }
      }, 10000);
    });

    this.socket.write(createAdbMessage(CMD.OPEN, localId, 0, Buffer.from(shellCmd, 'utf8')));

    return openPromise.then(() => {
      return new Promise((resolve, reject) => {
        if (!this.stream) {
          reject(new Error('Shell stream lost'));
          return;
        }
        this.stream.closeResolve = (output) => {
          resolve(output);
        };
        this.stream.closeReject = reject;
        setTimeout(() => {
          if (this.stream) {
            this.closeStream();
            reject(new Error('Shell command timeout'));
            this.stream = null;
          }
        }, 30000);
      });
    });
  }

  openPersistentShell() {
    if (!this.socket) throw new Error('Socket not connected');
    if (this.stream) {
      this.stream = null;
    }
    const localId = this.nextLocalId++;
    this.stream = {
      localId,
      remoteId: 0,
      output: '',
      opened: false,
      openResolve: null,
      openReject: null,
      closeResolve: null,
      closeReject: null,
      mode: 'persistent',
      onData: null,
    };

    const openPromise = new Promise((resolve, reject) => {
      this.stream.openResolve = resolve;
      this.stream.openReject = reject;
      setTimeout(() => {
        if (!this.stream || !this.stream.opened) {
          reject(new Error('Shell open timeout'));
          this.stream = null;
        }
      }, 10000);
    });

    this.socket.write(createAdbMessage(CMD.OPEN, localId, 0, Buffer.from('shell:\0', 'utf8')));

    return openPromise.then(() => {
      if (!this.stream) throw new Error('Shell stream lost');
      const control = {
        write: (data) => this.writeToStream(data),
        close: () => this.closeStream(),
        onData: (cb) => { if (this.stream) this.stream.onData = cb; },
      };
      return control;
    });
  }

  writeToStream(data) {
    if (!this.socket || !this.stream) throw new Error('No open stream');
    const payload = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    let offset = 0;
    while (offset < payload.length) {
      const chunkSize = Math.min(ADB_MAX_DATA, payload.length - offset);
      const chunk = payload.slice(offset, offset + chunkSize);
      this.socket.write(createAdbMessage(CMD.WRTE, this.stream.localId, this.stream.remoteId, chunk));
      offset += chunkSize;
    }
  }

  closeStream() {
    if (!this.socket || !this.stream) return;
    this.socket.write(createAdbMessage(CMD.CLSE, this.stream.remoteId, this.stream.localId, Buffer.alloc(0)));
  }

  close() {
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch (e) {}
      this.socket = null;
    }
    this.handshakePromise = null;
    this.handshakeResolve = null;
    this.handshakeReject = null;
    this.connected = false;
    this.buffer = Buffer.alloc(0);
    this.stream = null;
    this._sentSignature = false;
    this._sentPublicKey = false;
  }

  // ─── ADB Sync Protocol (file transfer) ───────────────────

  async openSync() {
    if (!this.socket) throw new Error('Socket not connected');
    if (this.stream) {
      this.stream = null;
    }
    const localId = this.nextLocalId++;
    this.stream = {
      localId,
      remoteId: 0,
      output: '',
      opened: false,
      openResolve: null,
      openReject: null,
      closeResolve: null,
      closeReject: null,
      mode: 'sync',
      syncResolve: null,
      syncReject: null,
    };

    const openPromise = new Promise((resolve, reject) => {
      this.stream.openResolve = resolve;
      this.stream.openReject = reject;
      setTimeout(() => {
        if (!this.stream || !this.stream.opened) {
          reject(new Error('Sync open timeout'));
          this.stream = null;
        }
      }, 10000);
    });

    this.socket.write(createAdbMessage(CMD.OPEN, localId, 0, Buffer.from('sync:\0', 'utf8')));
    return openPromise;
  }

  async syncWrite(data) {
    if (!this.socket || !this.stream) throw new Error('No sync stream');
    return new Promise((resolve, reject) => {
      this.stream.syncResolve = resolve;
      this.stream.syncReject = reject;
      this.socket.write(createAdbMessage(CMD.WRTE, this.stream.localId, this.stream.remoteId, data));
      setTimeout(() => {
        if (this.stream && this.stream.syncResolve) {
          this.stream.syncResolve = null;
          this.stream.syncReject = null;
          reject(new Error('Sync response timeout'));
        }
      }, 30000);
    });
  }

  async pushFile(remotePath, fileBuffer, options = {}) {
    const mode = options.mode || '0644';
    const mtime = options.mtime || 0;
    const maxChunk = ADB_MAX_DATA - 8; // 8 bytes for sync header

    await this.openSync();

    try {
      // SEND: path,mode\0
      const pathPayload = Buffer.from(`${remotePath},${mode}\0`, 'utf8');
      const sendMsg = Buffer.alloc(8);
      sendMsg.writeUInt32LE(0x444e4553, 0); // "SEND"
      sendMsg.writeUInt32LE(pathPayload.length, 4);
      await this.syncWrite(Buffer.concat([sendMsg, pathPayload]));

      // DATA chunks
      let offset = 0;
      while (offset < fileBuffer.length) {
        const chunkSize = Math.min(maxChunk, fileBuffer.length - offset);
        const chunk = fileBuffer.slice(offset, offset + chunkSize);
        const dataMsg = Buffer.alloc(8);
        dataMsg.writeUInt32LE(0x41544144, 0); // "DATA"
        dataMsg.writeUInt32LE(chunkSize, 4);
        await this.syncWrite(Buffer.concat([dataMsg, chunk]));
        offset += chunkSize;
      }

      // DONE: timestamp
      const doneMsg = Buffer.alloc(12);
      doneMsg.writeUInt32LE(0x454e4f44, 0); // "DONE"
      doneMsg.writeUInt32LE(4, 4);
      doneMsg.writeUInt32LE(mtime, 8);
      await this.syncWrite(doneMsg);

      // QUIT
      const quitMsg = Buffer.alloc(8);
      quitMsg.writeUInt32LE(0x54495551, 0); // "QUIT"
      quitMsg.writeUInt32LE(0, 4);
      this.socket.write(createAdbMessage(CMD.WRTE, this.stream.localId, this.stream.remoteId, quitMsg));

      return { sukses: true, pesan: `File pushed to ${remotePath}` };
    } catch (error) {
      this.closeStream();
      throw error;
    }
  }
}

const connections = new Map();

// ─── Key Management ────────────────────────────────────
let _keyOverrideHandler = null;

export function onKeyOverride(callback) {
  _keyOverrideHandler = callback;
}

export function getCurrentPublicKey() {
  return globalPublicKey;
}

// ─── ADBHelper Class ──────────────────────────────────
export class ADBHelper {
  static async checkPortOpen(ip, port = ADB_DEFAULT_PORT, timeout = ADB_CONNECT_TIMEOUT) {
    return new Promise((resolve) => {
      const socket = TcpSocket.createConnection({ host: ip, port, timeout }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => resolve(false));
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
  }

  static async connect(ip, port = ADB_DEFAULT_PORT, options = {}) {
    await ensureKeyReady();
    const key = `${ip}:${port}`;
    let connection = connections.get(key);
    if (connection && connection.connected) {
      return { sukses: true, pesan: `Terhubung ke ${key} (cached)` };
    }

    const retries = [0, 2000, 5000];
    for (let i = 0; i < retries.length; i++) {
      if (retries[i] > 0) {
        await new Promise(r => setTimeout(r, retries[i]));
      }
      try {
        if (connection) connection.close();
        connection = new ADBConnection(ip, port);
        connections.set(key, connection);
        await connection.connect(options);
        return { sukses: true, pesan: `Terhubung ke ${key}` };
      } catch (error) {
        if (error.message === 'PUBLIC_KEY_REJECTED') {
          return { sukses: false, pesan: 'PUBLIC_KEY_REJECTED' };
        }
        if (i === retries.length - 1) {
          return { sukses: false, pesan: error.message || 'Koneksi gagal' };
        }
      }
    }
    return { sukses: false, pesan: 'Koneksi gagal' };
  }

  static disconnect(ip, port = ADB_DEFAULT_PORT) {
    const key = `${ip}:${port}`;
    const connection = connections.get(key);
    if (connection) {
      connection.close();
      connections.delete(key);
    }
  }

  static disconnectAll() {
    for (const [key, conn] of connections.entries()) {
      conn.close();
      connections.delete(key);
    }
  }

  static getConnectedDevices() {
    const devices = [];
    for (const key of connections.keys()) {
      const [ip, port] = key.split(':');
      devices.push({ ip, port: parseInt(port) });
    }
    return devices;
  }

  static async shell(ip, command, port = ADB_DEFAULT_PORT) {
    try {
      const key = `${ip}:${port}`;
      let connection = connections.get(key);
      if (!connection || !connection.socket || !connection.connected) {
        if (connection) connection.close();
        connection = new ADBConnection(ip, port);
        connections.set(key, connection);
        await connection.connect();
      }
      const output = await connection.openShell(command);
      return { sukses: true, pesan: 'OK', output };
    } catch (error) {
      return { sukses: false, pesan: error.message || 'Shell command gagal', output: '' };
    }
  }

  static async powerOff(ip, port = ADB_DEFAULT_PORT) {
    return this.shell(ip, 'input keyevent 26', port);
  }

  static async volumeUp(ip, port = ADB_DEFAULT_PORT) {
    return this.shell(ip, 'input keyevent 24', port);
  }

  static async volumeDown(ip, port = ADB_DEFAULT_PORT) {
    return this.shell(ip, 'input keyevent 25', port);
  }

  static async getDeviceInfo(ip, port = ADB_DEFAULT_PORT) {
    const brand = await this.shell(ip, 'getprop ro.product.brand', port);
    const model = await this.shell(ip, 'getprop ro.product.model', port);
    const android = await this.shell(ip, 'getprop ro.build.version.release', port);
    return {
      sukses: true,
      brand: brand.output || 'Unknown',
      model: model.output || 'Unknown',
      android: android.output || 'Unknown',
    };
  }

  static async getLocalIP() {
    try {
      const ip = await Network.getIpAddressAsync();
      return ip || null;
    } catch (error) {
      return null;
    }
  }

  static async scanNetwork(localIP, onProgress = () => {}, onFound = () => {}, options = {}) {
    if (!localIP) return [];
    const prefix = options.subnet || localIP.split('.').slice(0, 3).join('.');
    const ips = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`);
    const results = [];
    const concurrency = options.concurrency || 10;
    let completed = 0;

    const runCheck = async (addr) => {
      if (addr === localIP) {
        completed += 1;
        onProgress(completed, ips.length);
        return;
      }
      try {
        const ok = await this.ping(addr, ADB_DEFAULT_PORT, 1000);
        if (ok) {
          results.push({ ip: addr, port: ADB_DEFAULT_PORT });
          onFound(addr, ADB_DEFAULT_PORT);
        }
      } catch (e) {
        // ignore
      }
      completed += 1;
      onProgress(completed, ips.length);
    };

    const worker = async () => {
      while (ips.length > 0) {
        const addr = ips.shift();
        if (!addr) break;
        await runCheck(addr);
      }
    };

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);
    return results;
  }

  static async pairDevice(ip, pairPort, pin) {
    if (!pin || pin.length !== 6) {
      return { sukses: false, pesan: 'PIN harus 6 digit' };
    }
    if (Platform.OS === 'android' && NativeModules.AdbPairingModule) {
      try {
        const result = await NativeModules.AdbPairingModule.pairDevice(ip, pairPort, pin);
        if (result.success) {
          return { sukses: true, pesan: result.message || 'Pairing berhasil' };
        }
        return { sukses: false, pesan: result.error || 'Pairing gagal' };
      } catch (e) {
        return { sukses: false, pesan: e.message || 'Gagal pairing via native' };
      }
    }
    return {
      sukses: false,
      pesan: 'Pairing native tidak tersedia di platform ini. Gunakan Termux: adb pair ' + ip + ':' + pairPort + ' ' + pin,
    };
  }

  static async setTcpipPort(ip, port = 5555, currentPort = ADB_DEFAULT_PORT) {
    try {
      const r1 = await ADBHelper.shell(ip, `setprop service.adb.tcp.port ${port}`, currentPort);
      if (!r1.sukses) return r1;
      // Stop adbd — init akan restart otomatis di port baru
      ADBHelper.shell(ip, 'stop adbd', currentPort).catch(() => {});
      ADBHelper.disconnect(ip, currentPort);
      return { sukses: true, pesan: `Port ADB diubah ke ${port}. Koneksi akan pulang dalam beberapa detik.` };
    } catch (e) {
      return { sukses: false, pesan: e.message || 'Gagal mengubah port TCPIP' };
    }
  }

  static async openInteractiveShell(ip, port = ADB_DEFAULT_PORT) {
    const key = `${ip}:${port}`;
    let connection = connections.get(key);
    if (!connection || !connection.socket || !connection.connected) {
      if (connection) connection.close();
      connection = new ADBConnection(ip, port);
      connections.set(key, connection);
      await connection.connect();
    }
    return connection.openPersistentShell();
  }

  static async powerToggle(ip, port = ADB_DEFAULT_PORT) {
    return this.shell(ip, 'input keyevent 26', port);
  }

  static async volume(ip, up = true, port = ADB_DEFAULT_PORT) {
    return this.shell(ip, `input keyevent ${up ? 24 : 25}`, port);
  }

  static async home(ip, port = ADB_DEFAULT_PORT) {
    return this.shell(ip, 'input keyevent 3', port);
  }

  static async back(ip, port = ADB_DEFAULT_PORT) {
    return this.shell(ip, 'input keyevent 4', port);
  }

  static async ping(ip, port = ADB_DEFAULT_PORT, timeout = 1000) {
    return new Promise((resolve) => {
      let done = false;
      const socket = TcpSocket.createConnection({ host: ip, port, timeout }, () => {
        if (!done) { done = true; socket.destroy(); resolve(true); }
      });
      socket.on('error', () => { if (!done) { done = true; resolve(false); }});
      socket.on('timeout', () => { if (!done) { done = true; socket.destroy(); resolve(false); }});
      setTimeout(() => {
        if (!done) { done = true; socket.destroy(); resolve(false); }
      }, timeout + 500);
    });
  }

  static async scanPorts(ip, options = {}) {
    const { from = 37000, to = 45000, step = 10, concurrency = 25, timeout = 300, onProgress = null } = options;

    const ports = [];
    for (let p = from; p <= to; p += step) ports.push(p);

    const results = [];
    let completed = 0;
    const total = ports.length;

    const checkPort = async (port) => {
      const ok = await ADBHelper.ping(ip, port, timeout);
      if (ok) results.push({ ip, port });
      completed++;
      if (onProgress) onProgress(completed, total, results);
    };

    const workers = Array.from({ length: concurrency }, async () => {
      while (ports.length > 0) {
        const port = ports.shift();
        if (port === undefined) break;
        await checkPort(port);
      }
    });

    await Promise.all(workers);
    return results;
  }

  // ─── File Transfer ─────────────────────────────────────

  static async pushFileBuffer(ip, remotePath, fileBuffer, port = ADB_DEFAULT_PORT) {
    try {
      const key = `${ip}:${port}`;
      let connection = connections.get(key);
      if (!connection || !connection.socket || !connection.connected) {
        if (connection) connection.close();
        connection = new ADBConnection(ip, port);
        connections.set(key, connection);
        await connection.connect();
      }
      const result = await connection.pushFile(remotePath, fileBuffer);
      return result;
    } catch (error) {
      return { sukses: false, pesan: error.message || 'Push file gagal' };
    }
  }

  static async pushFileBase64(ip, remotePath, base64Data, port = ADB_DEFAULT_PORT) {
    const buffer = Buffer.from(base64Data, 'base64');
    return ADBHelper.pushFileBuffer(ip, remotePath, buffer, port);
  }

  static async pushApk(ip, apkBase64, port = ADB_DEFAULT_PORT) {
    return ADBHelper.pushFileBase64(ip, '/data/local/tmp/app.apk', apkBase64, port);
  }

  static async pushAndInstall(ip, apkBase64, port = ADB_DEFAULT_PORT) {
    const pushResult = await ADBHelper.pushFileBase64(ip, '/data/local/tmp/app.apk', apkBase64, port);
    if (!pushResult.sukses) return pushResult;
    // Uninstall dulu untuk handle signature conflict
    await ADBHelper.shell(ip, 'pm uninstall com.rrcctv.rr_tv_client 2>/dev/null || true', port);
    return ADBHelper.shell(ip, 'pm install -r -t -d /data/local/tmp/app.apk', port);
  }

  // Transfer APK via echo-chunk + base64 decode (no install)
  static async pushApkBase64(ip, apkBase64, port = ADB_DEFAULT_PORT, onProgress = null) {
    try {
      const key = `${ip}:${port}`;
      let connection = connections.get(key);
      if (!connection || !connection.socket || !connection.connected) {
        if (connection) connection.close();
        connection = new ADBConnection(ip, port);
        connections.set(key, connection);
        await connection.connect();
      }

      const shell = await connection.openPersistentShell();
      const chunkSize = 8000;
      const totalChunks = Math.ceil(apkBase64.length / chunkSize);
      if (onProgress) onProgress(0, totalChunks, 'sending');

      // Clean old files
      shell.write('rm -f /data/local/tmp/tmp.b64 /data/local/tmp/app.apk\n');

      // First chunk (overwrite)
      shell.write(`echo '${apkBase64.substring(0, chunkSize)}' > /data/local/tmp/tmp.b64\n`);

      // Remaining chunks (append)
      for (let i = 1; i < totalChunks; i++) {
        const chunk = apkBase64.substring(i * chunkSize, Math.min((i + 1) * chunkSize, apkBase64.length));
        shell.write(`echo '${chunk}' >> /data/local/tmp/tmp.b64\n`);
        if (i % 100 === 0) await new Promise(r => setTimeout(r, 50));
        if (onProgress) onProgress(i, totalChunks, 'sending');
      }
      await new Promise(r => setTimeout(r, 1000));

      // Decode
      if (onProgress) onProgress(totalChunks, totalChunks, 'decoding');
      let output = '';
      shell.onData((d) => { if (d) output += d; });
      shell.write('cat /data/local/tmp/tmp.b64 | tr -d "\\n" | base64 -d > /data/local/tmp/app.apk 2>&1; echo "DECODE_DONE"\n');

      const deadline = Date.now() + 30000;
      while (Date.now() < deadline && !output.includes('DECODE_DONE')) {
        await new Promise(r => setTimeout(r, 500));
      }
      shell.close();

      const decoded = output.includes('DECODE_DONE');
      if (onProgress) onProgress(totalChunks, totalChunks, decoded ? 'done' : 'failed');
      return { sukses: decoded, pesan: decoded ? 'APK terkirim' : 'Decode gagal: ' + output.substring(-100) };
    } catch (e) {
      return { sukses: false, pesan: e.message || 'Gagal kirim APK' };
    }
  }

  // Buka package installer di TV via intent
  static async intentInstallApk(ip, port = ADB_DEFAULT_PORT) {
    // Try direktori sdcard dulu (Android TV mungkin block /data/local/tmp/)
    const copyCmd = 'cp /data/local/tmp/app.apk /sdcard/Download/tv-client.apk 2>/dev/null; '
      + 'am start -a android.intent.action.VIEW '
      + '-d "file:///sdcard/Download/tv-client.apk" '
      + '-t "application/vnd.android.package-archive" '
      + '2>&1; echo "INTENT_DONE"';

    const result = await ADBHelper.shell(ip, copyCmd, port);
    return { sukses: result.sukses, pesan: result.sukses ? 'Dialog install terbuka di TV' : result.pesan };
  }

  static async findTV(ip, oldPort) {
    const deadline = Date.now() + 55000;
    const curPort = oldPort || 5555;

    const tryPort = async (port) => {
      if (Date.now() > deadline) return null;
      const ok = await ADBHelper.ping(ip, port, 1500);
      if (!ok) return null;
      const result = await ADBHelper.connect(ip, port);
      if (result.sukses) return { ip, port };
      if (result.pesan === 'PUBLIC_KEY_REJECTED') return { ip, port, needsPairing: true };
      return null;
    };

    // 1. Try current/old port
    const r1 = await tryPort(curPort);
    if (r1) return r1;

    // 2. Try standard ADB port
    if (curPort !== 5555) {
      const r2 = await tryPort(5555);
      if (r2) return r2;
    }

    // 3. Scan range 37000-45000 step 10
    const found = await ADBHelper.scanPorts(ip, { step: 10, concurrency: 30, timeout: 300 });
    for (const { port } of found) {
      if (Date.now() > deadline) break;
      if (port === curPort || port === 5555) continue;
      const r = await tryPort(port);
      if (r) {
        if (oldPort && r.ip) ADBHelper.disconnect(ip, oldPort);
        return r;
      }
    }

    return null;
  }

  // ─── Direct Connection ─────────────────────────────
  static async directConnect(ip, port = ADB_DEFAULT_PORT, options = {}) {
    await ensureKeyReady();
    const key = `${ip}:${port}`;
    const retries = options.retries || 2;
    const retryDelay = options.retryDelay || 2000;
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, retryDelay));
      }
      try {
        let connection = connections.get(key);
        if (connection) connection.close();
        connection = new ADBConnection(ip, port);
        connections.set(key, connection);
        await connection.connect({ handshakeTimeout: 15000 });
        return { sukses: true, pesan: `Terhubung ke ${key}` };
      } catch (error) {
        lastError = error;
        if (error.message === 'PUBLIC_KEY_REJECTED') {
          return { sukses: false, pesan: 'PUBLIC_KEY_REJECTED' };
        }
      }
    }
    return { sukses: false, pesan: lastError ? lastError.message : 'Gagal connect' };
  }

  static async testTcpConnection(ip, port = ADB_DEFAULT_PORT, timeout = 3000) {
    return new Promise((resolve) => {
      let done = false;
      const start = Date.now();
      try {
        const socket = TcpSocket.createConnection({ host: ip, port, timeout }, () => {
          if (!done) { done = true; const elapsed = Date.now() - start; socket.destroy(); resolve({ ok: true, elapsed }); }
        });
        socket.on('error', (err) => { if (!done) { done = true; resolve({ ok: false, error: err.message }); }});
        socket.on('timeout', () => { if (!done) { done = true; socket.destroy(); resolve({ ok: false, error: 'timeout' }); }});
        setTimeout(() => {
          if (!done) { done = true; try { socket.destroy(); } catch (_) {} resolve({ ok: false, error: 'overall_timeout' }); }
        }, timeout + 1000);
      } catch (e) {
        if (!done) { done = true; resolve({ ok: false, error: e.message }); }
      }
    });
  }

  static async getLocalSubnet() {
    try {
      const ip = await Network.getIpAddressAsync();
      if (!ip) return null;
      const parts = ip.split('.');
      if (parts.length !== 4) return null;
      return { localIP: ip, subnet: parts.slice(0, 3).join('.'), prefix: parts[2] };
    } catch (e) {
      return null;
    }
  }

  // ─── Push & Install APK via Sync Protocol ─────────────

  static async pushAndInstallApk(ip, port, apkFilePath, options = {}) {
    const remotePath = '/data/local/tmp/update.apk';
    const mode = '33206';
    const mtime = options.mtime || Math.floor(Date.now() / 1000);
    const maxChunk = ADB_MAX_DATA - 8;
    const onProgress = options.onProgress || null;

    // 1. Connect ke ADB
    const key = `${ip}:${port}`;
    let connection = connections.get(key);
    if (!connection || !connection.socket || !connection.connected) {
      if (connection) connection.close();
      connection = new ADBConnection(ip, port);
      connections.set(key, connection);
      try {
        await connection.connect();
      } catch (e) {
        return { sukses: false, pesan: `Gagal konek ADB: ${e.message}` };
      }
    }

    // 2. Baca info file APK
    let fileSize;
    try {
      const stat = await RNFS.stat(apkFilePath);
      fileSize = stat.size;
    } catch (e) {
      return { sukses: false, pesan: `File APK tidak ditemukan: ${e.message}` };
    }

    // 3. Push via sync protocol (SEND + DATA chunks + DONE + QUIT)
    try {
      await connection.openSync();

      // SEND: path,mode\0
      const pathPayload = Buffer.from(`${remotePath},${mode}\0`, 'utf8');
      const sendHdr = Buffer.alloc(8);
      sendHdr.writeUInt32LE(0x444e4553, 0);
      sendHdr.writeUInt32LE(pathPayload.length, 4);
      await connection.syncWrite(Buffer.concat([sendHdr, pathPayload]));

      // DATA chunks — baca file per 64KB via RNFS, kirim per maxChunk
      let offset = 0;
      while (offset < fileSize) {
        const chunkSize = Math.min(maxChunk, fileSize - offset);
        const b64Chunk = await RNFS.read(apkFilePath, chunkSize, offset);
        const chunk = Buffer.from(b64Chunk, 'base64');

        const dataHdr = Buffer.alloc(8);
        dataHdr.writeUInt32LE(0x41544144, 0);
        dataHdr.writeUInt32LE(chunkSize, 4);
        await connection.syncWrite(Buffer.concat([dataHdr, chunk]));

        offset += chunkSize;
        if (onProgress) onProgress(offset, fileSize, 'sending');
      }

      // DONE
      const doneMsg = Buffer.alloc(12);
      doneMsg.writeUInt32LE(0x454e4f44, 0);
      doneMsg.writeUInt32LE(4, 4);
      doneMsg.writeUInt32LE(mtime, 8);
      await connection.syncWrite(doneMsg);

      // QUIT (sync selesai)
      const quitMsg = Buffer.alloc(8);
      quitMsg.writeUInt32LE(0x54495551, 0);
      quitMsg.writeUInt32LE(0, 4);
      connection.socket.write(createAdbMessage(CMD.WRTE, connection.stream.localId, connection.stream.remoteId, quitMsg));
      connection.stream = null;
    } catch (e) {
      connection.closeStream();
      return { sukses: false, pesan: `Push APK gagal: ${e.message}` };
    }

    // 4. Install APK via shell
    try {
      if (onProgress) onProgress(fileSize, fileSize, 'installing');

      const installOut = await connection.openShell(
        'pm install -r -t -d /data/local/tmp/update.apk 2>&1; echo "INSTALL_EXIT:$?"'
      );

      const success = !installOut.includes('Failure')
        && !installOut.includes('INSTALL_EXIT:1')
        && !installOut.includes('INSTALL_EXIT:2');

      if (success) {
        if (onProgress) onProgress(fileSize, fileSize, 'done');
        return { sukses: true, pesan: '✅ APK berhasil diinstal' };
      }

      const errorLine = installOut
        .split('\n')
        .filter(l => l.includes('Failure') || l.includes('Error'))
        .join('; ');
      return {
        sukses: false,
        pesan: errorLine
          ? `❌ ${errorLine}`
          : `❌ ${installOut.slice(-200)}`,
      };
    } catch (e) {
      return { sukses: false, pesan: `Install gagal: ${e.message}` };
    }
  }

  // ─── mDNS Discovery ─────────────────────────────────

  static _mdnsEmitter = null;

  static startMDNSDiscovery(targetIp, onFound, onStatus) {
    if (!NativeModules.AdbMDNSModule) {
      if (onStatus) onStatus('error', 'mDNS native module not available');
      return;
    }
    ADBHelper.stopMDNSDiscovery();
    ADBHelper._mdnsEmitter = new NativeEventEmitter(NativeModules.AdbMDNSModule);
    ADBHelper._mdnsEmitter.addListener('AdbMDNSFound', (event) => {
      if (onFound) onFound(event.ip, event.port, event.serviceName, event.serviceType);
    });
    ADBHelper._mdnsEmitter.addListener('AdbMDNSStatus', (event) => {
      if (onStatus) onStatus(event.status, event.message);
    });
    NativeModules.AdbMDNSModule.startDiscovery(targetIp);
  }

  static stopMDNSDiscovery() {
    if (NativeModules.AdbMDNSModule) {
      NativeModules.AdbMDNSModule.stopDiscovery();
    }
    if (ADBHelper._mdnsEmitter) {
      ADBHelper._mdnsEmitter.removeAllListeners('AdbMDNSFound');
      ADBHelper._mdnsEmitter.removeAllListeners('AdbMDNSStatus');
      ADBHelper._mdnsEmitter = null;
    }
  }
}

export default ADBHelper;
