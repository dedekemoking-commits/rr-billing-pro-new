import { NativeModules, NativeEventEmitter } from 'react-native';
import TcpSocket from 'react-native-tcp-socket';

const { Atpv2DiscoveryModule } = NativeModules;
const ATPV2_PORT = 6467;
const SCAN_TIMEOUT = 1500;

let emitter = null;
let listeners = [];

export function startMDNS(onFound, onStatus) {
  stopMDNS();
  if (!Atpv2DiscoveryModule) {
    if (onStatus) onStatus('error', 'ATPv2 mDNS native module not available');
    return;
  }
  emitter = new NativeEventEmitter(Atpv2DiscoveryModule);
  listeners.push(
    emitter.addListener('Atpv2DiscoveryFound', (e) => {
      if (onFound) onFound({ ip: e.ip, port: e.port || ATPV2_PORT, name: e.serviceName, source: 'mdns' });
    }),
    emitter.addListener('Atpv2DiscoveryStatus', (e) => {
      if (onStatus) onStatus(e.status, e.message);
    }),
    emitter.addListener('Atpv2DiscoveryLost', (e) => {
      if (onStatus) onStatus('lost', e.serviceName);
    }),
  );
  Atpv2DiscoveryModule.startDiscovery();
}

export function stopMDNS() {
  if (Atpv2DiscoveryModule) {
    try { Atpv2DiscoveryModule.stopDiscovery(); } catch {}
  }
  listeners.forEach(l => l.remove());
  listeners = [];
  emitter = null;
}

export async function scanTCP(subnet, onProgress) {
  const results = [];
  const ips = [];
  for (let i = 1; i <= 254; i++) {
    ips.push(`${subnet}.${i}`);
  }
  let done = 0;
  const total = ips.length;

  const check = async (ip) => {
    return new Promise((resolve) => {
      let doneFlag = false;
      const socket = TcpSocket.createConnection({
        host: ip, port: ATPV2_PORT,
        timeout: SCAN_TIMEOUT,
      }, () => {
        clearTimeout(timer);
        if (doneFlag) return; doneFlag = true;
        socket.destroy();
        done++; if (onProgress) onProgress(done, total, results.length);
        resolve({ ip, port: ATPV2_PORT, source: 'scan' });
      });
      socket.setTimeout(SCAN_TIMEOUT);
      const timer = setTimeout(() => {
        try { socket.destroy(); } catch {}
        if (doneFlag) return; doneFlag = true;
        done++; if (onProgress) onProgress(done, total, results.length);
        resolve(null);
      }, SCAN_TIMEOUT + 500);
      socket.on('error', () => {
        clearTimeout(timer);
        if (doneFlag) return; doneFlag = true;
        socket.destroy();
        done++; if (onProgress) onProgress(done, total, results.length);
        resolve(null);
      });
      socket.on('timeout', () => {
        clearTimeout(timer);
        if (doneFlag) return; doneFlag = true;
        socket.destroy();
        done++; if (onProgress) onProgress(done, total, results.length);
        resolve(null);
      });
    });
  };

  const workers = Array.from({ length: 20 }, async () => {
    while (ips.length > 0) {
      const ip = ips.shift();
      if (!ip) break;
      const r = await check(ip);
      if (r) results.push(r);
    }
  });

  await Promise.all(workers);
  return results;
}

export function isValidIP(str) {
  const parts = str.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => {
    const n = parseInt(p, 10);
    return !isNaN(n) && n >= 0 && n <= 255 && String(n) === p;
  });
}

export function getSubnet(ip) {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  return parts.slice(0, 3).join('.');
}
