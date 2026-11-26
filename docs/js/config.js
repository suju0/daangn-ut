/**
 * 당근 앱 리디자인 — UT 설정
 *
 * 이 파일만 고치면 프로토타입 주소·태스크·문항을 전부 바꿀 수 있습니다.
 * 나머지 js 파일은 건드릴 일이 없습니다.
 */

/* ═══════════════════════════════════════════════════════════════
   1. 프로토타입
   ═══════════════════════════════════════════════════════════════ */

/**
 * Figma 프로토타입 임베드 주소를 만듭니다.
 *
 * fileKey / nodeId 는 Figma 공유 > 프로토타입 링크에서 그대로 가져옵니다.
 *   https://www.figma.com/proto/<fileKey>/<이름>?node-id=<nodeId>&…
 */
/**
 * 임베드 표시 옵션.
 *
 * 여기 있는 값은 **Figma 파일을 고치지 않습니다.** 보여 주는 쪽 설정일 뿐이고,
 * 프로토타입 안에 만들어 둔 연결·오버레이·스마트 애니메이트는 전부 원본 그대로 돕니다.
 * 다만 아래 두 개는 '누를 때의 느낌'을 바꾸므로, 원본과 다르게 느껴지면 여기를 되돌리면 됩니다.
 */
const EMBED_VIEW = {
  /**
   * 빈 곳을 눌렀을 때 클릭 가능한 영역이 파랗게 반짝이는 Figma 기본 동작.
   * true  = Figma 기본값 그대로 (원본 프로토타입과 똑같이 반응)
   * false = 끔. 참가자가 반짝임을 힌트로 삼지 못해 '찾기 쉬움' 측정은 더 엄격해지지만,
   *         반응 없는 곳을 눌렀을 때 아무 일도 일어나지 않아 화면이 멈춘 것처럼 느껴집니다.
   */
  hotspotHints: true,

  /**
   * 화살표 키·스페이스로 다음 프레임으로 넘어가는 Figma 기본 동작.
   * true = Figma 기본값 그대로. false = 끔(키보드로 작업을 건너뛰는 사고를 막습니다).
   */
  keyboardNav: false,

  /** Figma 툴바 숨김. 참가자에게 앱처럼 보이도록 true 를 권합니다. */
  hideUI: true,

  /**
   * 표시 배율. 디자인 자체는 바뀌지 않고 화면에 맞추는 방식만 달라집니다.
   *   scale-down-width — 기기 영역 폭에 맞춰 축소(기본). 잘리지 않고 꽉 찹니다.
   *   min-zoom         — 원본 공유 링크와 동일한 '실제 크기'. 프레임이 더 크면 잘립니다.
   *   contain          — 전체가 보이지만 위아래 여백이 큽니다.
   */
  scaling: 'scale-down-width',
};

function figmaProto({ fileKey, fileName, nodeId, startNodeId }) {
  const params = new URLSearchParams({
    'node-id': nodeId,
    'starting-point-node-id': startNodeId || nodeId,
    'scaling': EMBED_VIEW.scaling,
    'content-scaling': 'fixed',    // 원본 공유 링크와 동일 — 디자인이 늘어나지 않습니다
    'hide-ui': EMBED_VIEW.hideUI ? '1' : '0',
    'hotspot-hints': EMBED_VIEW.hotspotHints ? '1' : '0',
    'disable-default-keyboard-nav': EMBED_VIEW.keyboardNav ? '0' : '1',
    'theme': 'light',              // 임베드 배경을 밝게 — 기본 다크 배경이면 기기 주변이 검게 보입니다
    'embed-host': EMBED_HOST,
  });
  return `https://embed.figma.com/proto/${fileKey}/${fileName}?${params}`;
}

/** postMessage 이벤트를 받기 위한 호스트 이름. 바꾸면 이벤트 수신이 끊깁니다. */
const EMBED_HOST = 'daangn-ut';

/**
 * 개선 전(AS-IS) — Daangn_UT_Prototype (AS-IS)
 * https://www.figma.com/proto/3xP3ycyRn2TdIZkkVlfjL5/Daangn_UT_Prototype--AS-IS-?node-id=11-3765
 */
