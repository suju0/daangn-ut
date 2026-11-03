/**
 * UT 진행용 로컬 서버
 *
 * 정적 파일(프로젝트 루트)과 함께, 응답을 한곳에 모으는 작은 API 를 제공합니다.
 * 참가자가 설문을 마치면 브라우저가 곧바로 POST 하므로
 * 파일을 저장해서 전달할 필요가 없습니다.
 *
 *   GET  /api/responses   저장된 응답 전체
 *   POST /api/responses   응답 한 건 저장(같은 id 면 덮어씀)
 *
 * 저장 위치: ut/data/responses.json
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'ut', 'data');
const DATA_FILE = path.join(DATA_DIR, 'responses.json');
const PORT = 8780;

/**
 * 응답 읽기에 필요한 비밀번호 해시.
 * 값이 두 곳에 흩어지지 않도록 ut/js/config.js 에 적힌 것을 그대로 읽어 씁니다.
 * (쓰기는 막지 않습니다. 참가자가 제출은 할 수 있어야 하니까요.)
 */
function passcodeHash() {
  try {
    const src = fs.readFileSync(path.join(ROOT, 'ut', 'js', 'config.js'), 'utf8');
    const m = /resultPasscodeHash:\s*'([0-9a-f]{64})'/.exec(src);
    return m ? m[1] : null;
  } catch (e) {
    return null;
  }
}

function authorized(req) {
  const expected = passcodeHash();
  if (!expected) return false;
  const given = req.headers['x-ut-passcode'];
  if (!given) return false;
  return crypto.createHash('sha256').update(String(given), 'utf8').digest('hex') === expected;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

function readAll() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    return [];
  }
}

function writeAll(rows) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // 임시 파일에 쓰고 교체합니다. 저장 도중 서버가 죽어도 기존 응답이 깨지지 않습니다.
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

function sendJSON(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(text);
}

function handleApi(req, res) {
  if (req.method === 'GET') {
    // 읽기는 진행자만. 참가자가 주소만 알고 남의 응답을 보는 일이 없도록 합니다.
    if (!authorized(req)) {
      sendJSON(res, 401, { error: '진행자 비밀번호가 필요합니다' });
      return;
    }
    sendJSON(res, 200, { responses: readAll() });
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) req.destroy(); // 응답 한 건이 5MB 를 넘을 일은 없습니다
    });
    req.on('end', () => {
      let record;
      try {
        record = JSON.parse(body);
      } catch (e) {
        sendJSON(res, 400, { error: 'json 을 읽지 못했습니다' });
        return;
      }
      if (!record || !record.id) {
        sendJSON(res, 400, { error: 'id 가 없습니다' });
        return;
      }
      const rows = readAll();
      const at = rows.findIndex((r) => r.id === record.id);
      if (at >= 0) rows[at] = record;
      else rows.push(record);
      try {
        writeAll(rows);
      } catch (e) {
        sendJSON(res, 500, { error: '저장에 실패했습니다: ' + e.message });
        return;
      }
      console.log(`[ut] 응답 저장 ${record.id} (총 ${rows.length}건)`);
      sendJSON(res, 200, { ok: true, total: rows.length });
    });
    return;
  }

  if (req.method === 'DELETE') {
    // 수집한 응답을 전부 비웁니다. 되돌릴 수 없으므로 진행자만 할 수 있습니다.
    if (!authorized(req)) {
      sendJSON(res, 401, { error: '진행자 비밀번호가 필요합니다' });
      return;
    }
    try {
      writeAll([]);
    } catch (e) {
      sendJSON(res, 500, { error: '초기화에 실패했습니다: ' + e.message });
      return;
    }
    console.log('[ut] 응답 전체 초기화');
    sendJSON(res, 200, { ok: true, total: 0 });
    return;
  }

  // 서버가 살아 있는지 확인하는 용도. 비밀번호가 없어도 응답합니다.
  if (req.method === 'HEAD') {
    res.writeHead(200, { 'Cache-Control': 'no-store' }).end();
    return;
  }

  sendJSON(res, 405, { error: 'GET · POST · DELETE 만 됩니다' });
}

const server = http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === '/api/responses') {
      handleApi(req, res);
      return;
    }

    // 상대 경로(css/…, js/…)가 어긋나지 않도록 리다이렉트로 보냅니다.
    if (pathname === '/' || pathname === '/ut' || pathname === '/ut/') {
      res.writeHead(302, { Location: '/ut/index.html' + url.search + url.hash }).end();
      return;
    }

    const file = path.join(ROOT, pathname);
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end();
      return;
    }

    // 응답이 쌓이는 폴더는 정적으로 내주지 않습니다.
    // 참가자가 주소만 알면 남의 응답을 통째로 볼 수 있게 되기 때문입니다.
    if (file.startsWith(DATA_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('403');
      return;
    }

    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 ' + pathname);
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(buf);
    });
  });

/* 포트가 이미 쓰이고 있으면 스택 트레이스 대신 무엇을 해야 하는지 알려 줍니다. */
server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error('');
  console.error(`  [!] ${PORT} 포트를 이미 다른 프로그램이 쓰고 있습니다.`);
  console.error('');
  console.error('      UT 서버가 이미 떠 있는 것일 수 있습니다.');
  console.error(`      브라우저에서 http://localhost:${PORT}/ 이 열리면 그대로 쓰시면 됩니다.`);
  console.error('      열리지 않는다면 그 프로그램을 끄고 이 창을 다시 실행해 주세요.');
  console.error('');
  process.exit(1);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  당근 앱 리디자인 — UT 서버가 켜졌습니다.');
  console.log('');
  console.log(`  진행 화면      http://localhost:${PORT}/`);
  console.log(`  응답 대시보드  http://localhost:${PORT}/#/result`);
  console.log(`  응답 저장 위치 ${DATA_FILE}`);
  console.log('');
  console.log('  이 창을 닫으면 서버가 꺼집니다. 테스트하는 동안은 열어 두세요.');
  console.log('');

  // 바로가기(.cmd)로 켠 경우에만 브라우저를 함께 엽니다.
  if (process.argv.includes('--open')) {
    require('child_process').exec(`start "" "http://localhost:${PORT}/"`);
  }
});
