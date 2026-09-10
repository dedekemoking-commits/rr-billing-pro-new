/**
 * OuterMessage protobuf encoder/decoder for polo.proto
 *
 * Wire format: [varint-length-prefix][protobuf-bytes]
 * The native Kotlin module (sendAndReadAll) returns this exact format.
 *
 * polo.proto OuterMessage fields:
 *   1: uint32 protocol_version
 *   2: Status status (200=OK, 400=ERROR, 401=BAD_CONFIG, 402=BAD_SECRET)
 *  10: PairingRequest pairing_request { service_name, client_name }
 *  11: PairingRequestAck pairing_request_ack { server_name }
 *  20: Options options { input_encodings[], output_encodings[], preferred_role }
 *  30: Configuration configuration { encoding, client_role }
 *  31: ConfigurationAck configuration_ack {}
 *  40: Secret secret { bytes secret }
 *  41: SecretAck secret_ack { bytes secret }
 */

// ─── Protobuf primitives ──────────────────────────────────────

function varint(n) {
  const b = [];
  while (n >= 128) { b.push((n & 127) | 128); n >>>= 7; }
  b.push(n & 0x7F);
  return b;
}

function fieldVarint(num, val) {
  return [...varint((num << 3) | 0), ...varint(val)];
}

function fieldBytes(num, val) {
  const arr = val instanceof Uint8Array ? Array.from(val) : val;
  return [...varint((num << 3) | 2), ...varint(arr.length), ...arr];
}

function fieldString(num, val) {
  const bytes = [];
  for (let i = 0; i < val.length; i++) bytes.push(val.charCodeAt(i) & 0xFF);
  return fieldBytes(num, bytes);
}

function merge(...arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const r = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { r.set(a, off); off += a.length; }
  return r;
}

