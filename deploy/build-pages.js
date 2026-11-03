/**
 * GitHub Pages 에 올릴 docs/ 폴더를 만듭니다.
 *
 * ut/ 와 src/ 에 흩어져 있는 파일을 한 폴더로 모으고, index.html 안의 폰트 경로 한 줄만
 * docs/ 안쪽을 가리키도록 고칩니다. 원본(ut/, src/)은 건드리지 않습니다.
 *
 *   node deploy/build-pages.js
 *
 * 고친 내용을 반영하려면 다시 실행한 뒤 커밋·푸시하면 됩니다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs');

const copied = [];

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copied.push(path.relative(OUT, to).replace(/\\/g, '/'));
}

function copyDir(from, to, skip) {
  for (const name of fs.readdirSync(from)) {
    if (skip && skip.includes(name)) continue;
    const src = path.join(from, name);
    const dst = path.join(to, name);
    if (fs.statSync(src).isDirectory()) copyDir(src, dst, skip);
    else copy(src, dst);
  }
}

/* 이전 결과를 지우고 새로 만듭니다. docs/ 는 이 스크립트가 통째로 관리합니다. */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

/* 1. UT 페이지 — data/(수집된 응답)는 올리지 않습니다. 공개 저장소에 들어가면 안 됩니다. */
copyDir(path.join(ROOT, 'ut', 'css'), path.join(OUT, 'css'));
copyDir(path.join(ROOT, 'ut', 'js'), path.join(OUT, 'js'));
copyDir(path.join(ROOT, 'ut', 'assets'), path.join(OUT, 'assets'));

/* 2. 폰트 — src/ 밖으로 나가지 않도록 docs/ 안으로 옮겨 담습니다.
      fonts.css 안의 경로가 ../assets/fonts/ 라서 docs/css → docs/assets/fonts 로 그대로 맞습니다. */
copy(path.join(ROOT, 'src', 'css', 'fonts.css'), path.join(OUT, 'css', 'fonts.css'));
copyDir(path.join(ROOT, 'src', 'assets', 'fonts'), path.join(OUT, 'assets', 'fonts'));

/* 3. index.html — 폰트 경로 한 줄만 고칩니다. */
const htmlSrc = path.join(ROOT, 'ut', 'index.html');
let html = fs.readFileSync(htmlSrc, 'utf8');
const before = '<link rel="stylesheet" href="../src/css/fonts.css">';
const after = '<link rel="stylesheet" href="css/fonts.css">';
if (!html.includes(before)) {
  console.error('index.html 의 폰트 경로를 찾지 못했습니다. 원본이 바뀐 것 같습니다.');
  process.exit(1);
}
html = html.replace(before, after);
fs.writeFileSync(path.join(OUT, 'index.html'), html, 'utf8');
copied.push('index.html');

/* 4. Jekyll 이 _ 로 시작하는 파일을 숨기지 않도록 꺼 둡니다. */
fs.writeFileSync(path.join(OUT, '.nojekyll'), '', 'utf8');
copied.push('.nojekyll');

/* ── 점검 ─────────────────────────────────────────────────── */

// 줄 맨 앞의 선언만 봅니다. 주석 안의 예시 주소를 잡지 않도록.
const endpoint = /^const RESPONSE_ENDPOINT = '([^']*)'/m.exec(
  fs.readFileSync(path.join(OUT, 'js', 'config.js'), 'utf8')
);
const refs = [...html.matchAll(/(?:href|src)="(?!data:|https?:|#)([^"]+)"/g)].map((m) => m[1]);
const missing = refs.filter((r) => !fs.existsSync(path.join(OUT, r)));

console.log('docs/ 에 ' + copied.length + '개 파일');
console.log('index.html 참조 ' + refs.length + '개 — ' + (missing.length ? '빠짐: ' + missing.join(', ') : '모두 있음'));
console.log('응답 저장소: ' + (endpoint && endpoint[1] ? endpoint[1] : '(비어 있음 — 설정 필요)'));
if (fs.existsSync(path.join(OUT, 'data'))) console.log('주의: docs/data 가 들어갔습니다. 지우세요.');
