// 분석 첨부용 단일 파일: daangn-my-single.html 과 동일 구조에서
// woff2 base64 3개(2.3MB)만 제거. 코드/에셋 구조는 그대로 유지.
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..');
const S = path.join(R, 'src');
const rd = p => fs.readFileSync(path.join(S, p), 'utf8');

const style = rd('css/style.css').replace(/\s+$/, '')
  + '\n\nsvg.sprite{display:none}';

let sprite = rd('assets/icons/sprite.svg').trim()
  .replace(/^<svg[^>]*>/, '<svg class="sprite" aria-hidden="true">')
  .replace(/<\/svg>$/, '</svg>');

const idx = rd('index.html');
const startTag = '<div class="phone"';
const endTag = '<p class="ut-hint">탭할 수 있는 프로토타입입니다.</p>';
const markup = idx.slice(idx.indexOf(startTag), idx.indexOf(endTag) + endTag.length);

const app = rd('js/app.js').replace(/\s+$/, '');

const out = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>나의 당근 — 분석용 단일 파일</title>
<!--
  ══════════════════════════════════════════════════════════════════════
  나의 당근 (My Carrot) 마이페이지 프로토타입 — 분석용 단일 파일
  ══════════════════════════════════════════════════════════════════════
  원본: my-daangn-planb-test.html (단일 HTML, 빌드 도구·프레임워크 없음)
  구성: 순수 HTML + CSS + 바닐라 JS(IIFE). React/번들러 미사용.

  이 파일은 아래 5개 소스를 하나로 합친 것입니다.
    src/index.html                        마크업
    src/css/style.css                     디자인 CSS
    src/js/app.js                         인터랙션 로직
    src/assets/icons/sprite.svg           아이콘 48개 (<g> 39 + <symbol> 9)
    src/assets/img/daangnpay-wordmark.png 당근페이 워드마크 (스프라이트 내 data URI)

  [분석용 변경 2가지 — 원본과 다른 점]
    1. Pretendard woff2 3종(합계 2.3MB, base64)을 제거했습니다.
       분석 가치가 없고 용량의 98%를 차지합니다. --sans 의 시스템 폰트
       폴백으로 렌더링되므로 레이아웃 검토에는 지장이 없습니다.
       원본 @font-face 3개 스펙:
         font-weight:400      -> Pretendard-Regular.subset.woff2   765,892 B
         font-weight:500 600  -> Pretendard-SemiBold.subset.woff2  785,856 B
         font-weight:700 800  -> Pretendard-Bold.subset.woff2      791,156 B
    2. svg.sprite{display:none} 한 줄을 추가했습니다. 원본에는 이 규칙이
       없어 인라인 스프라이트가 300x150 공간을 차지하고 화면 전체를
       150px 아래로 밀어내는 결함이 있습니다(발행된 아티팩트에도 존재).

  데이터: JSON 에셋 없음. app.js 내 객체 리터럴 DEALS(거래 목록)와
          NAV(화면 40개 매핑)가 유일한 데이터 소스입니다.
  ══════════════════════════════════════════════════════════════════════
-->
<style>
/* Pretendard 는 분석용 파일에서 제외 — 시스템 폰트 폴백으로 렌더링됩니다.
   실제 폰트 파일은 src/assets/fonts/ 에 있습니다. */

${style}
</style>
</head>
<body>

<!-- ══════════ 아이콘 스프라이트 (48개 정의) ══════════ -->
${sprite}

<!-- ══════════ 화면 마크업 ══════════ -->
${markup}

<script>
${app}
</script>
</body>
</html>
`;

const dest = path.join(R, 'daangn-my-analysis.html');
fs.writeFileSync(dest, out, 'utf8');
console.log('wrote ' + dest + '  ' + Buffer.byteLength(out) + ' bytes');
