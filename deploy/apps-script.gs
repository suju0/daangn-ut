/**
 * 당근 앱 리디자인 UT — 응답 수집 백엔드 (Google Apps Script)
 *
 * GitHub Pages 처럼 서버가 없는 곳에 UT 페이지를 올렸을 때, 응답을 받아 구글 시트에 쌓습니다.
 * 진행자 PC 가 꺼져 있어도 참가자가 링크만으로 참여할 수 있습니다.
 *
 * ── 왜 이 구조인가 ───────────────────────────────────────────
 * 비밀번호를 **이 스크립트 안에** 둡니다. 페이지는 공개되므로 소스에 비밀번호를 넣을 수 없고,
 * 진행자가 대시보드에서 직접 입력한 값이 여기로 와서 대조됩니다.
 * 그래서 참가자는 제출만 되고, 응답 열람은 비밀번호를 아는 사람만 할 수 있습니다.
 *
 * Apps Script 웹앱은 응답 헤더를 직접 정할 수 없어 CORS 사전 확인(preflight)을 통과하지 못합니다.
 * 그래서 페이지 쪽에서 Content-Type 을 text/plain 으로 보내 사전 확인 자체가 생기지 않게 하고,
 * 여기서는 본문을 JSON 으로 직접 파싱합니다. 삭제도 DELETE 대신 POST 한 가지로 받습니다.
 *
 * ── 설치 ────────────────────────────────────────────────────
 * deploy/README.md 의 "2. 응답 저장소 만들기" 를 따라가세요.
 */

/** 진행자 비밀번호. 대시보드에서 입력한 값과 여기서 대조합니다. 바꾸면 다시 배포해야 합니다. */
const PASSCODE = 'daangn-ut-2026';

/** 응답이 쌓일 시트 이름. 없으면 자동으로 만듭니다. */
const SHEET_NAME = 'responses';

/** 한 행에 담는 열. json 열에 응답 전체가 들어가고, 앞 세 열은 시트에서 눈으로 보기 위한 것입니다. */
const HEADERS = ['id', 'startedAt', 'finishedAt', 'json'];

/* ── 시트 ────────────────────────────────────────────────── */

function sheet_() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sh = book.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = book.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function readAll_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  const rows = [];
  values.forEach(function (v) {
    const raw = v[3];
    if (!raw) return;
    try {
      rows.push(JSON.parse(raw));
    } catch (e) {
      // 한 줄이 깨져도 나머지는 살립니다.
    }
  });
  return rows;
}

/** 같은 id 가 있으면 그 줄을 덮어쓰고, 없으면 새 줄로 붙입니다. */
function upsert_(record) {
  const sh = sheet_();
  const last = sh.getLastRow();
  const row = [record.id, record.startedAt || '', record.finishedAt || '', JSON.stringify(record)];

  if (last >= 2) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(record.id)) {
        sh.getRange(i + 2, 1, 1, HEADERS.length).setValues([row]);
        return last - 1;
      }
    }
  }
  sh.appendRow(row);
  return sh.getLastRow() - 1;
}

function clearAll_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last >= 2) sh.deleteRows(2, last - 1);
}

/* ── 응답 ────────────────────────────────────────────────── */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 읽기·삭제는 비밀번호가 맞아야 합니다.
 * 길이가 달라도 끝까지 비교해 응답 시간으로 글자를 추측하지 못하게 합니다.
 */
function authorized_(given) {
  const a = String(given == null ? '' : given);
  const b = PASSCODE;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/* ── 들어오는 요청 ───────────────────────────────────────── */

/**
 * GET
 *   ?op=ping             살아 있는지 확인. 비밀번호 없이 됩니다.
 *   ?op=list&passcode=…  응답 전체. 비밀번호 필요.
 */
function doGet(e) {
  const p = (e && e.parameter) || {};
  const op = p.op || 'ping';

  if (op === 'ping') return json_({ ok: true, service: 'daangn-ut' });

  if (op === 'list') {
    if (!authorized_(p.passcode)) return json_({ ok: false, error: 'unauthorized' });
    const rows = readAll_();
    return json_({ ok: true, responses: rows, total: rows.length });
  }

  return json_({ ok: false, error: 'unknown_op' });
}

/**
 * POST (본문은 JSON 문자열, Content-Type 은 text/plain)
 *   { op: 'save',  record: {...} }         응답 한 건 저장. 비밀번호 불필요(참가자가 제출).
 *   { op: 'clear', passcode: '…' }         전체 비우기. 비밀번호 필요.
 */
function doPost(e) {
  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'bad_json' });
  }

  const op = body.op || 'save';

  if (op === 'save') {
    const record = body.record;
    if (!record || !record.id) return json_({ ok: false, error: 'no_id' });
    // 같은 응답이 동시에 들어와 줄이 겹치지 않도록 잠깐 잠급니다.
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const total = upsert_(record);
      return json_({ ok: true, total: total });
    } finally {
      lock.releaseLock();
    }
  }

  if (op === 'clear') {
    if (!authorized_(body.passcode)) return json_({ ok: false, error: 'unauthorized' });
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      clearAll_();
      return json_({ ok: true, total: 0 });
    } finally {
      lock.releaseLock();
    }
  }

  return json_({ ok: false, error: 'unknown_op' });
}
