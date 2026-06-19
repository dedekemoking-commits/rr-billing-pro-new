/**
 * ADB Helper untuk React Native
 * Menggunakan react-native-tcp-socket untuk koneksi ADB via Wi-Fi
 *
 * Catatan: ADB protocol diimplementasi manual via TCP.
 * Untuk pairing Android 11+ menggunakan ADB MDNS pairing protocol.
 */
import TcpSocket from 'react-native-tcp-socket';
import NetInfo from '@react-native-community/netinfo';

// ─── ADB CONSTANTS ───────────────────────────────────────────────────────────
const ADB_DEFAULT_PORT = 5555;
const ADB_CONNECT_TIMEOUT = 8000;

// ADB magic bytes untuk handshake
const A_SYNC = 0x434e5953;
const A_CNXN = 0x4e584e43;
const A_OPEN = 0x4e45504f;
const A_OKAY = 0x59414b4f;
const A_CLSE = 0x45534c43;
const A_WRTE = 0x45545257;
const A_AUTH = 0x48545541;

const ADB_VERSION      = 0x01000000;
const ADB_VERSION_SKIP = 0x01000001;
const ADB_MAX_DATA     = 4096;

// ─── HELPER: encode ADB message ──────────────────────────────────────────────
function encodeADBMessage(cmd, arg0, arg1, data) {
  const dataBytes = data ? Buffer.from(data) : Buffer.alloc(0);
  const dataLen   = dataBytes.length;
  const checksum  = dataBytes.reduce((s, b) => (s + b) & 0xffffffff, 0);
  const magic     = (cmd ^ 0xffffffff) >>> 0;

  const header = Buffer.alloc(24);
  header.writeUInt32LE(cmd,      0);
  header.writeUInt32LE(arg0,     4);
  header.writeUInt32LE(arg1,     8);
  header.writeUInt32LE(dataLen, 12);
  header.writeUInt32LE(checksum,16);
  header.writeUInt32LE(magic,   20);

  return dataBytes.length > 0
    ? Buffer.concat([header, dataBytes])
    : header;
}

// ─── MAIN ADB CLASS ──────────────────────────────────────────────────────────
export class ADBHelper {