const PROTO_ASIS = figmaProto({
  fileKey: '3xP3ycyRn2TdIZkkVlfjL5',
  fileName: 'Daangn_UT_Prototype--AS-IS-',
  nodeId: '11-3765',
  startNodeId: '11:3765',
});

/**
 * 개선 후(TO-BE) — Daangn_UT_Prototype (TO-BE)
 * https://www.figma.com/proto/z1kIxzbitDMsJrsSh9bPFX/Daangn_UT_Prototype--TO-BE-?node-id=11-3765
 */
const PROTO_TOBE = figmaProto({
  fileKey: 'z1kIxzbitDMsJrsSh9bPFX',
  fileName: 'Daangn_UT_Prototype--TO-BE-',
  nodeId: '11-3765',
  startNodeId: '11:3765',
});

/**
 * AS-IS 가 아직 TO-BE 로 채워져 있음을 진행자에게 알릴지 여부.
 * 두 프로토타입이 각각 연결되었으므로 false 입니다.
 */
const ASIS_IS_PLACEHOLDER = false;

/**
 * 응답을 받아 줄 주소.
 *
 * **비워 두면 지금까지와 똑같이** 같은 서버의 `/api/responses`(.claude/ut-server.js)를 씁니다.
 * localhost:8780 로 진행하실 때는 건드릴 것이 없습니다.
 *
 * GitHub Pages 처럼 서버가 없는 곳에 올릴 때만, 배포한 Google Apps Script 웹앱 주소를 넣으세요.
 * 그러면 응답이 그쪽 구글 시트로 쌓이고 진행자 PC 가 꺼져 있어도 참가자가 참여할 수 있습니다.
 * 만드는 방법은 deploy/README.md 에 있습니다.
 *
 *   const RESPONSE_ENDPOINT = 'https://script.google.com/macros/s/AKfycb…/exec';
 */
const RESPONSE_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxkWJSuywIMRoakQSxvUaOW0VbO7qqqc3rOyIyIussXblliknCzsHDhd2F7L-6vqFFSqA/exec';

/* ═══════════════════════════════════════════════════════════════
   2. 진행 옵션
   ═══════════════════════════════════════════════════════════════ */

const OPTIONS = {
  /** 태스크 제한 시간(초). 넘으면 '못 찾겠어요'를 권유하는 안내가 뜹니다. 0 이면 제한 없음 */
  taskTimeLimit: 120,

  /**
   * 순서 카운터밸런싱.
   * true 로 두면 참가자마다 개선 전/후 순서를 번갈아 제시해 순서 효과(order effect)를 상쇄합니다.
   * 지금은 "개선 전 → 개선 후" 고정 순서 요청에 맞춰 꺼져 있습니다.
   */
  counterbalance: false,

  /** 결과 대시보드 비밀번호의 SHA-256 해시. 기본값: daangn-ut-2026 */
  resultPasscodeHash: '40158c8a7d8cc1dc813febefc53c0d0d9c3feb62944eb3849c28e414aa655ee0',
};

/* ═══════════════════════════════════════════════════════════════
   3. 태스크 — PRD 08. 검증 계획 / Phase 02 의 핵심 Task
   ═══════════════════════════════════════════════════════════════ */

/**
 * enabled: false 인 태스크는 진행에서 빠집니다.
 * PRD 기준 핵심 Task 는 5개지만, 1회 세션이 너무 길어지지 않도록 기본은 3개만 켜 두었습니다.
 *
 * successNodeIds: 해당 화면에 도달하면 '성공'으로 자동 판정할 Figma 노드 ID 목록입니다.
 *   비워 두면 참가자의 자기보고(찾았어요 / 못 찾겠어요)로만 판정합니다.
 *   파일럿 1회를 돌리면 대시보드의 '이동 경로'에 실제 노드 ID 가 찍히므로,
 *   그 값을 여기에 붙여 넣으면 그다음부터 자동 판정됩니다.
 *
 * axisLabel: 대시보드 차트 가로축에 쓰는 짧은 이름입니다.
 *   '작업 1' 같은 번호만 있으면 무슨 작업인지 한눈에 안 들어와서, 축에 내용까지 적습니다.
 *   한글 8자 안쪽으로 적어야 세 칸에 나란히 들어갑니다.
 */
