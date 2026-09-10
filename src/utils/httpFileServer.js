/**
 * httpFileServer.js — Simple HTTP server to serve files from FileSystem.documentDirectory.
 * Used by billingtv clients to fetch promo videos.
 */
import TcpSocket from 'react-native-tcp-socket';
import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system';

const PORT = 8082;
const MEDIA_DIR = FileSystem.documentDirectory;

const MIME_TYPES = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
};

class HttpFileServer {
  constructor() {
    this._server = null;
    this._running = false;
  }

  async start(port = PORT) {
    if (this._running) return true;

    return new Promise((resolve) => {
      try {
        this._server = TcpSocket.createServer((socket) => {
          this._handleRequest(socket);
        });

        this._server.listen({ port, host: '0.0.0.0', reuseAddress: true }, () => {
          this._running = true;
          console.log(`[HttpFileServer] Running on port ${port}`);
          resolve(true);
        });

        this._server.on('error', (err) => {
          console.error('[HttpFileServer] Server error:', err.message);
          if (!this._running) resolve(false);
        });
      } catch (e) {
        console.error('[HttpFileServer] Failed to start:', e.message);
        resolve(false);
      }
    });
  }

  stop() {
    this._running = false;
    if (this._server) {
      try { this._server.close(); } catch {}
      this._server = null;
    }
    console.log('[HttpFileServer] Stopped');
  }

  _handleRequest(socket) {
    let requestData = Buffer.alloc(0);
    let headerParsed = false;

    const onData = (data) => {
      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);

      if (!headerParsed) {
        requestData = Buffer.concat([requestData, chunk]);
        const str = requestData.toString('utf8');
        const headerEnd = str.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;

        const headerStr = str.substring(0, headerEnd);
        const lines = headerStr.split('\r\n');
        const [method, reqPath] = lines[0].split(' ');
        const headers = {};

        for (let i = 1; i < lines.length; i++) {
          const colonIdx = lines[i].indexOf(':');
          if (colonIdx > 0) {
            const key = lines[i].substring(0, colonIdx).trim().toLowerCase();
            const val = lines[i].substring(colonIdx + 1).trim();
            headers[key] = val;
          }
        }

        headerParsed = true;
        socket.removeListener('data', onData);
        this._processRequest(socket, method, reqPath, headers);
      }
    };

    socket.on('data', onData);
    socket.on('error', () => { try { socket.destroy(); } catch {} });

    setTimeout(() => {
      if (!headerParsed) { try { socket.destroy(); } catch {} }
    }, 5000);
  }

  async _processRequest(socket, method, reqPath, headers) {
    console.log(`[HttpFileServer] ${method} ${reqPath}`);

    const corsHeaders = [
      'Access-Control-Allow-Origin: *',
      'Access-Control-Allow-Methods: GET, OPTIONS',
      'Access-Control-Allow-Headers: Range',
      'Access-Control-Expose-Headers: Content-Length, Content-Range',
    ];

    if (method === 'OPTIONS') {
      this._sendResponse(socket, 200, 'text/plain', '', corsHeaders);
      return;
    }

    if (method !== 'GET') {
      this._sendResponse(socket, 405, 'text/plain', 'Method Not Allowed', corsHeaders);
      return;
    }

    let filePath = reqPath.replace(/^\//, '');
    if (filePath.startsWith('media/')) {
      filePath = filePath.substring(6);
    }

    const fullPath = `${MEDIA_DIR}${filePath}`;
    try {
      const info = await FileSystem.getInfoAsync(fullPath);
      if (!info.exists || info.isDirectory) {
        this._sendResponse(socket, 404, 'text/plain', 'Not Found', corsHeaders);
        return;
      }

      const ext = '.' + filePath.split('.').pop().toLowerCase();
      const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
      const fileSize = info.size;

      const rangeHeader = headers.range;
      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1]) || 0;
          const end = match[2] ? parseInt(match[2]) : fileSize - 1;
          const chunkSize = Math.min(end - start + 1, fileSize - start);

          const base64 = await FileSystem.readAsStringAsync(fullPath, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const fullBuf = Buffer.from(base64, 'base64');
          const buf = fullBuf.subarray(start, start + chunkSize);

          const respHeaders = [
            ...corsHeaders,
            `Content-Type: ${mimeType}`,
            `Content-Range: bytes ${start}-${start + chunkSize - 1}/${fileSize}`,
            `Content-Length: ${chunkSize}`,
            'Accept-Ranges: bytes',
          ];
          this._sendResponse(socket, 206, mimeType, buf, respHeaders);
          return;
        }
      }

      const base64 = await FileSystem.readAsStringAsync(fullPath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const buf = Buffer.from(base64, 'base64');

      const respHeaders = [
        ...corsHeaders,
        `Content-Type: ${mimeType}`,
        `Content-Length: ${fileSize}`,
        'Accept-Ranges: bytes',
      ];
      this._sendResponse(socket, 200, mimeType, buf, respHeaders);
    } catch (e) {
      console.error(`[HttpFileServer] Error serving ${filePath}: ${e.message}`);
      this._sendResponse(socket, 500, 'text/plain', `Error: ${e.message}`, corsHeaders);
    }
  }

  _sendResponse(socket, statusCode, contentType, body, extraHeaders = []) {
    const phrases = { 200: 'OK', 206: 'Partial Content', 404: 'Not Found', 405: 'Method Not Allowed' };
    const bodyBuf = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;

    const headerLines = [
      `HTTP/1.1 ${statusCode} ${phrases[statusCode] || 'Error'}`,
      `Content-Type: ${contentType}`,
      `Content-Length: ${bodyBuf.length}`,
      'Connection: close',
      ...extraHeaders,
      '',
      '',
    ];

    const headerBuf = Buffer.from(headerLines.join('\r\n'), 'utf8');
    try {
      socket.write(Buffer.concat([headerBuf, bodyBuf]));
    } catch {}
    setTimeout(() => { try { socket.destroy(); } catch {} }, 100);
  }

  get isRunning() { return this._running; }
}

const httpFileServer = new HttpFileServer();
export default httpFileServer;