  // Cek apakah port ADB terbuka (coba connect TCP)
  static async checkPortOpen(ip, port = ADB_DEFAULT_PORT, timeout = ADB_CONNECT_TIMEOUT) {
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) { done = true; client.destroy(); resolve(false); }
      }, timeout);

      const client = TcpSocket.createConnection({ host: ip, port, timeout }, () => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          client.destroy();
          resolve(true);
        }
      });

      client.on('error', () => {
        if (!done) { done = true; clearTimeout(timer); resolve(false); }
      });
      client.on('timeout', () => {
        if (!done) { done = true; clearTimeout(timer); client.destroy(); resolve(false); }
      });
    });
  }

  // Coba connect ADB ke TV dan cek status
  static async connect(ip, port = ADB_DEFAULT_PORT) {
    try {
      const isOpen = await this.checkPortOpen(ip, port, 6000);
      if (!isOpen) {
        return { sukses: false, pesan: `Port ${ip}:${port} tidak terbuka. Pastikan ADB Debugging aktif di TV.` };
      }

      // Coba ADB handshake
      const result = await this._adbHandshake(ip, port);
      return result;
    } catch (e) {
      return { sukses: false, pesan: e.message || 'Koneksi gagal' };
    }
  }

  // ADB CNXN handshake
  static _adbHandshake(ip, port) {
    return new Promise((resolve) => {
      let done = false;
      let dataBuffer = Buffer.alloc(0);

      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          client.destroy();
          // Jika timeout tapi port terbuka, anggap terhubung (beberapa TV tidak kirim CNXN balik)
          resolve({ sukses: true, pesan: `Terhubung ke ${ip}:${port}` });
        }
      }, 4000);

      const client = TcpSocket.createConnection({ host: ip, port }, () => {
        // Kirim CNXN message
        const identity = `host::RRBillingPro:2.0.0`;
        const msg = encodeADBMessage(A_CNXN, ADB_VERSION, ADB_MAX_DATA, identity);
        client.write(msg);
      });

      client.on('data', (data) => {
        dataBuffer = Buffer.concat([dataBuffer, Buffer.from(data)]);
        if (dataBuffer.length >= 24) {
          const cmd = dataBuffer.readUInt32LE(0);
          if (!done) {
            done = true;
            clearTimeout(timer);
            client.destroy();
            if (cmd === A_CNXN) {
              resolve({ sukses: true, pesan: `Terhubung ke ${ip}:${port}` });
            } else if (cmd === A_AUTH) {
              resolve({ sukses: false, status: 'unauthorized',
                pesan: 'TV meminta otorisasi ADB. Buka TV dan tap "Izinkan" / "Allow".' });
            } else {
              resolve({ sukses: true, pesan: `Terhubung ke ${ip}:${port}` });
            }
          }
        }
      });

      client.on('error', (err) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve({ sukses: false, pesan: err.message || 'Error koneksi' });
        }
      });
    });
  }

  // Kirim shell command via ADB TCP
  static async shell(ip, command, port = ADB_DEFAULT_PORT) {
    return new Promise((resolve) => {
      let done = false;
      let localId = Math.floor(Math.random() * 0xffff) + 1;
      let streamOpen = false;
      let outputBuffer = '';
      let dataBuffer = Buffer.alloc(0);

      const timer = setTimeout(() => {
        if (!done) { done = true; client.destroy(); resolve({ sukses: false, output: 'Timeout' }); }
      }, 6000);

      const client = TcpSocket.createConnection({ host: ip, port }, () => {
        // CNXN
        const msg = encodeADBMessage(A_CNXN, ADB_VERSION, ADB_MAX_DATA, 'host::RRBillingPro:2.0.0');
        client.write(msg);
      });

      client.on('data', (data) => {
        dataBuffer = Buffer.concat([dataBuffer, Buffer.from(data)]);
        while (dataBuffer.length >= 24) {
          const msgLen  = 24 + dataBuffer.readUInt32LE(12);
          if (dataBuffer.length < msgLen) break;
          const cmd     = dataBuffer.readUInt32LE(0);
          const arg0    = dataBuffer.readUInt32LE(4);
          const arg1    = dataBuffer.readUInt32LE(8);
          const payload = dataBuffer.slice(24, msgLen);
          dataBuffer    = dataBuffer.slice(msgLen);

          if (cmd === A_CNXN && !streamOpen) {
            // Buka stream shell
            streamOpen = true;
            const openMsg = encodeADBMessage(A_OPEN, localId, 0, `shell:${command}\0`);
            client.write(openMsg);
          } else if (cmd === A_OKAY && !done) {
            const remoteId = arg0;
            const okMsg = encodeADBMessage(A_OKAY, localId, remoteId);
            client.write(okMsg);
          } else if (cmd === A_WRTE) {
            outputBuffer += payload.toString('utf8');
            const remoteId = arg0;
            client.write(encodeADBMessage(A_OKAY, localId, remoteId));
          } else if (cmd === A_CLSE && !done) {
            done = true;
            clearTimeout(timer);
            client.destroy();
            resolve({ sukses: true, output: outputBuffer.trim() });
          }
        }
      });

      client.on('error', (err) => {
        if (!done) { done = true; clearTimeout(timer); resolve({ sukses: false, output: err.message }); }
      });
    });
  }

  // Power toggle (keyevent 26)
  static async powerToggle(ip, port = ADB_DEFAULT_PORT) {
    return this.shell(ip, 'input keyevent 26', port);
  }

  // Volume
  static async volume(ip, naik = true, port = ADB_DEFAULT_PORT) {
    return this.shell(ip, `input keyevent ${naik ? 24 : 25}`, port);
  }

  // Home
  static async home(ip, port = ADB_DEFAULT_PORT) {
    return this.shell(ip, 'input keyevent 3', port);
  }

  // Back
  static async back(ip, port = ADB_DEFAULT_PORT) {
    return this.shell(ip, 'input keyevent 4', port);
  }

  // Launch app
  static async launchApp(ip, packageName, port = ADB_DEFAULT_PORT) {
    return this.shell(ip, `monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`, port);
  }

  // Get device info
  static async getDeviceInfo(ip, port = ADB_DEFAULT_PORT) {
    const [model, android, ip_addr] = await Promise.all([
      this.shell(ip, 'getprop ro.product.model', port),
      this.shell(ip, 'getprop ro.build.version.release', port),
      this.shell(ip, 'ip route | grep src', port),
    ]);
    return {
      model:   model.output   || 'Unknown',
      android: android.output || 'Unknown',
      ip:      ip_addr.output || ip,
    };
  }

  // Scan jaringan lokal untuk ADB devices (cek port 5555)
  static async scanNetwork(baseIp, onProgress = null, onFound = null) {
    const parts   = baseIp.split('.');
    const prefix  = parts.slice(0, 3).join('.');
    const results = [];
    const BATCH   = 10;
    const total   = 254;

    for (let start = 1; start <= total; start += BATCH) {
      const batch = [];
      for (let i = start; i < Math.min(start + BATCH, total + 1); i++) {
        const ip = `${prefix}.${i}`;
        batch.push(
          this.checkPortOpen(ip, 5555, 1500).then(open => {
            if (open) {
              results.push(ip);
              onFound && onFound(ip);
            }
          })
        );
      }
      await Promise.all(batch);
      onProgress && onProgress(Math.min(start + BATCH - 1, total), total);
    }
    return results;
  }

  // Cek IP lokal HP
  static async getLocalIP() {
    try {
      const info = await NetInfo.fetch();
      return info?.details?.ipAddress || null;
    } catch { return null; }
  }
}
