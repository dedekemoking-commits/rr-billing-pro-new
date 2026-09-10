import { NativeModules } from 'react-native';

const Atpv2Tls = NativeModules.Atpv2Tls;
const ATPv2Native = NativeModules.ATPv2PairingModule;
const hasNative = !!Atpv2Tls; // Enable if native module available

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as forge from 'node-forge';
import {
  encodePairingRequest, encodeOptions, encodeConfiguration, encodeSecret,
  encodeRemoteConfig, encodeKeyInject, encodePong, encodeSetActive,
  readAllPairingMessages, parseRemoteMessages, RemoteFeature, REMOTE_FEATURES_CLIENT,
} from './atpv2Proto';

const PAIRING_PORT = 6467;
const REMOTE_PORT = 6466;
const CONNECT_TIMEOUT = 10000;
const RESPONSE_TIMEOUT = 15000;
const CERT_KEY_PREFIX = 'rr_atpv2_';

let _pairingSocketId = -1;
let _pairingServerPubKeyHex = null;
let _pairingServerCertDer = null;
let _cachedCert = null;
const CACHED_CERT_KEY = 'rr_atpv2_cached_cert';

// ─── Storage ──────────────────────────────────────────────────

export async function saveCertificate(ip, certObj) {
  await AsyncStorage.setItem(`${CERT_KEY_PREFIX}${ip}`, JSON.stringify(certObj));
}

