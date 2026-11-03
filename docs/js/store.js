/**
 * 응답 저장소
 *
 * 설문을 마치면 곧바로 서버(.claude/ut-server.js)로 전송되어 대시보드에 쌓입니다.
 * 참가자가 파일을 저장해 전달할 필요가 없습니다.
 *
 * 서버가 없는 상태(정적 파일로 열었거나 API 가 없는 서버)에서는 브라우저 localStorage 에만
 * 남고, 연결이 되는 순간 밀린 응답을 자동으로 올립니다.
 */
const Store = (() => {
  const KEY_RESPONSES = 'daangn-ut/responses/v1';
  const KEY_DRAFT = 'daangn-ut/draft/v1';
  const KEY_PENDING = 'daangn-ut/pending/v1';
  // ut-server.js 가 루트에 붙여 주는 엔드포인트입니다.
  const API = '/api/responses';

  /**
   * 응답을 어디로 보낼지.
   *
   * config.js 의 RESPONSE_ENDPOINT 가 비어 있으면 'local' — 지금까지와 똑같이 같은 서버의 API 를 씁니다.
   * 주소가 들어 있으면 'remote' — Google Apps Script 웹앱으로 보냅니다(GitHub Pages 배포용).
   *
   * Apps Script 는 응답 헤더를 정할 수 없어 CORS 사전 확인을 통과하지 못합니다. 그래서 원격일 때는
   *   · Content-Type 을 text/plain 으로 보내 사전 확인이 생기지 않게 하고
   *   · 비밀번호를 헤더 대신 본문·쿼리로 싣고
   *   · DELETE/HEAD 대신 POST/GET 한 가지씩만 씁니다.
   */
  const REMOTE =
    typeof RESPONSE_ENDPOINT === 'string' && RESPONSE_ENDPOINT.trim() ? RESPONSE_ENDPOINT.trim() : '';
  const isRemote = () => REMOTE !== '';

  /** 서버 연결 상태: 'unknown' | 'online' | 'offline' | 'unauthorized' */
  let serverState = 'unknown';

  /**
   * 응답 읽기용 진행자 비밀번호.
   * 대시보드 잠금을 푼 탭에만 남고, 서버 GET 요청 헤더로 실려 갑니다.
   * 제출(POST)에는 필요 없습니다 — 참가자는 쓰기만 할 수 있습니다.
   */
  const AUTH_KEY = 'daangn-ut/auth';
  const setAuth = (passcode) => sessionStorage.setItem(AUTH_KEY, passcode);
  const authValue = () => sessionStorage.getItem(AUTH_KEY) || '';
  const authHeaders = () => {
    const p = authValue();
    return p ? { 'x-ut-passcode': p } : {};
  };

  /** 원격(Apps Script)에 보내는 POST. 사전 확인이 생기지 않도록 text/plain 으로 보냅니다. */
  async function remotePost(payload) {
    const res = await fetch(REMOTE, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow', // Apps Script 는 결과를 다른 주소로 넘겨 줍니다
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  /** 원격 GET. 비밀번호가 필요한 요청은 쿼리에 실어 보냅니다. */
  async function remoteGet(params) {
    const url = REMOTE + (REMOTE.includes('?') ? '&' : '?') + new URLSearchParams(params);
    const res = await fetch(url, { cache: 'no-store', redirect: 'follow' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('[store] 읽기 실패', e);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('[store] 저장 실패', e);
      return false;
    }
  }

  function newId() {
    return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  /* ── 진행 중 응답(중간 이탈 대비) ─────────────────────────── */
  const draft = {
    get: () => read(KEY_DRAFT, null),
    set: (record) => write(KEY_DRAFT, record),
    clear: () => localStorage.removeItem(KEY_DRAFT),
  };

  /* ── 로컬 캐시 ─────────────────────────────────────────── */
  function localList() {
    const rows = read(KEY_RESPONSES, []);
    return Array.isArray(rows) ? rows : [];
  }

  function localPut(record) {
    const rows = localList();
    const at = rows.findIndex((r) => r.id === record.id);
    if (at >= 0) rows[at] = record;
    else rows.push(record);
    write(KEY_RESPONSES, rows);
  }

  function mergeRows(...lists) {
    const byId = new Map();
    lists.flat().forEach((r) => {
      if (r && r.id) byId.set(r.id, r);
    });
    return [...byId.values()].sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
  }

  /* ── 서버 전송 ─────────────────────────────────────────── */

  async function push(record) {
    if (isRemote()) {
      const body = await remotePost({ op: 'save', record });
      if (!body.ok) throw new Error(body.error || 'save_failed');
      return body;
    }
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  const pending = {
    list: () => read(KEY_PENDING, []),
    add(record) {
      const rows = pending.list().filter((r) => r.id !== record.id);
      rows.push(record);
      write(KEY_PENDING, rows);
    },
    remove(id) {
      write(KEY_PENDING, pending.list().filter((r) => r.id !== id));
    },
  };

  /** 아직 못 올린 응답을 다시 올려 봅니다. */
  async function flush() {
    const rows = pending.list();
    if (!rows.length) return 0;
    let sent = 0;
    for (const record of rows) {
      try {
        await push(record);
        pending.remove(record.id);
        sent += 1;
      } catch (e) {
        serverState = 'offline';
        return sent; // 한 번 실패하면 더 시도하지 않고 다음 기회로 미룹니다
      }
    }
    if (sent) serverState = 'online';
    return sent;
  }

  /**
   * 완료된 응답을 저장합니다.
   * 로컬에 먼저 남기고 서버로 올립니다. 서버가 없으면 대기열에 넣어 두었다가 나중에 올립니다.
   */
  async function commit(record) {
    localPut(record);
    try {
      await push(record);
      serverState = 'online';
      return { saved: 'server' };
    } catch (e) {
      serverState = 'offline';
      pending.add(record);
      return { saved: 'local' };
    }
  }

  /** 서버 + 로컬을 합쳐서 돌려줍니다. */
  async function list() {
    await flush();
    let remote = [];
    try {
      if (isRemote()) {
        const body = await remoteGet({ op: 'list', passcode: authValue() });
        if (!body.ok && body.error === 'unauthorized') {
          serverState = 'unauthorized';
          return mergeRows(localList());
        }
        if (!body.ok) throw new Error(body.error || 'list_failed');
        remote = Array.isArray(body.responses) ? body.responses : [];
      } else {
        const res = await fetch(API, { cache: 'no-store', headers: authHeaders() });
        if (res.status === 401) {
          serverState = 'unauthorized';
          return mergeRows(localList());
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const body = await res.json();
        remote = Array.isArray(body.responses) ? body.responses : [];
      }
      serverState = 'online';
    } catch (e) {
      serverState = 'offline';
    }
    return mergeRows(remote, localList());
  }

  /** 다른 기기에서 받은 응답 파일을 합칩니다. 서버가 있으면 서버에도 올립니다. */
  async function merge(incoming) {
    const known = new Set(localList().map((r) => r.id));
    let added = 0;
    for (const r of incoming) {
      if (!r || typeof r !== 'object' || !r.id || known.has(r.id)) continue;
      localPut(r);
      known.add(r.id);
      added += 1;
      try {
        await push(r);
      } catch (e) {
        pending.add(r);
      }
    }
    return added;
  }

  function clearLocal() {
    localStorage.removeItem(KEY_RESPONSES);
    localStorage.removeItem(KEY_PENDING);
    localStorage.removeItem(KEY_DRAFT);
  }

  /** 서버와 이 브라우저에 쌓인 응답을 모두 비웁니다. 되돌릴 수 없습니다. */
  async function clearAll() {
    let server = false;
    try {
      if (isRemote()) {
        const body = await remotePost({ op: 'clear', passcode: authValue() });
        server = !!body.ok;
      } else {
        const res = await fetch(API, { method: 'DELETE', headers: authHeaders() });
        server = res.ok;
      }
    } catch (e) {
      server = false;
    }
    clearLocal();
    return { server };
  }

  /**
   * 응답 수집 서버가 떠 있는지 확인합니다.
   * 비밀번호가 없어 401 이 돌아와도 '서버는 살아 있다'는 뜻이므로 연결된 것으로 봅니다.
   */
  async function ping() {
    try {
      if (isRemote()) {
        const body = await remoteGet({ op: 'ping' });
        serverState = body && body.ok ? 'online' : 'offline';
        return !!(body && body.ok);
      }
      const res = await fetch(API, { method: 'HEAD', cache: 'no-store' });
      const up = res.ok || res.status === 401;
      serverState = up ? 'online' : 'offline';
      return up;
    } catch (e) {
      serverState = 'offline';
      return false;
    }
  }

  /* ── 내보내기 ──────────────────────────────────────────── */
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');

  function exportJSON(rows) {
    download(`daangn-ut-${stamp()}.json`, JSON.stringify(rows, null, 2), 'application/json');
  }

  function csvCell(v) {
    if (v === null || v === undefined) return '';
    const s = Array.isArray(v) ? v.join(' | ') : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /** 스프레드시트에서 바로 볼 수 있는 wide 형식. 한 행 = 참가자 한 명. */
  function exportCSV(rows, columns) {
    const lines = [columns.map((c) => csvCell(c.label)).join(',')];
    for (const r of rows) lines.push(columns.map((c) => csvCell(c.get(r))).join(','));
    // Excel 이 UTF-8 로 열도록 BOM 을 붙입니다.
    download(`daangn-ut-${stamp()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv');
  }

  return {
    newId,
    setAuth,
    draft,
    commit,
    list,
    merge,
    flush,
    ping,
    clearLocal,
    clearAll,
    exportJSON,
    exportCSV,
    /** 카운터밸런싱 순서 결정처럼 동기적으로 건수만 필요할 때 씁니다. */
    localCount: () => localList().length,
    pendingCount: () => pending.list().length,
    serverState: () => serverState,
  };
})();