function bytesToString(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

// ─── Constants ────────────────────────────────────────────────

const STATUS_OK = 200;
const ROLE_TYPE_INPUT = 1;
const ENCODING_TYPE_HEXADECIMAL = 3;

// ─── Pairing Messages (port 6467) ─────────────────────────────

export function encodePairingRequest(clientName) {
  const name = clientName || 'RR Billing Pro';
  const pairingReq = merge(
    fieldString(1, 'atvremote'),
    fieldString(2, name)
  );
  const body = merge(
    fieldVarint(1, 2),
    fieldVarint(2, STATUS_OK),
    fieldBytes(10, pairingReq)
  );
  return Array.from(merge(varint(body.length), body));
}

export function encodeOptions() {
  const encoding = merge(
    fieldVarint(1, ENCODING_TYPE_HEXADECIMAL),
    fieldVarint(2, 6)
  );
  const options = merge(
    fieldBytes(1, encoding),
    fieldVarint(3, ROLE_TYPE_INPUT)
  );
  const body = merge(
    fieldVarint(1, 2),
    fieldVarint(2, STATUS_OK),
    fieldBytes(20, options)
  );
  return Array.from(merge(varint(body.length), body));
}

export function encodeConfiguration() {
  const encoding = merge(
    fieldVarint(1, ENCODING_TYPE_HEXADECIMAL),
    fieldVarint(2, 6)
  );
  const configuration = merge(
    fieldBytes(1, encoding),
    fieldVarint(2, ROLE_TYPE_INPUT)
  );
  const body = merge(
    fieldVarint(1, 2),
    fieldVarint(2, STATUS_OK),
    fieldBytes(30, configuration)
  );
  return Array.from(merge(varint(body.length), body));
}

export function encodeSecret(secretBytes) {
  const secret = merge(
    fieldBytes(1, secretBytes instanceof Uint8Array ? secretBytes : new Uint8Array(secretBytes))
  );
  const body = merge(
    fieldVarint(1, 2),
    fieldVarint(2, STATUS_OK),
    fieldBytes(40, secret)
  );
  return Array.from(merge(varint(body.length), body));
}

// ─── Varint reader ────────────────────────────────────────────

function readVarintFromBytes(data, offset) {
  let result = 0;
  let shift = 0;
  let i = offset;
  while (i < data.length) {
    const b = data[i++];
    result |= (b & 127) << shift;
    shift += 7;
    if (!(b & 128)) break;
  }
  return { value: result, offset: i };
}

// ─── OuterMessage parser ──────────────────────────────────────

function parseOuterMessage(msg) {
  const result = {
    protocolVersion: 0,
    status: 0,
    pairingRequestAck: null,
    options: null,
    configurationAck: false,
    secretAck: false,
  };

  let offset = 0;
  while (offset < msg.length) {
    const tag = readVarintFromBytes(msg, offset);
    offset = tag.offset;
    const fieldNum = tag.value >>> 3;
    const wireType = tag.value & 7;

    if (wireType === 0) {
      const val = readVarintFromBytes(msg, offset);
      offset = val.offset;
      if (fieldNum === 1) result.protocolVersion = val.value;
      else if (fieldNum === 2) result.status = val.value;
    } else if (wireType === 2) {
      const len = readVarintFromBytes(msg, offset);
      offset = len.offset;
      const end = offset + len.value;
      if (end > msg.length) break;
      const fieldData = msg.slice(offset, end);
      offset = end;

      if (fieldNum === 11) {
        result.pairingRequestAck = parsePairingRequestAck(fieldData);
      } else if (fieldNum === 20) {
        result.options = parseOptions(fieldData);
      } else if (fieldNum === 31) {
        result.configurationAck = true;
      } else if (fieldNum === 41) {
        result.secretAck = true;
      }
    } else {
      break;
    }
  }
  return result;
}

function parsePairingRequestAck(data) {
  const result = { serverName: '' };
  let offset = 0;
  while (offset < data.length) {
    const tag = readVarintFromBytes(data, offset);
    offset = tag.offset;
    const fieldNum = tag.value >>> 3;
    const wireType = tag.value & 7;
    if (wireType === 2) {
      const len = readVarintFromBytes(data, offset);
      offset = len.offset;
      if (fieldNum === 1) {
        result.serverName = bytesToString(data.slice(offset, offset + len.value));
      }
      offset += len.value;
    } else if (wireType === 0) {
      const val = readVarintFromBytes(data, offset);
      offset = val.offset;
    } else {
      break;
    }
  }
  return result;
}

function parseOptions(data) {
  const result = { inputEncodings: [], outputEncodings: [], preferredRole: 0 };
  let offset = 0;
  while (offset < data.length) {
    const tag = readVarintFromBytes(data, offset);
    offset = tag.offset;
    const fieldNum = tag.value >>> 3;
    const wireType = tag.value & 7;
    if (wireType === 2) {
      const len = readVarintFromBytes(data, offset);
      offset = len.offset;
      if (fieldNum === 1) {
        result.inputEncodings.push(parseEncoding(data.slice(offset, offset + len.value)));
      } else if (fieldNum === 2) {
        result.outputEncodings.push(parseEncoding(data.slice(offset, offset + len.value)));
      }
      offset += len.value;
    } else if (wireType === 0) {
      const val = readVarintFromBytes(data, offset);
      offset = val.offset;
      if (fieldNum === 3) result.preferredRole = val.value;
    } else {
      break;
    }
  }
  return result;
}

function parseEncoding(data) {
  const result = { type: 0, symbolLength: 0 };
  let offset = 0;
  while (offset < data.length) {
    const tag = readVarintFromBytes(data, offset);
    offset = tag.offset;
    const fieldNum = tag.value >>> 3;
    const wireType = tag.value & 7;
    if (wireType === 0) {
      const val = readVarintFromBytes(data, offset);
      offset = val.offset;
      if (fieldNum === 1) result.type = val.value;
      else if (fieldNum === 2) result.symbolLength = val.value;
    } else {
      break;
    }
  }
  return result;
}

// ─── Length-prefixed message reader ───────────────────────────
// Input: raw bytes from native sendAndReadAll (varint + body)

function toPlainArray(data) {
  if (Array.isArray(data)) return data;
  if (data instanceof Uint8Array) return Array.from(data);
  if (typeof data === 'object' && data != null) {
    try { return Array.from(data); } catch {}
  }
  return [];
}

export function readPairingMessage(data) {
  const arr = toPlainArray(data);
  if (arr.length === 0) return null;
  let offset = 0;
  const lenResult = readVarintFromBytes(arr, offset);
  offset = lenResult.offset;
  const msgLen = lenResult.value;
  if (msgLen <= 0 || msgLen > 65535 || offset + msgLen > arr.length) return null;
  const msg = arr.slice(offset, offset + msgLen);
  return parseOuterMessage(msg);
}

export function readAllPairingMessages(data) {
  const arr = toPlainArray(data);
  const messages = [];
  let offset = 0;
  while (offset < arr.length) {
    const lenResult = readVarintFromBytes(arr, offset);
    offset = lenResult.offset;
    const msgLen = lenResult.value;
    if (msgLen <= 0 || msgLen > 65535 || offset + msgLen > arr.length) break;
    const msg = arr.slice(offset, offset + msgLen);
    offset += msgLen;
    messages.push(parseOuterMessage(msg));
  }
  return messages;
}

// ─── Remote Control Messages (port 6466) ──────────────────────
// RemoteMessage field numbers (from remotemessage.proto):
//   1: remote_configure
//   2: remote_set_active
//   3: remote_error
//   8: remote_ping_request
//   9: remote_ping_response
//  10: remote_key_inject
//  13: remote_start

// RemoteConfigure fields: 1=code1(features), 2=device_info
// RemoteDeviceInfo fields: 1=model, 2=vendor, 3=unknown1, 4=unknown2, 5=package_name, 6=app_version
// RemoteSetActive fields: 1=active
// RemoteKeyInject fields: 1=key_code, 2=direction
// RemotePingRequest fields: 1=val1, 2=val2
// RemotePingResponse fields: 1=val1

export const RemoteFeature = {
  PING:    1 << 0,  // 1
  KEY:     1 << 1,  // 2
  IME:     1 << 2,  // 4
  VOICE:   1 << 3,  // 8
  UNKNOWN: 1 << 4,  // 16
  POWER:   1 << 5,  // 32
  VOLUME:  1 << 6,  // 64
  APP_LINK: 1 << 9, // 512
};

export const REMOTE_FEATURES_CLIENT = RemoteFeature.PING | RemoteFeature.KEY | RemoteFeature.POWER | RemoteFeature.VOLUME | RemoteFeature.APP_LINK;

export function encodeRemoteConfig(features, packageName, appVersion) {
  const deviceInfo = merge(
    fieldString(1, 'Android TV'),
    fieldString(2, 'RR Billing Pro'),
    fieldVarint(3, 1),
    fieldString(4, '1'),
    fieldString(5, packageName || 'com.rrcctv.billingpro'),
    fieldString(6, appVersion || '1.0.0')
  );
  const configure = merge(
    fieldVarint(1, features || REMOTE_FEATURES_CLIENT),
    fieldBytes(2, deviceInfo)
  );
  const body = merge(
    fieldBytes(1, configure)
  );
  return Array.from(merge(varint(body.length), body));
}

export function encodeKeyInject(keyCode, direction) {
  if (direction === undefined || direction === null) direction = 3; // SHORT
  const keyInject = merge(
    fieldVarint(1, keyCode),
    fieldVarint(2, direction)
  );
  const body = merge(
    fieldBytes(10, keyInject)
  );
  return Array.from(merge(varint(body.length), body));
}

export function encodeSetActive(active) {
  const setActive = merge(
    fieldVarint(1, active !== undefined ? active : REMOTE_FEATURES_CLIENT)
  );
  const body = merge(
    fieldBytes(2, setActive)
  );
  return Array.from(merge(varint(body.length), body));
}

export function encodePong(val1) {
  const pong = merge(fieldVarint(1, val1 || 0));
  const body = merge(fieldBytes(9, pong));
  return Array.from(merge(varint(body.length), body));
}

// ─── Remote Message Parser ────────────────────────────────────

function parseRemoteDeviceInfo(data) {
  const result = { model: '', vendor: '', unknown1: 0, unknown2: '', packageName: '', appVersion: '' };
  let offset = 0;
  while (offset < data.length) {
    const tag = readVarintFromBytes(data, offset);
    offset = tag.offset;
    const fieldNum = tag.value >>> 3;
    const wireType = tag.value & 7;
    if (wireType === 0) {
      const val = readVarintFromBytes(data, offset);
      offset = val.offset;
      if (fieldNum === 3) result.unknown1 = val.value;
    } else if (wireType === 2) {
      const len = readVarintFromBytes(data, offset);
      offset = len.offset;
      const strData = data.slice(offset, offset + len.value);
      offset += len.value;
      const str = bytesToString(strData);
      if (fieldNum === 1) result.model = str;
      else if (fieldNum === 2) result.vendor = str;
      else if (fieldNum === 4) result.unknown2 = str;
      else if (fieldNum === 5) result.packageName = str;
      else if (fieldNum === 6) result.appVersion = str;
    } else {
      break;
    }
  }
  return result;
}

function parseRemoteConfigure(data) {
  const result = { code1: 0, deviceInfo: null };
  let offset = 0;
  while (offset < data.length) {
    const tag = readVarintFromBytes(data, offset);
    offset = tag.offset;
    const fieldNum = tag.value >>> 3;
    const wireType = tag.value & 7;
    if (wireType === 0) {
      const val = readVarintFromBytes(data, offset);
      offset = val.offset;
      if (fieldNum === 1) result.code1 = val.value;
    } else if (wireType === 2) {
      const len = readVarintFromBytes(data, offset);
      offset = len.offset;
      if (fieldNum === 2) {
        result.deviceInfo = parseRemoteDeviceInfo(data.slice(offset, offset + len.value));
      }
      offset += len.value;
    } else {
      break;
    }
  }
  return result;
}

function parseRemoteSetActive(data) {
  const result = { active: 0 };
  let offset = 0;
  while (offset < data.length) {
    const tag = readVarintFromBytes(data, offset);
    offset = tag.offset;
    const fieldNum = tag.value >>> 3;
    const wireType = tag.value & 7;
    if (wireType === 0) {
      const val = readVarintFromBytes(data, offset);
      offset = val.offset;
      if (fieldNum === 1) result.active = val.value;
    } else {
      break;
    }
  }
  return result;
}

function parseRemoteStart(data) {
  const result = { started: false };
  let offset = 0;
  while (offset < data.length) {
    const tag = readVarintFromBytes(data, offset);
    offset = tag.offset;
    const fieldNum = tag.value >>> 3;
    const wireType = tag.value & 7;
    if (wireType === 0) {
      const val = readVarintFromBytes(data, offset);
      offset = val.offset;
      if (fieldNum === 1) result.started = val.value !== 0;
    } else {
      break;
    }
  }
  return result;
}

function parseRemotePingRequest(data) {
  const result = { val1: 0, val2: 0 };
  let offset = 0;
  while (offset < data.length) {
    const tag = readVarintFromBytes(data, offset);
    offset = tag.offset;
    const fieldNum = tag.value >>> 3;
    const wireType = tag.value & 7;
    if (wireType === 0) {
      const val = readVarintFromBytes(data, offset);
      offset = val.offset;
      if (fieldNum === 1) result.val1 = val.value;
      else if (fieldNum === 2) result.val2 = val.value;
    } else {
      break;
    }
  }
  return result;
}

function parseRemoteMessage(msg) {
  const result = {
    configure: null,
    setActive: null,
    start: null,
    pingRequest: null,
    raw: msg,
  };
  let offset = 0;
  while (offset < msg.length) {
    const tag = readVarintFromBytes(msg, offset);
    offset = tag.offset;
    const fieldNum = tag.value >>> 3;
    const wireType = tag.value & 7;
    if (wireType === 0) {
      const val = readVarintFromBytes(msg, offset);
      offset = val.offset;
    } else if (wireType === 2) {
      const len = readVarintFromBytes(msg, offset);
      offset = len.offset;
      const fieldData = msg.slice(offset, offset + len.value);
      offset += len.value;
      if (fieldNum === 1) {
        result.configure = parseRemoteConfigure(fieldData);
      } else if (fieldNum === 2) {
        result.setActive = parseRemoteSetActive(fieldData);
      } else if (fieldNum === 8) {
        result.pingRequest = parseRemotePingRequest(fieldData);
      } else if (fieldNum === 13) {
        result.start = parseRemoteStart(fieldData);
      }
    } else {
      break;
    }
  }
  return result;
}

export function parseRemoteMessages(data) {
  const arr = toPlainArray(data);
  const result = [];
  let offset = 0;
  let msgCount = 0;
  while (offset < arr.length) {
    const lenResult = readVarintFromBytes(arr, offset);
    offset = lenResult.offset;
    const msgLen = lenResult.value;
    if (msgLen <= 0 || msgLen > 65535 || offset + msgLen > arr.length) {
      console.log('[Proto] parseRemoteMessages: invalid msgLen=' + msgLen + ' at offset=' + (offset - (lenResult.offset - offset)) + ' arrLen=' + arr.length);
      break;
    }
    const msg = arr.slice(offset, offset + msgLen);
    offset += msgLen;
    result.push(parseRemoteMessage(msg));
    msgCount++;
  }
  console.log('[Proto] parseRemoteMessages: total=' + arr.length + ' bytes, parsed=' + msgCount + ' messages');
  return result;
}
