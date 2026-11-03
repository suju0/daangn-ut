/**
 * UT 진행 엔진
 *
 * 왼쪽 레일(블록 목록) · 가운데 설문 · 오른쪽 프로토타입 3단 구성으로 렌더링하고,
 * 태스크마다 소요시간과 성공 여부를 기록합니다.
 * 탭 수 · 미스클릭 · 이동 경로는 Figma 임베드가 이벤트를 보내 줄 때만 함께 기록되고,
 * 오지 않으면 화면에 '측정되지 않음'으로 표시합니다 (proto.js 주석 참고).
 */
const Survey = (() => {
  const SECTION_LABEL = {
    intro: '시작',
    asis: '개선 전',
    tobe: '개선 후',
    compare: '비교',
    sus: 'SUS',
    outro: '완료',
  };

  let flow = [];
  let index = 0;
  let record = null;
  let root = null;
  let timerId = null;
  let serverDown = false;
  /** 'survey' | 'dash' — 같은 페이지 안에서 진행 화면과 결과 대시보드를 오갑니다. */
  let view = 'survey';

  /* ── 유틸 ─────────────────────────────────────────────────── */

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /**
   * **굵게** 표기만 강조로 바꿉니다.
   * 이스케이프가 끝난 문자열에만 적용하므로, 본문에서 새로운 태그가 생길 수 없습니다.
   */
  const emphasize = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  /** 줄바꿈을 살려 문단으로 만듭니다. */
  const paragraphs = (s) =>
    String(s ?? '')
      .split('\n')
      .map((line) => (line.trim() === '' ? '<br>' : emphasize(esc(line))))
      .join('<br>');

  /**
   * 오른쪽에 띄울 프로토타입.
   * 보통은 그 문항이 속한 구간(arm)이지만, SUS 처럼 구간은 '비교·마무리'면서
   * 묻는 대상은 개선 후 화면인 문항은 showArm 으로 따로 지정합니다.
   */
  const armOf = (block) => (block && (block.showArm || block.arm)) || null;

  /**
   * 구간 색.
   * 개선 전(AS-IS)은 그레이톤, 개선 후(TO-BE)는 당근 주황으로 통일합니다.
   * 딱지 · 상단 단계 표시 · 비교 카드가 모두 이 규칙을 따릅니다.
   */
  const armTone = (arm) => (arm === 'tobe' ? 'brand' : 'neutral');

  function sectionOf(block) {
    if (block.arm === 'asis') return 'asis';
    if (block.arm === 'tobe') return 'tobe';
    if (block.id === 'outro') return 'outro';
    if (block.id.startsWith('sus')) return 'sus';
    if (block.id.startsWith('compare') || block.id === 'revisit' || block.id === 'improve-area') return 'compare';
    return 'intro';
  }

  function fmtClock(ms) {
    const total = Math.floor(ms / 1000);
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }

  /* ── 상태 ─────────────────────────────────────────────────── */

  function answerOf(block) {
    return record.answers[block.id];
  }

  function setAnswer(block, value) {
    record.answers[block.id] = value;
    Store.draft.set(record);
  }

  function isAnswered(block) {
    const v = answerOf(block);
    // 작업은 수행 기록과 난이도(SEQ) 응답이 모두 있어야 끝난 것으로 봅니다.
    if (block.type === 'task') return !!record.tasks[block.id] && typeof record.answers[block.seq.key] === 'number';
    if (block.type === 'matrix') return block.items.every((it) => typeof record.answers[it.key] === 'number');
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'string') return v.trim().length > 0;
    return v !== undefined && v !== null;
  }

  function canAdvance(block) {
    if (block.type === 'intro' || block.type === 'outro') return true;
    if (block.type === 'task' || block.type === 'matrix') return isAnswered(block);
    return block.required ? isAnswered(block) : true;
  }

  /* ── 렌더 ─────────────────────────────────────────────────── */

  /**
   * 셸은 한 번만 만듭니다.
   * 프로토타입 iframe 이 매번 다시 그려지면 Figma 를 계속 새로 불러오게 되고,
   * 참가자가 보던 화면 위치도 날아가기 때문입니다.
   */
  function mountShell() {
    root.innerHTML =
      '<div class="app">' +
      '<header class="topbar" id="topbar"></header>' +
      '<div class="workspace">' +
      '<nav class="rail" id="rail" aria-label="진행 단계"></nav>' +
      '<main class="survey" id="surveyPane"><div class="survey__inner" id="surveyInner"></div></main>' +
      '<aside class="proto">' +
      '<div class="proto__head" id="protoHead"></div>' +
      '<div class="proto__stage" id="protoStage">' +
      '<div class="device" id="deviceEmpty" hidden><div class="device__empty">' +
      '<span class="t4-medium">이 문항에는 화면이 없습니다</span>' +
      '</div></div>' +
      '</div>' +
      '<div class="proto__foot" id="protoFoot"></div>' +
      '</aside></div>' +
      // 진행 화면 안에서 바로 결과를 볼 수 있는 자리. 잠금을 푼 탭에서만 열립니다.
      '<div class="dash-panel" id="dashPanel" hidden></div>' +
      '</div>';

    // 개선 전/후 두 벌을 지금 동시에 불러 둡니다. 참가자가 안내를 읽는 동안 로딩이 끝납니다.
    Proto.init(root.querySelector('#protoStage'), { asis: PROTO_ASIS, tobe: PROTO_TOBE });
    Proto.on('ready', (arm) => {
      const block = flow[index];
      if (!block) return;
      // 준비를 기다리던 작업이었다면 화면을 다시 그려 측정을 시작합니다.
      if (block.type === 'task' && block.arm === arm && !record.tasks[block.id]) {
        render();
        return;
      }
      const foot = root.querySelector('#protoFoot');
      if (foot) foot.innerHTML = renderProtoFoot(block);
    });
  }

  /** 직전에 그린 문항. 같은 문항을 다시 그릴 때 스크롤을 지킬지 판단합니다. */
  let renderedId = null;

  function render() {
    const block = flow[index];
    if (!root.querySelector('#surveyInner')) mountShell();
    // 문항이 그대로면 보던 위치를 지킵니다. 문항이 바뀔 때만 맨 위에서 시작합니다.
    const pane = root.querySelector('#surveyPane');
    const keepScroll = renderedId === block.id ? pane.scrollTop : 0;

    root.querySelector('#topbar').innerHTML = renderTopbar(block);
    root.querySelector('#rail').innerHTML = renderRail();
    root.querySelector('#surveyInner').innerHTML = renderBlock(block);
    root.querySelector('#protoHead').innerHTML = renderProtoHead(block);
    root.querySelector('#protoFoot').innerHTML = renderProtoFoot(block);

    // 프로토타입을 먼저 붙여야 태스크 시작 시 올바른 화면을 다시 불러옵니다.
    bindProto(block);
    bindBlock(block);
    bindTopbar();
    bindRail();

    const current = root.querySelector('.rail__item[data-state="current"]');
    if (current) current.scrollIntoView({ block: 'nearest' });
    pane.scrollTop = keepScroll;
    renderedId = block.id;
  }

  function renderTopbar(block) {
    // SUS · 완료는 상단 단계 표시에서 '비교 · 마무리'에 포함됩니다.
    const stageOf = (s) => (s === 'sus' || s === 'outro' ? 'compare' : s);
    const order = ['intro', record.order[0], record.order[1], 'compare'];
    const pos = order.indexOf(stageOf(sectionOf(block)));

    const stages = [record.order[0], record.order[1], 'compare'].map((key) => {
      const at = order.indexOf(key);
      const state = pos > at ? 'done' : pos === at ? 'active' : 'todo';
      const label = key === 'compare' ? '비교 · 마무리' : SECTION_LABEL[key];
      return (
        '<span class="stage-pill" data-state="' + state + '" data-arm="' + key + '">' +
        '<span class="stage-pill__dot"></span>' + esc(label) + '</span>'
      );
    });
    const done = flow.filter((b, i) => i < index).length;
    const pct = Math.round((done / (flow.length - 1)) * 100);

    return (
      '<div class="topbar__brand">' +
      '<img class="topbar__logo" src="assets/daangn-logo.svg" alt="당근" width="17" height="28">' +
      '<span class="topbar__title">' +
      '<b class="t4-bold">당근 앱 리디자인</b>' +
      '<span class="t2-regular">프로토타입 사용성 테스트</span>' +
      '</span></div>' +
      '<div class="topbar__stage">' +
      stages.join('<span class="stage-arrow" aria-hidden="true">' + SeedIcon.svg('chevronRight', 12) + '</span>') +
      '</div>' +
      '<span class="topbar__spacer"></span>' +
      // 서버가 꺼진 채로 세션을 시작하면 끝나고 나서야 알게 됩니다. 시작 전에 보이게 둡니다.
      (serverDown
        ? '<span class="seed-chip" data-tone="critical" title="터미널에서 node .claude/ut-server.js 를 실행하고 http://localhost:8790/ 으로 여세요.">' +
          '응답 수집 서버 꺼짐</span>'
        : '') +
      renderViewSwitch() +
      '<div class="topbar__progress">' +
      '<div class="progress-track"><div class="progress-range" style="width:' + pct + '%"></div></div>' +
      '<span class="topbar__count t3-medium">' + (index + 1) + ' / ' + flow.length + '</span>' +
      '</div>'
    );
  }

  /**
   * 진행 ↔ 결과 전환.
   * 항상 보입니다. 결과를 눌러도 비밀번호를 통과해야 응답이 보이므로,
   * 참가자가 눌러도 남의 응답이 노출되지 않습니다.
   */
  function renderViewSwitch() {
    return (
      '<div class="seed-segmented-control view-switch" role="tablist">' +
      '<button type="button" class="seed-segmented-control__item" role="tab" data-view="survey" aria-selected="' +
      (view === 'survey') + '">진행</button>' +
      '<button type="button" class="seed-segmented-control__item" role="tab" data-view="dash" aria-selected="' +
      (view === 'dash') + '">' + SeedIcon.svg('chart', 13) + '결과</button>' +
      '</div>'
    );
  }

  /** 진행 화면과 결과 대시보드를 오갑니다. 설문 상태와 프로토타입 로딩은 그대로 남습니다. */
  function setView(next) {
    view = next;
    const workspace = root.querySelector('.workspace');
    const panel = root.querySelector('#dashPanel');
    workspace.hidden = next === 'dash';
    panel.hidden = next !== 'dash';
    if (next === 'dash') Dashboard.start(panel);
    root.querySelector('#topbar').innerHTML = renderTopbar(flow[index]);
    bindTopbar();
  }

  function bindTopbar() {
    root.querySelectorAll('.view-switch [data-view]').forEach((btn) => {
      btn.addEventListener('click', () => setView(btn.dataset.view));
    });
  }

  /** 왼쪽 목록에서 지나온 문항을 눌러 되돌아갑니다. */
  function bindRail() {
    root.querySelectorAll('.rail__item[data-go]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const to = Number(btn.dataset.go);
        if (Number.isNaN(to) || to === index || to > record.maxIndex) return;
        // 측정 중이던 작업이 있으면 그대로 두고 나갑니다. 돌아오면 이어서 잽니다.
        clearInterval(timerId);
        index = to;
        Store.draft.set(record);
        render();
      });
    });
  }

  function renderRail() {
    const groups = [];
    flow.forEach((block, i) => {
      const section = sectionOf(block);
      const last = groups[groups.length - 1];
      if (!last || last.section !== section) groups.push({ section, items: [] });
      groups[groups.length - 1].items.push({ block, i });
    });

    const html = groups
      .map((g) => {
        const items = g.items
          .map(({ block, i }) => {
            const state = i === index ? 'current' : i < index ? 'done' : 'todo';
            const icon =
              state === 'done'
                ? SeedIcon.svg('checkmark', 12)
                : block.type === 'task'
                ? SeedIcon.svg('flag', 12)
                : SeedIcon.svg('chevronRight', 12);
            // 이미 지나온 문항은 눌러서 돌아갈 수 있습니다. 아직 안 본 문항은 잠가 둡니다.
            const reachable = i <= record.maxIndex;
            return (
              '<button type="button" class="rail__item" data-state="' + state + '" data-go="' + i + '"' +
              (reachable ? '' : ' disabled') + '>' +
              '<span class="rail__icon">' + icon + '</span>' +
              '<span class="rail__label">' +
              '<b class="t3-medium">' + esc(block.railLabel) + '</b>' +
              '<span class="t2-regular">' + esc(typeLabel(block.type)) + '</span>' +
              '</span></button>'
            );
          })
          .join('');
        return (
          '<div class="rail__group">' +
          '<div class="rail__group-title t2-bold">' + esc(SECTION_LABEL[g.section]) + '</div>' +
          items +
          '</div>'
        );
      })
      .join('');

    return html;
  }

  function typeLabel(type) {
    return {
      intro: '안내',
      single: '단일 선택',
      multi: '복수 선택',
      scale: '척도',
      open: '주관식',
      task: '프로토타입 작업',
      compare: '비교 선택',
      outro: '완료',
    }[type] || '';
  }

  /* ── 블록별 본문 ───────────────────────────────────────────── */

  function renderBlock(block) {
    const head =
      (block.eyebrow
        ? '<div class="q-eyebrow"><span class="seed-chip" data-tone="' + armTone(armOf(block)) + '">' +
          esc(block.eyebrow) + '</span></div>'
        : '') +
      // '필수'는 제목 오른쪽 끝에 붙습니다. 위쪽에 따로 한 줄을 차지하지 않습니다.
      '<div class="q-head"><h1 class="q-title t8-bold">' + esc(block.title) + '</h1>' +
      (block.required ? '<span class="q-required t2-bold">필수</span>' : '') + '</div>' +
      (block.desc ? '<p class="q-desc article-body">' + paragraphs(block.desc) + '</p>' : '');

    switch (block.type) {
      case 'intro':
        return (
          '<div class="pane-center">' + head +
          '<div class="q-footer"><button type="button" class="seed-action-button" data-variant="brandSolid" data-size="large" id="nextBtn">' +
          esc(block.cta || '다음') + '</button></div></div>'
        );

      case 'outro':
        return (
          '<div class="pane-center">' + head +
          '<div class="seed-callout" data-tone="neutral" id="saveState">' +
          '<span class="save-state__spinner" aria-hidden="true"></span>' +
          '<span class="t4-regular">응답을 저장하는 중…</span></div>' +
          '<div class="q-footer">' +
          '<button type="button" class="seed-action-button" data-variant="brandSolid" data-size="large" id="restartAllBtn">새 참가자 시작</button>' +
          '</div>' +
          '</div>'
        );

      case 'single':
      case 'multi':
        return head + renderChoices(block) + footer(block);

      case 'scale':
        return head + renderScale(block) + footer(block);

      case 'open':
        return (
          head +
          '<textarea class="seed-text-input" id="openInput" rows="5" placeholder="' +
          esc(block.placeholder || '') + '">' + esc(answerOf(block) || '') + '</textarea>' +
          footer(block)
        );

      case 'task':
        return head + renderTask(block);

      case 'compare':
        return head + renderCompare(block) + footer(block);

      case 'matrix':
        return head + renderMatrix(block) + footer(block);

      default:
        return head + footer(block);
    }
  }

  function footer(block) {
    const ok = canAdvance(block);
    return (
      '<div class="q-footer">' +
      '<button type="button" class="seed-action-button" data-variant="brandSolid" data-size="large" id="nextBtn"' +
      (ok ? '' : ' disabled') + '>다음</button>' +
      (block.required ? '' : '<span class="q-hint t3-regular">답하지 않고 넘어가도 됩니다</span>') +
      '</div>'
    );
  }

  function renderChoices(block) {
    const value = answerOf(block);
    const multi = block.type === 'multi';
    const items = block.options
      .map((opt) => {
        const selected = multi ? Array.isArray(value) && value.includes(opt.value) : value === opt.value;
        return (
          '<button type="button" class="seed-select-box" data-value="' + esc(opt.value) + '" ' +
          'role="checkbox" aria-checked="' + selected + '">' +
          '<span class="seed-select-box__trigger">' +
          '<span class="seed-select-box__body">' +
          '<span class="seed-select-box__label">' + esc(opt.label) + '</span>' +
          (opt.desc ? '<span class="seed-select-box__description">' + esc(opt.desc) + '</span>' : '') +
          '</span>' +
          '<span class="seed-mark"' + (multi ? ' data-shape="square"' : '') + '>' + SeedIcon.svg('checkmark', 12) + '</span>' +
          '</span></button>'
        );
      })
      .join('');
    return '<div class="q-options" id="choices" role="group">' + items + '</div>';
  }

  function renderScale(block) {
    const s = block.scale;
    const value = answerOf(block);
    const buttons = [];
    for (let n = s.min; n <= s.max; n += 1) {
      buttons.push(
        '<button type="button" class="scale__btn" data-value="' + n + '" aria-pressed="' + (value === n) + '">' + n + '</button>'
      );
    }
    return (
      '<div class="scale" id="scale">' +
      '<div class="scale__row">' + buttons.join('') + '</div>' +
      '<div class="scale__legend t3-regular"><span>' + esc(s.minLabel) + '</span><span>' + esc(s.maxLabel) + '</span></div>' +
      '</div>'
    );
  }

  function renderCompare(block) {
    const value = answerOf(block);
    const cards = block.options
      .map((opt) => {
        // 카운터밸런싱으로 순서가 바뀌면 '첫 번째/두 번째' 표현도 따라 바뀝니다.
        const orderLabel = record.order[0] === opt.value ? '먼저 보신 화면' : '나중에 보신 화면';
        return (
          '<button type="button" class="compare__card" data-variant="' + esc(opt.variant) + '" ' +
          'data-value="' + esc(opt.value) + '" aria-pressed="' + (value === opt.value) + '">' +
          '<span class="compare__badge">' + esc(opt.badge) + '</span>' +
          '<span class="t5-bold" style="display:block">' + esc(opt.label) + '</span>' +
          '<p class="t3-regular">' + esc(orderLabel) + '</p>' +
          '</button>'
        );
      })
      .join('');
    return '<div class="compare" id="compare">' + cards + '</div>';
  }

  function renderTask(block) {
    const saved = record.tasks[block.id];
    const live = saved || { taps: null, deadTaps: null, durationMs: 0 };
    const tracked = saved ? saved.tracked : Proto.hasEvents();

    // 프로토타입이 아직 안 떴다면 기다립니다.
    // 로딩 시간이 소요시간에 섞이면 태스크 측정이 오염됩니다.
    if (!saved && !Proto.isReady(block.arm)) {
      return (
        '<div class="task-card task-card--waiting">' +
        '<span class="save-state__spinner" aria-hidden="true"></span>' +
        '<div><p class="t5-medium" style="margin:0 0 4px">화면을 준비하고 있어요</p>' +
        '<p class="t3-regular" style="margin:0;color:var(--seed-color-fg-neutral-subtle)">' +
        '준비가 끝나면 바로 시작됩니다. 잠시만 기다려 주세요.</p></div>' +
        '</div>'
      );
    }

    return (
      '<div class="task-card">' +
      '<div class="task-card__head">' +
      '<span class="t4-medium" style="color:var(--seed-color-fg-neutral-subtle)">진행 시간</span>' +
      '<span class="task-timer t4-medium" id="taskTimer">' + fmtClock(live.durationMs) + '</span>' +
      '</div>' +
      '<div class="task-actions">' +
      (saved
        ? '<div class="seed-callout" data-tone="' + (saved.selfReport === 'success' ? 'positive' : 'warning') + '">' +
          '<span>' + SeedIcon.svg(saved.selfReport === 'success' ? 'checkmark' : 'alert', 18) + '</span>' +
          '<span class="t4-regular">' + (saved.selfReport === 'success' ? '찾았다고 응답했습니다.' : '못 찾겠다고 응답했습니다.') + '</span></div>'
        : '<button type="button" class="seed-action-button" data-variant="neutralSolid" data-size="large" id="taskDone">찾았어요</button>' +
          '<button type="button" class="seed-action-button" data-variant="neutralOutline" data-size="medium" id="taskGiveup">못 찾겠어요</button>') +
      '</div>' +
      '<div class="task-meta t3-regular" id="taskMeta"' + (tracked ? '' : ' hidden') + '>' +
      '<span>탭 <b id="metaTaps">' + (live.taps ?? 0) + '</b>회</span>' +
      '<span>반응 없는 곳 <b id="metaDead">' + (live.deadTaps ?? 0) + '</b>회</span>' +
      '</div>' +
      (tracked
        ? ''
        : '<div class="task-meta t3-regular" id="taskMetaOff">' +
          '<span>소요시간과 성공 여부만 기록됩니다. Figma 임베드가 탭 이벤트를 보내지 않아 탭·미스클릭은 집계되지 않습니다.</span>' +
          '</div>') +
      '<p class="q-hint t3-regular" id="taskHint" style="margin:12px 0 0"></p>' +
      '</div>' +
      // 작업이 끝나면 같은 화면에서 바로 난이도를 묻습니다. 기억이 가장 선명한 시점입니다.
      (saved ? renderSeq(block) + footer(block) : '')
    );
  }

  /** 작업 카드 아래에 붙는 SEQ 척도 */
  function renderSeq(block) {
    const s = block.seq;
    const value = record.answers[s.key];
    const buttons = [];
    for (let n = s.min; n <= s.max; n += 1) {
      buttons.push(
        '<button type="button" class="scale__btn" data-value="' + n + '" aria-pressed="' + (value === n) + '">' + n + '</button>'
      );
    }
    return (
      '<div class="task-seq">' +
      '<div class="q-head"><h2 class="q-title t6-bold">' + esc(s.title) + '</h2>' +
      '<span class="q-required t2-bold">필수</span></div>' +
      '<div class="scale" id="seq">' +
      '<div class="scale__row">' + buttons.join('') + '</div>' +
      '<div class="scale__legend t3-regular"><span>' + esc(s.minLabel) + '</span><span>' + esc(s.maxLabel) + '</span></div>' +
      '</div></div>'
    );
  }

  /**
   * 표 형식 문항 — 문장 여러 개를 같은 척도로 한 번에 묻습니다.
   * SUS 10문항을 화면 10개로 쪼개면 세션이 지나치게 길어집니다.
   */
  function renderMatrix(block) {
    const s = block.scale;
    const headCells = [];
    for (let n = s.min; n <= s.max; n += 1) headCells.push('<th class="t2-regular">' + n + '</th>');

    const rows = block.items
      .map((item, i) => {
        const value = record.answers[item.key];
        const cells = [];
        for (let n = s.min; n <= s.max; n += 1) {
          cells.push(
            '<td><button type="button" class="matrix__dot" data-key="' + esc(item.key) + '" data-value="' + n +
            '" role="radio" aria-checked="' + (value === n) + '" aria-label="' + esc(item.text + ' · ' + n + '점') + '"></button></td>'
          );
        }
        return (
          '<tr' + (typeof value === 'number' ? ' data-answered="true"' : '') + '>' +
          '<th scope="row" class="matrix__stmt t3-regular"><span class="matrix__no t2-regular">' + (i + 1) + '</span>' +
          esc(item.text) + '</th>' + cells.join('') + '</tr>'
        );
      })
      .join('');

    const answered = block.items.filter((it) => typeof record.answers[it.key] === 'number').length;

    return (
      '<div class="matrix" id="matrix">' +
      '<div class="matrix__legend t2-regular">' +
      '<span>' + esc(s.minLabel) + '</span><span>' + esc(s.maxLabel) + '</span></div>' +
      '<table class="matrix__table"><thead><tr><th></th>' + headCells.join('') + '</tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      '<p class="matrix__progress t3-regular" id="matrixProgress">' + answered + ' / ' + block.items.length + ' 문항 응답</p>' +
      '</div>'
    );
  }

  /**
   * SUS 표에서 한 칸을 눌렀을 때, 그 줄과 응답 수·다음 버튼만 제자리에서 고칩니다.
   * 표를 다시 그리지 않으므로 스크롤 위치도 그대로 남습니다.
   */
  function updateMatrixRow(block, key) {
    const value = record.answers[key];
    root.querySelectorAll('#matrix .matrix__dot[data-key="' + CSS.escape(key) + '"]').forEach((dot) => {
      const on = Number(dot.dataset.value) === value;
      dot.setAttribute('aria-checked', String(on));
      const row = dot.closest('tr');
      if (row) row.dataset.answered = 'true';
    });

    const answered = block.items.filter((it) => typeof record.answers[it.key] === 'number').length;
    const progress = root.querySelector('#matrixProgress');
    if (progress) progress.textContent = answered + ' / ' + block.items.length + ' 문항 응답';

    const next = root.querySelector('#nextBtn');
    if (next) next.disabled = !canAdvance(block);
  }

  function renderProtoHead(block) {
    const arm = armOf(block);
    const label = arm === 'asis' ? 'AS-IS' : arm === 'tobe' ? 'TO-BE' : '프로토타입';
    const placeholderNote =
      arm === 'asis' && ASIS_IS_PLACEHOLDER
        ? '<span class="seed-chip" data-tone="critical">AS-IS 미연결</span>'
        : '';
    return (
      '<span class="seed-chip" data-tone="' + armTone(arm) + '">' + esc(label) + '</span>' +
      placeholderNote +
      '<span class="proto__head-title"></span>'
    );
  }

  /**
   * 프로토타입은 어느 화면에서든 그대로 눌러 볼 수 있습니다.
   * '처음 화면으로' 는 항상 열어 둡니다 — 참가자가 엉뚱한 곳에서 멈췄을 때
   * 진행자가 언제든 되돌릴 수 있어야 하기 때문입니다.
   */
  function renderProtoFoot(block) {
    const arm = armOf(block);
    if (!arm) return '<span class="q-hint t2-regular">&nbsp;</span>';
    return (
      '<button type="button" class="seed-action-button" data-variant="neutralWeak" data-size="small" id="protoRestart">' +
      SeedIcon.svg('restart', 14) + '처음 화면으로</button>' +
      '<span class="proto__foot-spacer"></span>' +
      '<span class="q-hint t2-regular">' +
      (Proto.isReady(arm) ? '화면을 직접 눌러 가며 사용해 보세요' : '화면을 준비하고 있어요') +
      '</span>'
    );
  }

  /* ── 이벤트 ────────────────────────────────────────────────── */

  function bindBlock(block) {
    const next = root.querySelector('#nextBtn');
    if (next) next.addEventListener('click', goNext);

    if (block.type === 'single' || block.type === 'multi') {
      root.querySelectorAll('#choices .seed-select-box').forEach((btn) => {
        btn.addEventListener('click', () => {
          const v = btn.dataset.value;
          if (block.type === 'single') {
            setAnswer(block, v);
          } else {
            const cur = Array.isArray(answerOf(block)) ? answerOf(block).slice() : [];
            const at = cur.indexOf(v);
            if (at >= 0) cur.splice(at, 1);
            else cur.push(v);
            setAnswer(block, cur);
          }
          render();
        });
      });
    }

    if (block.type === 'scale') {
      root.querySelectorAll('#scale .scale__btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          setAnswer(block, Number(btn.dataset.value));
          render();
        });
      });
    }

    if (block.type === 'compare') {
      root.querySelectorAll('#compare .compare__card').forEach((btn) => {
        btn.addEventListener('click', () => {
          setAnswer(block, btn.dataset.value);
          render();
        });
      });
    }

    if (block.type === 'open') {
      const input = root.querySelector('#openInput');
      input.addEventListener('input', () => {
        record.answers[block.id] = input.value;
        Store.draft.set(record);
        const btn = root.querySelector('#nextBtn');
        if (btn) btn.disabled = !canAdvance(block);
      });
    }

    if (block.type === 'matrix') {
      root.querySelectorAll('#matrix .matrix__dot').forEach((btn) => {
        btn.addEventListener('click', () => {
          record.answers[btn.dataset.key] = Number(btn.dataset.value);
          Store.draft.set(record);
          // 표 전체를 다시 그리면 10문항을 오가는 동안 화면이 계속 흔들립니다.
          // 누른 줄과 응답 수, 다음 버튼만 제자리에서 고칩니다.
          updateMatrixRow(block, btn.dataset.key);
        });
      });
    }

    if (block.type === 'task') {
      startTask(block);
      // 작업을 마친 뒤 나타나는 난이도 척도
      root.querySelectorAll('#seq .scale__btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          record.answers[block.seq.key] = Number(btn.dataset.value);
          Store.draft.set(record);
          render();
        });
      });
    }

    if (block.type === 'outro') {
      root.querySelector('#restartAllBtn').addEventListener('click', () => {
        if (confirm('새 참가자로 처음부터 시작할까요? 지금 응답은 이미 저장되어 있습니다.')) begin();
      });
    }
  }

  function bindProto(block) {
    const arm = armOf(block);
    root.querySelector('#deviceEmpty').hidden = !!arm;
    Proto.show(arm);
    if (!arm) return;

    // 여기서는 다시 부르지 않습니다. 화면을 옮길 때마다 되돌리면 그때마다 재로딩(약 6초)이 생깁니다.
    // 첫 화면으로 되돌리는 시점은 (1) 작업 직후 (2) 새 참가자 시작 (3) '처음 화면으로' 버튼, 세 가지입니다.
    const restart = root.querySelector('#protoRestart');
    if (restart) {
      restart.addEventListener('click', () => {
        const rec = Proto.peekRecording();
        if (rec) rec.restarts = (rec.restarts || 0) + 1;
        Proto.reset(arm);
      });
    }
  }

  /* ── 태스크 측정 ───────────────────────────────────────────── */

  function startTask(block) {
    if (record.tasks[block.id]) return; // 이미 끝난 태스크는 다시 측정하지 않습니다.
    // 아직 준비 중이면 'ready' 이벤트가 다시 render() 를 불러 여기로 돌아옵니다.
    if (!Proto.isReady(block.arm)) return;

    // 프로토타입은 앞 태스크가 끝난 직후 이미 첫 화면으로 되돌려 두었으므로
    // 여기서는 다시 부르지 않습니다. 바로 측정을 시작합니다.
    // 다만 render() 가 한 번 더 불렸을 때 시계가 0 으로 되돌아가면 안 되므로,
    // 이 작업의 측정이 이미 돌고 있으면 그대로 이어 씁니다. (아래 UI 연결은 매번 다시 합니다)
    const running = Proto.peekRecording();
    if (!running || running.blockId !== block.id) Proto.startRecording(block.id);

    const timerEl = root.querySelector('#taskTimer');
    const tapsEl = root.querySelector('#metaTaps');
    const deadEl = root.querySelector('#metaDead');
    const hintEl = root.querySelector('#taskHint');

    clearInterval(timerId);
    timerId = setInterval(() => {
      const rec = Proto.peekRecording();
      if (!rec || !timerEl.isConnected) return clearInterval(timerId);
      // 프로토타입이 다시 로딩되는 동안은 시계가 멈춰 있습니다(Proto.elapsed 가 그 시간을 빼 줍니다).
      const elapsed = Proto.elapsed();
      timerEl.textContent = fmtClock(elapsed);
      timerEl.dataset.paused = String(Proto.isClockPaused());
      // 이벤트가 뒤늦게 들어오기 시작하면 그때 카운터를 보여 줍니다.
      if (Proto.hasEvents()) {
        root.querySelector('#taskMeta').hidden = false;
        const off = root.querySelector('#taskMetaOff');
        if (off) off.hidden = true;
        tapsEl.textContent = rec.taps;
        deadEl.textContent = rec.deadTaps;
      }
      if (Proto.isClockPaused()) {
        hintEl.textContent = '화면을 다시 불러오는 중이에요. 이 시간은 기록되지 않습니다.';
      } else if (OPTIONS.taskTimeLimit && elapsed > OPTIONS.taskTimeLimit * 1000) {
        hintEl.textContent = '충분히 찾아보셨어요. 어렵다면 ‘못 찾겠어요’를 눌러도 괜찮습니다.';
      } else {
        hintEl.textContent = '';
      }
    }, 250);

    const finish = (selfReport) => {
      clearInterval(timerId);
      const result =
        Proto.stopRecording() || { durationMs: 0, path: [], taps: null, deadTaps: null, tracked: false };
      const auto = block.task.successNodeIds.length
        ? result.path.some((p) => block.task.successNodeIds.includes(p.nodeId))
        : null;
      record.tasks[block.id] = {
        arm: block.arm,
        taskId: block.task.id,
        title: block.task.title,
        selfReport,
        autoSuccess: auto,
        durationMs: result.durationMs,
        // 로딩으로 시계를 멈췄던 시간. durationMs 에는 이미 빠져 있고, 확인용으로만 남깁니다.
        loadingPausedMs: result.loadingPausedMs || 0,
        tracked: result.tracked,
        taps: result.taps,
        deadTaps: result.deadTaps,
        path: result.path,
      };
      Store.draft.set(record);
      // 여기서 되돌리지 않습니다.
      // 작업마다 되돌리면 그때마다 프로토타입을 다시 불러오게 되고, 미리 켜 둔 예비 프레임이
      // 아직 준비되기 전이면 그 로딩이 그대로 참가자에게 보입니다(작업 2 → 3 구간에서 확인).
      // 프로토타입을 불러오는 시점은 (1) 구간 시작 안내 화면 (2) 새 참가자 시작
      // (3) '처음 화면으로' 버튼, 세 가지뿐입니다.
      render();
    };

    const doneBtn = root.querySelector('#taskDone');
    const giveBtn = root.querySelector('#taskGiveup');
    if (doneBtn) doneBtn.addEventListener('click', () => finish('success'));
    if (giveBtn) giveBtn.addEventListener('click', () => finish('giveup'));
  }

  /* ── 진행 ─────────────────────────────────────────────────── */

  function goNext() {
    const block = flow[index];
    if (!canAdvance(block)) return;
    if (index >= flow.length - 1) return;

    index += 1;
    // 되돌아갔다 다시 앞으로 올 수 있도록, 가장 멀리 간 지점을 기억합니다.
    record.maxIndex = Math.max(record.maxIndex || 0, index);
    const entering = flow[index];
    Store.draft.set(record);
    render();
    // 저장 상태를 보여 줄 자리가 그려진 뒤에 전송합니다.
    if (entering.type === 'outro') complete();
  }

  /** 마지막 블록에 들어갈 때 응답을 확정하고 곧바로 대시보드로 보냅니다. */
  async function complete() {
    record.finishedAt = new Date().toISOString();
    Store.draft.clear();

    const result = await Store.commit(record);
    const box = root.querySelector('#saveState');
    if (!box) return;

    if (result.saved === 'server') {
      box.dataset.tone = 'positive';
      box.innerHTML =
        '<span>' + SeedIcon.svg('checkmark', 18) + '</span>' +
        '<span class="t4-regular">응답이 저장되었습니다.</span>';
    } else {
      box.dataset.tone = 'warning';
      box.innerHTML =
        '<span>' + SeedIcon.svg('alert', 18) + '</span>' +
        '<span class="t4-regular"><b>응답 수집 서버에 연결하지 못했습니다.</b><br>' +
        '이 브라우저에 저장해 두었다가 서버가 켜지면 자동으로 올립니다. ' +
        '진행자에게 알려 주세요.</span>';
    }
  }

  function begin() {
    const tobeFirst = OPTIONS.counterbalance ? Store.localCount() % 2 === 1 : false;
    flow = buildFlow({ tobeFirst });
    index = 0;
    record = {
      id: Store.newId(),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      order: tobeFirst ? ['tobe', 'asis'] : ['asis', 'tobe'],
      asisIsPlaceholder: ASIS_IS_PLACEHOLDER,
      answers: {},
      tasks: {},
      maxIndex: 0,
      meta: { ua: navigator.userAgent, viewport: window.innerWidth + '×' + window.innerHeight },
    };
    Store.draft.set(record);
    render();
    // 앞 참가자가 돌아다녀 둔 화면을 지우고 두 벌 모두 첫 화면으로 되돌립니다.
    Proto.reset('asis');
    Proto.reset('tobe');
  }

  /** 저장된 중간 응답을 이어서 진행합니다. */
  function resume(draft) {
    flow = buildFlow({ tobeFirst: draft.order[0] === 'tobe' });
    record = draft;
    // 마지막으로 답한 블록 다음부터 이어갑니다.
    let at = 0;
    flow.forEach((b, i) => {
      if (isAnswered(b)) at = i + 1;
    });
    index = Math.min(at, flow.length - 1);
    record.maxIndex = Math.max(record.maxIndex || 0, index);
    render();
  }

  function start(mount) {
    root = mount;

    // 응답 수집 서버 상태를 먼저 확인해 상단에 표시합니다.
    Store.ping().then((up) => {
      serverDown = !up;
      if (serverDown && flow.length) root.querySelector('#topbar').innerHTML = renderTopbar(flow[index]);
    });

    const draft = Store.draft.get();
    if (draft && draft.answers && Object.keys(draft.answers).length + Object.keys(draft.tasks || {}).length > 0) {
      if (confirm('진행하던 응답이 남아 있습니다. 이어서 진행할까요?\n취소를 누르면 새 참가자로 시작합니다.')) {
        resume(draft);
        return;
      }
      Store.draft.clear();
    }
    begin();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA') return;
    const next = root && root.querySelector('#nextBtn');
    if (next && !next.disabled) next.click();
  });

  return { start };
})();
