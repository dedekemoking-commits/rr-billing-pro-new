import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';
import { GITHUB } from './githubConfig';

const LOCAL_KEY = 'rr_github_transaksi_last_sync';

function apiPath(username) {
  const file = `transactions_${username}.json`;
  return `https://api.github.com/repos/${GITHUB.owner}/${GITHUB.repo}/contents/${file}`;
}

function authHeaders() {
  const h = { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'rr-billing-pro' };
  if (GITHUB.token) h.Authorization = `token ${GITHUB.token}`;
  return h;
}

export async function fetchTransaksiRemote(username) {
  if (!GITHUB.token) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(apiPath(username), { headers: authHeaders(), signal: controller.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const json = await res.json();
    return JSON.parse(Buffer.from(json.content, 'base64').toString('utf8'));
  } catch (e) {
    console.warn('[GitHub] Gagal fetch transaksi remote:', e.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function saveTransaksiToGithub(username, transactions) {
  if (!GITHUB.token) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const url = apiPath(username);
    const getRes = await fetch(url, { headers: authHeaders(), signal: controller.signal });
    let sha = null;
    if (getRes.ok) {
      const existing = await getRes.json();
      sha = existing.sha;
    }
    const content = Buffer.from(JSON.stringify(transactions, null, 2)).toString('base64');
    const putRes = await fetch(url, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Update transaksi', content, sha }),
      signal: controller.signal,
    });
    if (!putRes.ok) throw new Error(`GitHub write failed ${putRes.status}`);
    await AsyncStorage.setItem(LOCAL_KEY, new Date().toISOString());
    return true;
  } catch (e) {
    console.warn('[GitHub] Gagal simpan transaksi remote:', e.message);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function hapusTransaksiRemote(username) {
  if (!GITHUB.token) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const url = apiPath(username);
    const getRes = await fetch(url, { headers: authHeaders(), signal: controller.signal });
    if (!getRes.ok) return false;
    const existing = await getRes.json();
    await fetch(url, {
      method: 'DELETE',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hapus semua transaksi', sha: existing.sha }),
      signal: controller.signal,
    });
    await AsyncStorage.removeItem(LOCAL_KEY);
    return true;
  } catch (e) {
    console.warn('[GitHub] Gagal hapus transaksi remote:', e.message);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function syncTransaksi(username, localTransactions) {
  const remote = await fetchTransaksiRemote(username);
  if (!remote || remote.length === 0) {
    if (localTransactions.length > 0) {
      await saveTransaksiToGithub(username, localTransactions);
    }
    return localTransactions;
  }
  const remoteIds = new Set(remote.map(t => t.id));
  const localOnly = localTransactions.filter(t => !remoteIds.has(t.id));
  const merged = [...remote, ...localOnly].sort((a, b) => new Date(b.waktu) - new Date(a.waktu));
  await saveTransaksiToGithub(username, merged);
  return merged;
}
