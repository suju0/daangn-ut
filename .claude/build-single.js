const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..');
const S = path.join(R, 'src');
const rd = p => fs.readFileSync(path.join(S, p), 'utf8');
const b64 = p => fs.readFileSync(path.join(S, p)).toString('base64');

const style = rd('css/style.css').replace(/\s+$/, '')
  + '\n\n/* [통합판 유일한 수정] 인라인 스프라이트 <svg class="sprite"> 는 기본 크기 300x150 을\n'
  + '   차지해 화면 전체를 150px 아래로 밀어냅니다. 원본에는 이 규칙이 없어 상단에\n'
  + '   빈 공간이 생깁니다. 원본과 완전히 동일한 동작을 원하면 아래 한 줄을 지우세요. */\n'
  + 'svg.sprite{display:none}';

// fonts.css -> 실제 woff2를 data URI로 재인라인
const FONTS = [
  ['400',     'assets/fonts/Pretendard-Regular.subset.woff2'],
  ['500 600', 'assets/fonts/Pretendard-SemiBold.subset.woff2'],
  ['700 800', 'assets/fonts/Pretendard-Bold.subset.woff2'],
];
const fontCss = FONTS.map(([w, f]) =>
  '@font-face{font-family:"Pretendard";font-style:normal;font-weight:' + w + ';font-display:swap;\n' +
  '  src:url(data:font/woff2;base64,' + b64(f) + ') format("woff2")}'
).join('\n');

// sprite.svg -> 래퍼 <svg> 를 class="sprite" 형태로 되돌려 인라인
let sprite = rd('assets/icons/sprite.svg').trim();
sprite = sprite
  .replace(/^<svg[^>]*>/, '<svg class="sprite" aria-hidden="true">')
  .replace(/<\/svg>$/, '</svg>');

// index.html -> 마크업만 추출 (.phone … .ut-hint)
const idx = rd('index.html');
const start = idx.indexOf('<div class="phone"');
const endTag = '<p class="ut-hint">탭할 수 있는 프로토타입입니다.</p>';
const end = idx.indexOf(endTag) + endTag.length;
const markup = idx.slice(start, end);

const app = rd('js/app.js').replace(/\s+$/, '');

const out = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>나의 당근</title>
<style>
/* ══════════════════════════════════════════════════════════════
   Pretendard v1.3.9 — SIL Open Font License 1.1
   외부 CDN 없이 동작하도록 woff2 3종을 data URI로 임베드했습니다.
   weight 500은 SemiBold, 800은 Bold에 매핑됩니다.
   ══════════════════════════════════════════════════════════════ */
${fontCss}

${style}
</style>
</head>
<body>

<!-- ══════════ 아이콘 스프라이트 (<g> 39 + <symbol> 9 = 48개 정의) ══════════ -->
${sprite}

<!-- ══════════ 화면 마크업 ══════════ -->
${markup}

<script>
${app}
</script>
</body>
</html>
`;

const dest = path.join(R, 'daangn-my-single.html');
fs.writeFileSync(dest, out, 'utf8');
console.log('wrote ' + dest + '  ' + Buffer.byteLength(out) + ' bytes');