const TASKS = [
  {
    id: 't1',
    enabled: true,
    title: '판매 중인 물건 확인하기',
    axisLabel: '판매 중인 물건',
    desc: '지금 판매 중인 물건이 몇 개인지 확인할 수 있는 화면까지 이동해 주세요.',
    successNodeIds: [],
  },
  {
    id: 't2',
    enabled: true,
    title: '구매한 물건의 거래 상태 확인하기',
    axisLabel: '구매 거래 상태',
    desc: '최근에 구매한 물건이 어떤 상태인지 확인할 수 있는 화면까지 이동해 주세요.',
    successNodeIds: [],
  },
  {
    id: 't3',
    enabled: true,
    title: '관심 목록 다시 찾기',
    axisLabel: '관심 목록',
    desc: '예전에 하트를 눌러 둔 물건들을 모아 볼 수 있는 화면까지 이동해 주세요.',
    successNodeIds: [],
  },
  {
    id: 't4',
    enabled: false,
    title: '참여 중인 커뮤니티 확인하기',
    axisLabel: '참여 커뮤니티',
    desc: '내가 참여하고 있는 모임이나 동네생활 활동을 확인할 수 있는 화면까지 이동해 주세요.',
    successNodeIds: [],
  },
  {
    id: 't5',
    enabled: false,
    title: '나의 활동 확인하기',
    axisLabel: '나의 활동',
    desc: '내가 당근에서 남긴 글과 활동을 모아 볼 수 있는 화면까지 이동해 주세요.',
    successNodeIds: [],
  },
];

/* ═══════════════════════════════════════════════════════════════
   4. 문항 텍스트
   ═══════════════════════════════════════════════════════════════ */

/**
 * 태스크 직후 난이도 — SEQ(Single Ease Question) 7점.
 * 별도 화면으로 빼지 않고 작업 카드 안에서 바로 묻습니다.
 * 작업이 끝난 직후가 가장 정확하고, 블록 수도 절반으로 줄어듭니다.
 */
const SEQ = {
  title: '방금 수행한 작업은 얼마나 쉬웠나요?',
  min: 1,
  max: 7,
  minLabel: '매우 어려웠다',
  maxLabel: '매우 쉬웠다',
};

/**
 * SUS 10문항 — 홀수 긍정 / 짝수 부정 (표준 배열).
 * 어느 화면을 묻는지 헷갈리지 않도록 문장마다 "개선 후 화면" 을 그대로 씁니다.
 * 한 화면에 표로 묻기 때문에 10개를 10블록으로 쪼개지 않습니다.
 */
const SUS_ITEMS = [
  '개선 후 화면을 자주 사용하고 싶다.',
  '개선 후 화면은 불필요하게 복잡하다.',
  '개선 후 화면은 사용하기 쉬웠다.',
  '개선 후 화면을 쓰려면 누군가의 도움이 필요할 것 같다.',
  '개선 후 화면의 기능들이 서로 잘 연결되어 있다.',
  '개선 후 화면에는 앞뒤가 맞지 않는 부분이 많다.',
  '대부분의 사람이 개선 후 화면을 금방 익힐 수 있을 것 같다.',
  '개선 후 화면은 쓰기에 번거롭다.',
  '개선 후 화면을 쓰는 동안 헤매지 않고 자신 있게 움직였다.',
  '개선 후 화면을 쓰기 전에 익혀야 할 것이 많을 것 같다.',
];

const SUS_SCALE = { min: 1, max: 5, minLabel: '전혀 그렇지 않다', maxLabel: '매우 그렇다' };

