import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';
import { GITHUB } from './githubConfig';

const API = `https://api.github.com/repos/${GITHUB.owner}/${GITHUB.repo}/contents/${GITHUB.path}`;
const HEADERS = {
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'rr-billing-pro',
};
const LOCAL_KEY = 'rr_github_users';

function authHeaders() {
  const h = { ...HEADERS };
  const token = GITHUB.token;
  if (token) h.Authorization = `token ${token}`;
  return h;
}

export let cachedUsers = null;

async function fetchFromGitHub() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(API, { headers: authHeaders(), signal: controller.signal });
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`GitHub API ${res.status}`);
    }
    const json = await res.json();
    return JSON.parse(Buffer.from(json.content, 'base64').toString('utf8'));
  } finally {
    clearTimeout(timeout);
  }
}

export async function saveToGitHub(users) {
  const token = GITHUB.token;
  if (!token) throw new Error('GitHub token belum diatur');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(API, { headers: authHeaders(), signal: controller.signal });
    let sha = null;
    if (res.ok) {
      const existing = await res.json();
      sha = existing.sha;
    }
    const content = Buffer.from(JSON.stringify(users, null, 2)).toString('base64');
    const putRes = await fetch(API, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Update users', content, sha }),
      signal: controller.signal,
    });
    if (!putRes.ok) throw new Error(`GitHub write failed ${putRes.status}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function loadLocalFallback() {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function saveLocalFallback(users) {
  await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(users));
}

export async function fetchUsers() {
  if (cachedUsers) return cachedUsers;
  try {
    if (GITHUB.token) {
      const remote = await fetchFromGitHub();
      if (remote) {
        cachedUsers = remote;
        await saveLocalFallback(remote);
        return cachedUsers;
      }
    }
  } catch (e) {
    console.warn('GitHub sync failed:', e.message);
  }
  const local = await loadLocalFallback();
  cachedUsers = local;
  return local;
}

export async function seedAdmin(sha256Fn) {
  const users = await fetchUsers();
  if (Object.keys(users).length === 0) {
    const hash = await sha256Fn('dheedek01');
    users.rrgaming = { passwordHash: hash, role: 'admin' };
    cachedUsers = users;
    if (GITHUB.token) {
      try { await saveToGitHub(users); return; } catch (e) { console.warn('GitHub seed save failed:', e.message); }
    }
    await saveLocalFallback(users);
  }
}

export async function cekUsername(username) {
  const users = await fetchUsers();
  return !!users[username.trim().toLowerCase()];
}

export async function daftarUser(username, passwordHash, email) {
  const key = username.trim().toLowerCase();
  try {
    const users = await fetchUsers();
    if (users[key]) throw new Error('Username sudah ada');
    users[key] = {
      passwordHash, role: 'kasir', email: email || '',
      dibuat: new Date().toISOString(),
    };
    cachedUsers = users;
    if (GITHUB.token) {
      await saveToGitHub(users);
    } else {
      await saveLocalFallback(users);
    }
  } catch (e) {
    if (e.message === 'Username sudah ada') throw e;
    throw new Error('Gagal simpan ke server: ' + e.message);
  }
}

export async function loginUser(username, passwordHash) {
  const users = await fetchUsers();
  const key = username.trim().toLowerCase();
  const user = users[key];
  if (!user || user.passwordHash !== passwordHash) return null;
  return { username: key, role: user.role };
}