export async function loadCertificate(ip) {
  try {
    const raw = await AsyncStorage.getItem(`${CERT_KEY_PREFIX}${ip}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function removeCertificate(ip) {
  await AsyncStorage.removeItem(`${CERT_KEY_PREFIX}${ip}`);
}

// ─── Certificate generation ───────────────────────────────────

export async function generateCertificate() {
  if (_cachedCert && _cachedCert.key && _cachedCert.cert) {
    console.log('[ATPv2] Using cached certificate');
    return _cachedCert;
  }
  try {
    const raw = await AsyncStorage.getItem(CACHED_CERT_KEY);
    if (raw) {
      _cachedCert = JSON.parse(raw);
      console.log('[ATPv2] Loaded certificate from storage');
      return _cachedCert;
    }
  } catch {}
  return jsGenerateCertificate();
}

function jsGenerateCertificate() {
  return new Promise((resolve, reject) => {
    try {
      setTimeout(() => {
        console.log('[ATPv2] Generating RSA key pair (2048 bit)...');
        const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
        const cert = forge.pki.createCertificate();
        cert.publicKey = keys.publicKey;
        cert.serialNumber = Date.now().toString(16);
        const now = new Date();
        cert.validity.notBefore = now;
        cert.validity.notAfter = new Date(now.getTime() + 365 * 86400000);
        const attrs = [
          { name: 'commonName', value: 'RR Billing Pro' },
          { name: 'organizationName', value: 'RR CCTV' },
        ];
        cert.setSubject(attrs);
        cert.setIssuer(attrs);
        cert.sign(keys.privateKey, forge.md.sha256.create());
        const result = {
          key: forge.pki.privateKeyToPem(keys.privateKey),
          cert: forge.pki.certificateToPem(cert),
          pub: forge.pki.publicKeyToPem(keys.publicKey),
        };
        _cachedCert = result;
        AsyncStorage.setItem(CACHED_CERT_KEY, JSON.stringify(result)).catch(() => {});
        console.log('[ATPv2] Certificate generated (2048-bit RSA) & cached');
        resolve(result);
      }, 10);
    } catch (e) { reject(e); }
  });
}

export async function warmUpCertificate() {
  try {
    const cert = await generateCertificate();
    console.log('[ATPv2] Certificate warmed up OK');
    return cert;
  } catch (e) {
    console.log('[ATPv2] warmUp error:', e.message);
    return null;
  }
}

// ─── Native bridge helpers (return plain arrays, NO Buffer) ────

function nativeConnectTLS(ip, port, certObj, timeout) {
  return new Promise((resolve, reject) => {
    if (!Atpv2Tls) { reject(new Error('Atpv2Tls native module not available')); return; }
    Atpv2Tls.connect(ip, port, certObj.cert, certObj.key, timeout || CONNECT_TIMEOUT)
      .then(result => {
        if (result.success) {
          resolve(result.id);
        } else {
          reject(new Error(result.error || 'TLS connect failed'));
        }
      })
      .catch(err => reject(err));
  });
}

function toNativeBytes(data) {
  if (Array.isArray(data)) return data;
  if (data instanceof Uint8Array) return Array.from(data);
  if (typeof data === 'string') {
    const bytes = [];
    for (let i = 0; i < data.length; i++) bytes.push(data.charCodeAt(i) & 0xFF);
    return bytes;
  }
  try { return Array.from(data); } catch { return []; }
}

function nativeSend(socketId, data) {
  return new Promise((resolve, reject) => {
    if (!Atpv2Tls) { reject(new Error('Native module not available')); return; }
    Atpv2Tls.send(socketId, toNativeBytes(data))
      .then(r => resolve(r))
      .catch(e => reject(e));
  });
}

function nativeRead(socketId, timeout) {
  return new Promise((resolve, reject) => {
    if (!Atpv2Tls) { reject(new Error('Native module not available')); return; }
    Atpv2Tls.read(socketId, timeout || RESPONSE_TIMEOUT)
      .then(r => {
        if (r.success) {
          resolve(r.data);
        } else {
          reject(new Error(r.error || 'Read failed'));
        }
      })
      .catch(e => reject(e));
  });
}

function nativeSendAndRead(socketId, data, timeout) {
  return new Promise((resolve, reject) => {
    if (!Atpv2Tls) { reject(new Error('Native module not available')); return; }
    Atpv2Tls.sendAndRead(socketId, toNativeBytes(data), timeout || RESPONSE_TIMEOUT)
      .then(r => {
        if (r.success) {
          resolve(r.data);
        } else {
          reject(new Error(r.error || 'SendAndRead failed'));
        }
      })
      .catch(e => reject(e));
  });
}

function nativeSendAndReadAll(socketId, data, timeout) {
  return new Promise((resolve, reject) => {
    if (!Atpv2Tls) { reject(new Error('Native module not available')); return; }
    Atpv2Tls.sendAndReadAll(socketId, toNativeBytes(data), timeout || RESPONSE_TIMEOUT)
      .then(r => {
        if (r.success) {
          resolve(r.data);
        } else {
          reject(new Error(r.error || 'SendAndReadAll failed'));
        }
      })
      .catch(e => reject(e));
  });
}

function nativeGetServerCert(socketId) {
  return new Promise((resolve) => {
    if (!Atpv2Tls) { resolve(null); return; }
    Atpv2Tls.getServerCert(socketId)
      .then(r => {
        if (r.success) {
          resolve({
            modulus: r.modulus,
            exponent: r.exponent,
            derBase64: r.derBase64,
          });
        } else {
          console.log('[ATPv2] getServerCert failed:', r.error);
          resolve(null);
        }
      })
      .catch(e => {
        console.log('[ATPv2] getServerCert error:', e.message);
        resolve(null);
      });
  });
}

function nativeDisconnect(socketId) {
  if (!Atpv2Tls || socketId == null || socketId < 0) return;
  Atpv2Tls.disconnect(socketId).catch(() => {});
}

// ─── Pair with TV (port 6467) ────────────────────────────────

export async function pairWithTV(ip) {
  console.log(`[ATPv2] pairWithTV ip=${ip}`);
  const cert = await generateCertificate();
  if (!cert || !cert.key || !cert.cert) {
    return { sukses: false, pesan: 'Gagal generate sertifikat' };
  }

  let socketId = -1;
  try {
    console.log(`[ATPv2] TLS connecting to ${ip}:${PAIRING_PORT}`);
    socketId = await nativeConnectTLS(ip, PAIRING_PORT, cert);
    console.log('[ATPv2] TLS connected OK, socketId:', socketId);

    // Step 1: Send pairing_request
    console.log('[ATPv2] Step 1: Sending pairing_request...');
    const reqData = encodePairingRequest('RR Billing Pro');
    console.log('[ATPv2] pairing_request encoded:', reqData.length, 'bytes');
    const resp1 = await nativeSendAndReadAll(socketId, reqData, 10000);
    console.log('[ATPv2] pairing_request response raw:', resp1.length, 'bytes:', JSON.stringify(resp1.slice(0, 20)));

    const parsed1 = readAllPairingMessages(resp1);
    console.log('[ATPv2] pairing_request parsed:', JSON.stringify(parsed1.map(m => ({
      pv: m.protocolVersion, st: m.status,
      ack: m.pairingRequestAck !== null,
      ackName: m.pairingRequestAck ? m.pairingRequestAck.serverName : null,
    }))));

    if (!parsed1.some(m => m.pairingRequestAck)) {
      console.log('[ATPv2] ERROR: No pairingRequestAck in response. Disconnecting.');
      nativeDisconnect(socketId);
      return { sukses: false, pesan: 'TV tidak merespons pairing request' };
    }

    // Step 2: Send options
    console.log('[ATPv2] Step 2: Sending options...');
    const optData = encodeOptions();
    console.log('[ATPv2] options encoded:', optData.length, 'bytes');
    const resp2 = await nativeSendAndReadAll(socketId, optData, 10000);
    console.log('[ATPv2] options response raw:', resp2.length, 'bytes:', JSON.stringify(resp2.slice(0, 20)));

    const parsed2 = readAllPairingMessages(resp2);
    console.log('[ATPv2] options parsed:', JSON.stringify(parsed2.map(m => ({
      pv: m.protocolVersion, st: m.status,
      opts: m.options !== null,
    }))));

    // Step 3: Send configuration
    console.log('[ATPv2] Step 3: Sending configuration...');
    const cfgData = encodeConfiguration();
    console.log('[ATPv2] configuration encoded:', cfgData.length, 'bytes');
    const resp3 = await nativeSendAndReadAll(socketId, cfgData, 10000);
    console.log('[ATPv2] configuration response raw:', resp3.length, 'bytes:', JSON.stringify(resp3.slice(0, 20)));

    const parsed3 = readAllPairingMessages(resp3);
    console.log('[ATPv2] configuration parsed:', JSON.stringify(parsed3.map(m => ({
      pv: m.protocolVersion, st: m.status, cfgAck: m.configurationAck,
    }))));

    if (!parsed3.some(m => m.configurationAck)) {
      console.log('[ATPv2] ERROR: No configurationAck. Disconnecting.');
      nativeDisconnect(socketId);
      return { sukses: false, pesan: 'TV tidak mengkonfigurasi pairing' };
    }

    // Extract server public key from TLS peer certificate
    console.log('[ATPv2] Step 4: Extracting server cert...');
    const serverInfo = await nativeGetServerCert(socketId);

    _pairingSocketId = socketId;
    _pairingServerCertDer = serverInfo ? serverInfo.derBase64 : null;
    _pairingServerPubKeyHex = serverInfo
      ? JSON.stringify({ modulus: serverInfo.modulus, exponent: serverInfo.exponent })
      : null;

    console.log('[ATPv2] === PAIRING HANDSHAKE COMPLETE ===');
    console.log('[ATPv2] Connection kept open for PIN submission.');
    if (serverInfo) {
      console.log('[ATPv2] Server modulus length:', serverInfo.modulus.length, 'chars');
    } else {
      console.log('[ATPv2] WARNING: Could not extract server cert');
    }

    return {
      sukses: true,
      cert,
      certPem: cert.cert,
      keyPem: cert.key,
      code: '',
      serverPublicKey: _pairingServerPubKeyHex || '',
      pesan: 'Masukkan kode 6 digit yang tampil di TV.',
    };
  } catch (e) {
    console.log('[ATPv2] ERROR in pairWithTV:', e.message, e.stack);
    if (socketId >= 0) nativeDisconnect(socketId);
    _pairingSocketId = -1;
    return { sukses: false, pesan: `Gagal pairing: ${e.message}` };
  }
}

// ─── Submit Pairing Code ──────────────────────────────────────

export async function submitPairingCode(ip, certObj, code) {
  if (!certObj || !certObj.key || !certObj.cert) {
    return { sukses: false, pesan: 'Sertifikat tidak tersedia. Pairing ulang.' };
  }

  let socketId = _pairingSocketId;

  if (socketId < 0) {
    console.log('[ATPv2] No active connection, reconnecting...');
    try {
      socketId = await nativeConnectTLS(ip, PAIRING_PORT, certObj);

      const reqData = encodePairingRequest('RR Billing Pro');
      await nativeSendAndReadAll(socketId, reqData, 10000);

      const optData = encodeOptions();
      await nativeSendAndReadAll(socketId, optData, 10000);

      const cfgData = encodeConfiguration();
      await nativeSendAndReadAll(socketId, cfgData, 10000);

      const serverInfo = await nativeGetServerCert(socketId);
      if (serverInfo) {
        _pairingServerPubKeyHex = JSON.stringify({ modulus: serverInfo.modulus, exponent: serverInfo.exponent });
        _pairingServerCertDer = serverInfo.derBase64;
      }
    } catch (e) {
      console.log('[ATPv2] ERROR reconnecting:', e.message);
      return { sukses: false, pesan: `Gagal reconnect: ${e.message}` };
    }
  }

  try {
    console.log(`[ATPv2] submitPairingCode code=${code}`);

    const hashBytes = computePairingHash(certObj, code);
    if (!hashBytes) {
      nativeDisconnect(socketId);
      _pairingSocketId = -1;
      return { sukses: false, pesan: 'Gagal menghitung hash pairing' };
    }

    console.log('[ATPv2] Sending secret...');
    const secretData = encodeSecret(hashBytes);
    console.log('[ATPv2] secret encoded:', secretData.length, 'bytes');
    const resp = await nativeSendAndReadAll(socketId, secretData, 10000);
    console.log('[ATPv2] secret response raw:', resp.length, 'bytes:', JSON.stringify(resp.slice(0, 20)));

    const parsed = readAllPairingMessages(resp);
    console.log('[ATPv2] secret parsed:', JSON.stringify(parsed.map(m => ({
      pv: m.protocolVersion, st: m.status, secAck: m.secretAck,
    }))));

    const ok = parsed.some(m => m.secretAck);
    if (ok) {
      await saveCertificate(ip, certObj);
      console.log('[ATPv2] === PAIRING SUCCESS! ===');
    }

    nativeDisconnect(socketId);
    _pairingSocketId = -1;
    _pairingServerPubKeyHex = null;
    _pairingServerCertDer = null;

    return ok
      ? { sukses: true, pesan: 'Pairing berhasil! Sertifikat tersimpan.' }
      : { sukses: false, pesan: 'Kode pairing salah atau ditolak TV.' };
  } catch (e) {
    console.log('[ATPv2] ERROR in submitPairingCode:', e.message, e.stack);
    nativeDisconnect(socketId);
    _pairingSocketId = -1;
    return { sukses: false, pesan: `Gagal submit code: ${e.message}` };
  }
}

// ─── Pairing Hash (matches androidtvremote2) ──────────────────

function computePairingHash(certObj, code) {
  try {
    if (!code || code.length !== 6) {
      console.log('[ATPv2] Invalid code length:', code ? code.length : 0);
      return null;
    }

    const clientCert = forge.pki.certificateFromPem(certObj.cert);
    const clientMod = clientCert.publicKey.n;
    const clientExp = clientCert.publicKey.e;

    let serverModHex, serverExpHex;
    if (_pairingServerPubKeyHex) {
      try {
        const serverInfo = JSON.parse(_pairingServerPubKeyHex);
        serverModHex = serverInfo.modulus;
        serverExpHex = serverInfo.exponent;
      } catch {}
    }

    if (!serverModHex || !serverExpHex) {
      console.log('[ATPv2] No server public key available');
      return null;
    }

    // Matches androidtvremote2 Python exactly:
    // h.update(bytes.fromhex(f"{client_modulus:X}"))
    // h.update(bytes.fromhex(f"0{client_exponent:X}"))
    // h.update(bytes.fromhex(f"{server_modulus:X}"))
    // h.update(bytes.fromhex(f"0{server_exponent:X}"))
    // h.update(bytes.fromhex(pairing_code[2:]))

    const clientModHex = clientMod.toString(16).toUpperCase();
    // Python: f"0{exponent:X}" → always prepend "0" for even-length hex
    const clientExpHex = '0' + clientExp.toString(16).toUpperCase();
    const serverModHexUpper = serverModHex.toUpperCase();
    const serverExpHexPadded = '0' + serverExpHex.toUpperCase();
    const codeSuffix = code.substring(2).toUpperCase();

    console.log('[ATPv2] clientMod len:', clientModHex.length, 'clientExp:', clientExpHex);
    console.log('[ATPv2] serverMod len:', serverModHexUpper.length, 'serverExp:', serverExpHexPadded);
    console.log('[ATPv2] codeSuffix:', codeSuffix);

    // Convert hex string to binary string (like Python bytes.fromhex)
    const h2b = (hex) => {
      let s = '';
      for (let i = 0; i < hex.length; i += 2) {
        s += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
      }
      return s;
    };

    const md = forge.md.sha256.create();
    md.update(h2b(clientModHex), 'binary');
    md.update(h2b(clientExpHex), 'binary');
    md.update(h2b(serverModHexUpper), 'binary');
    md.update(h2b(serverExpHexPadded), 'binary');
    md.update(h2b(codeSuffix), 'binary');
    const digestHex = md.digest().toHex();

    const hashBytes = [];
    for (let i = 0; i < digestHex.length; i += 2) {
      hashBytes.push(parseInt(digestHex.substring(i, i + 2), 16));
    }

    const codePrefix = parseInt(code.substring(0, 2), 16);
    console.log('[ATPv2] hash[0]=' + hashBytes[0] + ' codePrefix=' + codePrefix);
    if (hashBytes[0] !== codePrefix) {
      console.log('[ATPv2] WARNING: hash[0] != code prefix, code may be wrong');
    }

    return new Uint8Array(hashBytes);
  } catch (e) {
    console.log('[ATPv2] computePairingHash error:', e.message);
    return null;
  }
}

function hexStringToBytes(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return bytes;
}

// ─── Remote Control (port 6466) ──────────────────────────────
// Uses TCP stream buffer accumulator to handle TCP packet fragmentation.
// Wire format: [varint length][protobuf bytes]
// nativeRead() returns raw TCP chunks which may be partial.

function createRemoteReader(socketId) {
  return {
    socketId,
    streamBuffer: [],
    readOneMessage: async function(timeoutMs) {
      const MAX_READS = 10;
      for (let r = 0; r < MAX_READS; r++) {
        // Try to extract a complete message from buffer
        if (this.streamBuffer.length > 0) {
          let val = 0, shift = 0, varintEnd = 0;
          for (let i = 0; i < Math.min(5, this.streamBuffer.length); i++) {
            const b = this.streamBuffer[i];
            val |= (b & 0x7F) << shift;
            shift += 7;
            varintEnd = i + 1;
            if ((b & 0x80) === 0) break;
          }
          const expectedLen = val;
          const totalNeeded = varintEnd + expectedLen;
          if (expectedLen > 0 && expectedLen <= 1048576 && this.streamBuffer.length >= totalNeeded) {
            const packet = this.streamBuffer.splice(0, totalNeeded);
            console.log('[ATPv2] Buffer: extracted ' + packet.length + ' byte message (varint=' + varintEnd + ' body=' + expectedLen + ') buf剩余=' + this.streamBuffer.length);
            return packet;
          }
          if (expectedLen > 0) {
            console.log('[ATPv2] Buffer: need ' + totalNeeded + ' bytes, have ' + this.streamBuffer.length + ' (varint=' + varintEnd + ' body=' + expectedLen + ')');
          }
        }
        // Read more data from socket
        try {
          const chunk = await nativeRead(this.socketId, timeoutMs || 10000);
          const arr = Array.isArray(chunk) ? chunk : Array.from(chunk);
          console.log('[ATPv2] Buffer: read ' + arr.length + ' bytes, buffer was ' + this.streamBuffer.length);
          this.streamBuffer = this.streamBuffer.concat(arr);
        } catch (e) {
          console.log('[ATPv2] Buffer: read error:', e.message);
          throw e;
        }
      }
      throw new Error('Buffer: too many reads without complete message');
    }
  };
}

export async function connectRemote(ip, certObj) {
  let socketId = -1;
  try {
    socketId = await nativeConnectTLS(ip, REMOTE_PORT, certObj);
    const reader = createRemoteReader(socketId);

    // Step 1: Read TV's remote_configure (with TCP buffer accumulator)
    console.log('[ATPv2] Remote: waiting for TV configure...');
    let tvConfig = null;
    for (let attempt = 0; attempt < 10 && !tvConfig; attempt++) {
      try {
        const rawPkt = await reader.readOneMessage(5000);
        const msgs = parseRemoteMessages(rawPkt);
        console.log('[ATPv2] Remote parsed:', msgs.length, 'messages');
        for (const msg of msgs) {
          if (msg.configure) {
            tvConfig = msg.configure;
            console.log('[ATPv2] TV configure: code1=' + tvConfig.code1 +
              ' vendor=' + (tvConfig.deviceInfo ? tvConfig.deviceInfo.vendor : 'n/a'));
          }
        }
      } catch (e) {
        console.log('[ATPv2] Remote init attempt ' + (attempt+1) + ':', e.message);
        if (e.message !== 'Read timeout' && !e.message.includes('timeout')) throw e;
      }
    }

    if (!tvConfig) {
      console.log('[ATPv2] WARNING: No TV configure, sending anyway');
    }

    // Step 2: Send our remote_configure
    try {
      const tvSupported = tvConfig ? tvConfig.code1 : 0x273;
      const clientFeatures = REMOTE_FEATURES_CLIENT & tvSupported;
      console.log('[ATPv2] TV features=0x' + tvSupported.toString(16) +
        ' client=0x' + clientFeatures.toString(16));

      const configMsg = encodeRemoteConfig(clientFeatures, 'com.rrcctv.billingpro', '1.0.0');
      console.log('[ATPv2] Encoded client config:', configMsg.length, 'bytes');
      const sendResult = await nativeSend(socketId, configMsg);
      console.log('[ATPv2] nativeSend result:', JSON.stringify(sendResult));
      console.log('[ATPv2] Sent client configure');
    } catch (e) {
      console.log('[ATPv2] ERROR in Step 2 (send configure):', e.message, e.stack);
      throw e;
    }

    // Step 3: Handle remote_set_active + remote_start
    let gotSetActive = false;
    let gotStart = false;
    for (let i = 0; i < 10 && (!gotSetActive || !gotStart); i++) {
      try {
        console.log('[ATPv2] Step 3: waiting set_active/start, attempt=' + (i+1));
        const rawPkt = await reader.readOneMessage(5000);
        const msgs = parseRemoteMessages(rawPkt);
        console.log('[ATPv2] Step 3: parsed', msgs.length, 'messages');
        for (const msg of msgs) {
          if (msg.setActive && !gotSetActive) {
            gotSetActive = true;
            console.log('[ATPv2] Got remote_set_active, responding...');
            const activeMsg = encodeSetActive(clientFeatures);
            await nativeSend(socketId, activeMsg);
            console.log('[ATPv2] Sent set_active');
          } else if (msg.start && !gotStart) {
            gotStart = true;
            console.log('[ATPv2] Got remote_start started=' + msg.start.started);
          } else if (msg.configure) {
            console.log('[ATPv2] Got configure again, ignoring');
          } else {
            console.log('[ATPv2] Unknown message in Step 3');
          }
        }
      } catch (e) {
        console.log('[ATPv2] Handshake read ' + (i+1) + ':', e.message);
        if (e.message !== 'Read timeout' && !e.message.includes('timeout')) break;
      }
    }

    if (!gotStart) console.log('[ATPv2] WARNING: No remote_start');
    console.log('[ATPv2] Remote handshake complete');

    const conn = {
      socketId, ip, connected: true, destroyed: false, onData: null,
      reader: reader,
    };

    // Step 4: Background ping listener using same stream buffer
    const listenLoop = async () => {
      while (conn.connected && !conn.destroyed) {
        try {
          const rawPkt = await reader.readOneMessage(10000);
          const msgs = parseRemoteMessages(rawPkt);
          for (const msg of msgs) {
            if (msg.pingRequest) {
              try {
                const pongData = encodePong(msg.pingRequest.val1);
                await nativeSend(socketId, pongData);
              } catch {}
            }
          }
          if (conn.onData) conn.onData(rawPkt);
        } catch (e) {
          if (e.message !== 'Read timeout' && !e.message.includes('timeout')) {
            console.log('[ATPv2] Remote listen error:', e.message);
            conn.connected = false;
            break;
          }
        }
      }
    };
    listenLoop();

    return conn;
  } catch (e) {
    if (socketId >= 0) nativeDisconnect(socketId);
    throw e;
  }
}

export async function sendCommand(conn, cmd, params = {}) {
  if (!conn || !conn.connected || conn.destroyed) {
    return { status: 'error', message: 'ATPv2 not connected' };
  }
  try {
    let data;
    switch (cmd) {
      case 'power': data = encodeKeyInject(26); break;
      case 'home': data = encodeKeyInject(3); break;
      case 'back': data = encodeKeyInject(4); break;
      case 'enter': data = encodeKeyInject(66); break;
      case 'up': data = encodeKeyInject(19); break;
      case 'down': data = encodeKeyInject(20); break;
      case 'left': data = encodeKeyInject(21); break;
      case 'right': data = encodeKeyInject(22); break;
      case 'dpadCenter': data = encodeKeyInject(23); break;
      case 'volume':
        data = params.action === 'up' ? encodeKeyInject(24) : encodeKeyInject(25);
        break;
      case 'input': data = encodeKeyInject(178); break;
      case 'menu': data = encodeKeyInject(82); break;
      case 'settings': data = encodeKeyInject(176); break;
      case 'channelUp': data = encodeKeyInject(166); break;
      case 'channelDown': data = encodeKeyInject(167); break;
      case 'mediaPlayPause': data = encodeKeyInject(85); break;
      case 'mute': data = encodeKeyInject(164); break;
      case 'num0': data = encodeKeyInject(7); break;
      case 'num1': data = encodeKeyInject(8); break;
      case 'num2': data = encodeKeyInject(9); break;
      case 'num3': data = encodeKeyInject(10); break;
      case 'num4': data = encodeKeyInject(11); break;
      case 'num5': data = encodeKeyInject(12); break;
      case 'num6': data = encodeKeyInject(13); break;
      case 'num7': data = encodeKeyInject(14); break;
      case 'num8': data = encodeKeyInject(15); break;
      case 'num9': data = encodeKeyInject(16); break;
      default:
        if (params.keyCode) { data = encodeKeyInject(params.keyCode, params.direction || 3); }
        else { return { status: 'error', message: `ATP: unknown cmd ${cmd}` }; }
    }
    const result = await nativeSend(conn.socketId, data);
    return result.success ? { status: 'ok', cmd } : { status: 'error', message: result.error };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

export function disconnect(conn) {
  if (conn && conn.socketId != null) {
    conn.connected = false;
    conn.destroyed = true;
    nativeDisconnect(conn.socketId);
  }
}