/* ═══════════════════════════════════════════════════════════════
   5. 진행 순서(블록) 조립 — 총 20블록
   ═══════════════════════════════════════════════════════════════

   10~15분 안에 끝나도록 20블록으로 맞췄습니다. 줄이면서 한 일:

   · 작업 직후 난이도(SEQ)를 별도 화면에서 작업 카드 안으로 넣었습니다 (−6블록)
   · SUS 10문항을 한 화면의 표로 묶었습니다 (−10블록)
   · 구간 시작 안내는 남기되, SUS 안내 화면은 표 위 설명으로 합쳤습니다 (−1블록)
   · '당근에서 주로 무엇을 하시나요'(주 사용 목적)는 뺐습니다 (−1블록)
     참가자 세분화가 필요하면 아래 participant 블록 뒤에 다시 넣으면 됩니다.

   측정 항목은 그대로입니다. 태스크 성공률 · 소요시간 · SEQ · 정보 탐색 용이성 ·
   선호도 · 재방문 의향 · SUS 모두 전과 같은 키로 저장됩니다.
   ═══════════════════════════════════════════════════════════════ */

const activeTasks = () => TASKS.filter((t) => t.enabled);

/** 한쪽 프로토타입(개선 전 또는 개선 후) 구간을 만듭니다. */
function buildArm(arm) {
  const isAsis = arm === 'asis';
  const label = isAsis ? '개선 전' : '개선 후';
  // 화면 위에 붙는 딱지. 구간을 알려 주는 최소한만 남깁니다.
  const eyebrow = isAsis ? 'AS-IS' : 'TO-BE';
  const tasks = activeTasks();

  const blocks = [
    {
      id: `${arm}-intro`,
      type: 'intro',
      arm,
      railLabel: `${label} 시작`,
      eyebrow,
      title: `${label} 화면으로 작업을 해볼게요`,
      desc:
        '오른쪽에 화면이 준비되어 있어요. 지금 눌러 보셔도 되고, 준비되면 시작해 주세요.\n' +
        '정답을 맞히는 시험이 아니라 화면을 평가하는 자리예요. 헤매셔도 괜찮습니다.',
      cta: '첫 번째 작업 시작',
    },
  ];

  tasks.forEach((task, i) => {
    blocks.push({
      id: `${arm}-${task.id}`,
      type: 'task',
      arm,
      required: true, // 작업 수행 + 난이도 응답이 모두 있어야 넘어갑니다
      task,
      index: i + 1,
      total: tasks.length,
      railLabel: task.title,
      eyebrow,
      title: task.title,
      desc: task.desc,
      // 작업을 마치면 같은 카드 안에서 바로 난이도를 묻습니다.
      seq: { key: `${arm}-${task.id}-seq`, ...SEQ },
    });
  });

  blocks.push({
    id: `${arm}-findability`,
    type: 'scale',
    arm,
    required: true,
    railLabel: '정보 찾기 쉬움',
    eyebrow,
    title: `${label} 화면에서 원하는 정보를 찾기가 얼마나 쉬웠나요?`,
    scale: { min: 1, max: 5, minLabel: '매우 어려웠다', maxLabel: '매우 쉬웠다' },
  });

  blocks.push({
    id: `${arm}-open`,
    type: 'open',
    arm,
    required: false,
    railLabel: isAsis ? '불편했던 점' : '좋았던 점',
    eyebrow,
    title: isAsis
      ? `${label} 화면에서 불편하거나 헷갈렸던 점을 알려 주세요.`
      : `${label} 화면에서 좋았던 점이나 여전히 아쉬운 점을 알려 주세요.`,
    desc: '떠오르는 대로 편하게 적어 주세요. 한 줄이어도 괜찮아요.',
    placeholder: isAsis ? '예) 관심목록이 어디 있는지 한참 찾았어요' : '예) 판매·구매가 한 곳에 모여 있어 편했어요',
  });

  return blocks;
}

/** 전체 진행 순서 */
function buildFlow({ tobeFirst = false } = {}) {
  const arms = tobeFirst ? ['tobe', 'asis'] : ['asis', 'tobe'];

  return [
    {
      id: 'welcome',
      type: 'intro',
      arm: null,
      railLabel: '시작 안내',
      title: '나의 당근 화면, 같이 살펴봐 주세요',
      // **…** 로 감싼 부분은 굵게 표시됩니다 (survey.js 의 paragraphs 참고).
      desc:
        '이번 테스트에서는 **채팅** 탭과 **나의 당근** 탭의 사용성만 확인합니다.\n' +
        '기존 화면과 개선 후 화면을 차례로 써 보시고, 느낀 점을 알려주세요.\n' +
        '**몇 가지 Task**와 함께 작업마다 짧은 질문을 드려요. 테스트는 약 10분~15분 정도 걸립니다.\n' +
        '평가 대상은 참여자분이 아니라 화면입니다.\n' +
        '막히는 지점이 있다면 그게 가장 중요한 정보예요.',
      cta: '시작하기',
    },
    {
      id: 'participant',
      type: 'single',
      arm: null,
      required: true,
      railLabel: '당근 사용 빈도',
      title: '당근을 얼마나 자주 쓰시나요?',
      options: [
        { value: 'daily', label: '거의 매일' },
        { value: 'weekly', label: '일주일에 몇 번' },
        { value: 'monthly', label: '한 달에 몇 번' },
        { value: 'rarely', label: '그보다 드물게' },
      ],
    },

    ...buildArm(arms[0]),
    ...buildArm(arms[1]),

    {
      id: 'compare-pref',
      type: 'compare',
      arm: null,
      required: true,
      railLabel: '선호하는 화면',
      title: '두 화면 중 어느 쪽이 더 쓰기 편했나요?',
      options: [
        { value: 'asis', variant: 'asis', badge: '개선 전', label: '첫 번째 화면', desc: '처음에 보신 화면' },
        { value: 'tobe', variant: 'tobe', badge: '개선 후', label: '두 번째 화면', desc: '나중에 보신 화면' },
      ],
    },
    {
      id: 'compare-why',
      type: 'open',
      arm: null,
      required: true,
      railLabel: '선택한 이유',
      title: '그렇게 고른 이유를 알려 주세요.',
      placeholder: '예) 판매·구매·관심이 한 화면에 있어서 덜 헤맸어요',
    },
    {
      id: 'revisit',
      type: 'scale',
      arm: null,
      required: true,
      railLabel: '재방문 의향',
      title: '개선된 화면이라면, 거래를 확인한 뒤에도 당근을 더 둘러보게 될 것 같나요?',
      scale: { min: 1, max: 5, minLabel: '전혀 아니다', maxLabel: '매우 그렇다' },
    },
    {
      id: 'improve-area',
      type: 'multi',
      arm: null,
      required: false,
      railLabel: '더 개선할 영역',
      title: '개선안에서 아직 더 손봐야 할 것 같은 부분이 있다면 골라 주세요.',
      options: [
        { value: 'transaction', label: '판매·구매·관심 등 거래 영역' },
        { value: 'activity', label: '나의 활동 요약' },
        { value: 'service', label: '지역생활 서비스 진입' },
        { value: 'community', label: '커뮤니티 진입' },
        { value: 'settings', label: '설정·고객지원' },
        { value: 'none', label: '특별히 없음' },
      ],
    },

    {
      id: 'sus',
      type: 'matrix',
      arm: null,
      required: true,
      railLabel: 'SUS 10문항',
      eyebrow: 'TO-BE',
      // 진행 구간은 '비교·마무리'로 두되, 오른쪽에는 묻는 대상인 개선 후 화면을 띄웁니다.
      showArm: 'tobe',
      title: '개선 후 화면에 대해 얼마나 그렇다고 느끼시나요?',
      desc:
        '오른쪽에 개선 후 화면을 다시 띄워 두었어요. 직접 보면서 답해 주세요.\n' +
        '깊게 고민하지 마시고 첫 느낌대로 골라 주세요. 비슷해 보이는 문장이 반복되지만 의도된 구성입니다.',
      scale: SUS_SCALE,
      // 응답은 sus-1 … sus-10 키로 저장됩니다. 대시보드 SUS 점수 계산이 그대로 동작합니다.
      items: SUS_ITEMS.map((text, i) => ({ key: 'sus-' + (i + 1), text })),
    },

    {
      id: 'outro',
      type: 'outro',
      arm: null,
      railLabel: '완료',
      title: '끝났습니다. 도와주셔서 고맙습니다',
      // 저장 여부는 아래 상태 박스가 실제 결과를 보고 알려 줍니다. 여기서 미리 단정하지 않습니다.
      desc: '진행자에게 화면을 넘겨 주세요.',
    },
  ];
}
