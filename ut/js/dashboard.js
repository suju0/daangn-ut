/**
 * 응답 대시보드 (#/result)
 *
 * 진행자만 보는 화면입니다. 비밀번호는 SHA-256 해시로만 저장되어 있고,
 * 통과하면 그 탭의 sessionStorage 에만 열림 상태가 남습니다.
 *
 * 응답은 서버(.claude/ut-server.js)에 쌓인 것과 이 브라우저에 남은 것을 합쳐서 보여 줍니다.
 */
const Dashboard = (() => {
  const UNLOCK_KEY = 'daangn-ut/unlocked';
  let root = null;

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /* ── 집계 ─────────────────────────────────────────────────── */

  const mean = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null);
  const fmt1 = (n) => (n === null ? '—' : n.toFixed(1));
  const fmtPct = (n) => (n === null ? '—' : Math.round(n * 100) + '%');

  const FMT = {
    rate: (v) => Math.round(v * 100) + '%',
    sec: (v) => (v / 1000).toFixed(1) + '초',
    score: (v) => v.toFixed(1),
    count: (v) => v.toFixed(1) + '회',
    people: (v) => Math.round(v) + '명',
  };

  function tasksOf(record) {
    const byTask = {};
    Object.values(record.tasks || {}).forEach((t) => {
      byTask[t.taskId] = byTask[t.taskId] || {};
      byTask[t.taskId][t.arm] = t;
    });
    return byTask;
  }

  function succeeded(t) {
    if (!t) return false;
    // successNodeIds 를 지정했다면 자동 판정을 우선합니다.
    return t.autoSuccess === null || t.autoSuccess === undefined ? t.selfReport === 'success' : t.autoSuccess;
  }

  function susScore(record) {
    const vals = [];
    for (let i = 1; i <= 10; i += 1) {
      const v = record.answers['sus-' + i];
      if (typeof v !== 'number') return null;
      vals.push(i % 2 === 1 ? v - 1 : 5 - v);
    }
    return vals.reduce((a, b) => a + b, 0) * 2.5;
  }

  function aggregate(rows) {
    const taskDefs = TASKS.filter((t) => t.enabled);

    const perTask = taskDefs.map((def, i) => {
      const cell = (arm) => {
        const ts = rows.map((r) => tasksOf(r)[def.id] && tasksOf(r)[def.id][arm]).filter(Boolean);
        const okTs = ts.filter(succeeded);
        return {
          n: ts.length,
          successRate: ts.length ? okTs.length / ts.length : null,
          // 소요시간은 성공한 시도만 평균냅니다. 포기한 시도를 섞으면 제한시간에 끌려갑니다.
          avgMs: okTs.length ? mean(okTs.map((t) => t.durationMs)) : null,
          // 탭·미스클릭은 Figma 임베드 이벤트가 실제로 들어온 시도만 집계합니다.
          avgDead: mean(ts.filter((t) => t.tracked).map((t) => t.deadTaps)),
          seq: mean(rows.map((r) => r.answers[`${arm}-${def.id}-seq`]).filter((v) => typeof v === 'number')),
        };
      };
      return { def, short: '작업 ' + (i + 1), asis: cell('asis'), tobe: cell('tobe') };
    });

    const armAll = (arm) => rows.flatMap((r) => Object.values(r.tasks || {}).filter((t) => t.arm === arm));
    const overall = (arm) => {
      const all = armAll(arm);
      const ok = all.filter(succeeded);
      return {
        successRate: all.length ? ok.length / all.length : null,
        avgMs: ok.length ? mean(ok.map((t) => t.durationMs)) : null,
      };
    };

    const prefs = rows.map((r) => r.answers['compare-pref']).filter(Boolean);
    const susValues = rows.map(susScore).filter((v) => v !== null);

    return {
      perTask,
      overall: { asis: overall('asis'), tobe: overall('tobe') },
      seqOverall: {
        asis: mean(perTask.map((t) => t.asis.seq).filter((v) => v !== null)),
        tobe: mean(perTask.map((t) => t.tobe.seq).filter((v) => v !== null)),
      },
      findability: {
        asis: mean(rows.map((r) => r.answers['asis-findability']).filter((v) => typeof v === 'number')),
        tobe: mean(rows.map((r) => r.answers['tobe-findability']).filter((v) => typeof v === 'number')),
      },
      preference: {
        asis: prefs.filter((p) => p === 'asis').length,
        tobe: prefs.filter((p) => p === 'tobe').length,
        n: prefs.length,
      },
      sus: mean(susValues),
      susN: susValues.length,
      revisit: mean(rows.map((r) => r.answers.revisit).filter((v) => typeof v === 'number')),
      tapsTracked: rows.some((r) => Object.values(r.tasks || {}).some((t) => t.tracked)),
    };
  }

  /* ── 차트 카드 ─────────────────────────────────────────────── */

  /**
   * Small Multiples 한 칸.
   * 지표 하나를 작은 카드로 만들고, 그 안에 작업별 개선 전/후 막대를 세웁니다.
   */
  function metricCard({ title, unit, points, format, barFormat, deltaFormat, betterWhen, max, gridLines, gridFormat }) {
    const usable = points.filter((p) => typeof p.asis === 'number' || typeof p.tobe === 'number');
    if (!usable.length) return '';

    return (
      '<div class="card card--metric">' +
      '<h3 class="metric__title t5-bold">' + esc(title) + '</h3>' +
      '<p class="metric__unit t2-regular">' + esc(unit) + '</p>' +
      Charts.groupedBars(points, { format, barFormat, deltaFormat, betterWhen, max, gridLines, gridFormat }) +
      '</div>'
    );
  }

  /* ── 화면 ─────────────────────────────────────────────────── */

  function renderLocked(message) {
    root.innerHTML =
      '<div class="lock"><div class="lock__box">' +
      '<span class="lock__icon">' + SeedIcon.svg('lock', 28) + '</span>' +
      '<h1 class="t7-bold">응답 결과</h1>' +
      '<p class="t4-regular">진행자 비밀번호를 입력해 주세요.</p>' +
      '<input type="password" class="seed-text-input" id="pass" autocomplete="off" placeholder="비밀번호">' +
      '<div class="lock__error t3-medium">' + esc(message || '') + '</div>' +
      '<div style="margin-top:16px">' +
      '<button type="button" class="seed-action-button" data-variant="brandSolid" data-size="large" id="unlock" style="width:100%">확인</button>' +
      '</div>' +
      '<div style="margin-top:12px">' +
      '<a class="t3-regular" href="#/" style="color:var(--seed-color-fg-neutral-subtle)">← 테스트 화면으로</a>' +
      '</div>' +
      '</div></div>';

    const input = root.querySelector('#pass');
    const submit = async () => {
      const hash = await sha256(input.value);
      if (hash === OPTIONS.resultPasscodeHash) {
        sessionStorage.setItem(UNLOCK_KEY, '1');
        // 서버에서 응답을 읽어 올 때 이 비밀번호를 헤더로 함께 보냅니다.
        Store.setAuth(input.value);
        renderResults();
      } else {
        renderLocked('비밀번호가 맞지 않습니다.');
      }
    };
    root.querySelector('#unlock').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    input.focus();
  }

  async function renderResults() {
    root.innerHTML = '<div class="dash"><div class="dash__inner"><div class="empty t4-regular">응답을 불러오는 중…</div></div></div>';

    const all = await Store.list();
    const done = all.filter((r) => r.finishedAt);
    const agg = aggregate(done);
    const state = Store.serverState();
    const online = state === 'online';

    root.innerHTML =
      '<div class="dash"><div class="dash__inner">' +
      '<header class="dash__head">' +
      '<div><h1 class="t9-bold">UT 응답 결과</h1>' +
      '<p class="t4-regular">당근 앱 리디자인 · 개선 전/후 비교</p></div>' +
      '<div class="dash__actions">' +
      '<span class="seed-chip" data-tone="' + (online ? 'positive' : 'critical') + '">' +
      (online ? '서버에 자동 저장 중' : '이 브라우저에만 저장됨') + '</span>' +
      '<button type="button" class="seed-action-button" data-variant="neutralOutline" data-size="small" id="refreshBtn">새로고침</button>' +
      '<button type="button" class="seed-action-button" data-variant="neutralOutline" data-size="small" id="importBtn">' +
      SeedIcon.svg('upload', 14) + '파일 불러오기</button>' +
      '<button type="button" class="seed-action-button" data-variant="neutralOutline" data-size="small" id="csvBtn">' +
      SeedIcon.svg('download', 14) + 'CSV</button>' +
      '<button type="button" class="seed-action-button" data-variant="neutralOutline" data-size="small" id="jsonBtn">' +
      SeedIcon.svg('download', 14) + 'JSON</button>' +
      '<button type="button" class="seed-action-button" data-variant="neutralOutline" data-size="small" id="resetBtn">데이터 초기화</button>' +
      '<a class="seed-action-button" data-variant="neutralWeak" data-size="small" href="#/" style="text-decoration:none">테스트 화면</a>' +
      '</div></header>' +
      '<input type="file" id="importFile" accept="application/json" multiple class="sr-only">' +
      (online
        ? ''
        : '<div class="seed-callout" data-tone="warning" style="margin-bottom:16px">' +
          '<span>' + SeedIcon.svg('alert', 18) + '</span>' +
          (state === 'unauthorized'
            ? '<span class="t4-regular"><b>서버가 응답 열람을 거부했습니다.</b><br>' +
              '브라우저에 저장된 비밀번호가 서버가 아는 값과 다릅니다. ' +
              'config.js 의 비밀번호를 바꾼 뒤 서버를 다시 띄우지 않았다면 재시작해 주세요. ' +
              '아래 수치는 이 브라우저에 남은 응답만 집계한 것입니다.</span>'
            : '<span class="t4-regular"><b>응답 수집 서버가 꺼져 있습니다.</b><br>' +
              '<code>node .claude/ut-server.js</code> 로 띄우고 <code>http://localhost:8790/</code> 으로 진행하면 ' +
              '참가자가 설문을 마치는 즉시 이 화면에 쌓입니다. 지금은 이 브라우저에만 저장됩니다' +
              (Store.pendingCount() ? ' (전송 대기 ' + Store.pendingCount() + '건).' : '.') +
              '</span>') +
          '</div>') +
      (done.length === 0 ? renderEmpty() : renderBody(done, agg, all.length - done.length)) +
      '</div></div>';

    bindResults(done);
  }

  function renderEmpty() {
    return (
      '<div class="card"><div class="empty">' +
      SeedIcon.svg('chart', 32) +
      '<p class="t5-medium" style="margin:12px 0 4px">아직 완료된 응답이 없습니다</p>' +
      '<p class="t3-regular">테스트를 한 번 끝까지 진행하면 여기에 바로 쌓입니다.</p>' +
      '</div></div>'
    );
  }

  function renderBody(rows, agg, draftCount) {
    const placeholderWarning = rows.some((r) => r.asisIsPlaceholder)
      ? '<div class="seed-callout" data-tone="warning" style="margin-bottom:16px">' +
        '<span>' + SeedIcon.svg('alert', 18) + '</span>' +
        '<span class="t4-regular"><b>개선 전(AS-IS) 프로토타입이 아직 개선 후와 같은 파일입니다.</b><br>' +
        'config.js 의 PROTO_ASIS 를 AS-IS Figma 링크로 바꾸기 전까지, 아래 개선 전/후 비교는 레이아웃 확인용 더미 수치입니다.</span></div>'
      : '';

    return (
      placeholderWarning +
      renderStats(rows, agg, draftCount) +
      renderTaskCards(agg) +
      renderPerceptionCards(agg) +
      renderOpenCard(rows) +
      renderTableCard(rows)
    );
  }

  function renderStats(rows, agg, draftCount) {
    // unit 은 레퍼런스의 `87%/100` 처럼 만점이 있는 값에만 옅게 붙입니다.
    const stat = (label, value, sub, unit) =>
      '<div class="stat"><div class="stat__label t3-medium">' + esc(label) + '</div>' +
      '<div class="stat__value">' + esc(value) +
      (unit ? '<span class="stat__unit">/' + esc(unit) + '</span>' : '') + '</div>' +
      (sub ? '<div class="stat__sub t2-regular">' + esc(sub) + '</div>' : '') + '</div>';

    return (
      '<div class="stat-row">' +
      stat('완료 응답', rows.length + '명', draftCount > 0 ? '진행 중 ' + draftCount + '건 제외' : '') +
      stat('개선안 태스크 성공률', fmtPct(agg.overall.tobe.successRate), 'PRD 목표 90%') +
      stat('SUS 점수', agg.sus === null ? '—' : agg.sus.toFixed(1), agg.susN + '명 응답 · 68점이 평균', agg.sus === null ? '' : '100') +
      stat(
        '개선안 선호',
        agg.preference.n ? Math.round((agg.preference.tobe / agg.preference.n) * 100) + '%' : '—',
        agg.preference.n ? agg.preference.tobe + ' / ' + agg.preference.n + '명' : ''
      ) +
      '</div>'
    );
  }

  /** 작업별로 값이 있는 지표 — 지표마다 카드 하나씩, Small Multiples 로 늘어놓습니다. */
  function renderTaskCards(agg) {
    // label 은 '작업 N', name 은 축에 함께 찍는 작업 이름입니다.
    // 가로축 한 점 = 그 작업에 대한 전체 참가자 평균이고, 참가자별 값이 아닙니다.
    const pts = (pick) =>
      agg.perTask.map((t) => ({
        label: t.short,
        name: t.def.axisLabel || t.def.title,
        asis: t.asis[pick],
        tobe: t.tobe[pick],
      }));

    // 소요시간 축 눈금은 실제 값에 맞춰 잡습니다. 고정하면 값이 작을 때 막대가 다 뭉개집니다.
    const msValues = pts('avgMs').flatMap((p) => [p.asis, p.tobe]).filter((v) => typeof v === 'number');
    const msMax = msValues.length ? niceMax(Math.max(...msValues) / 1000) * 1000 : 60000;

    const cards = [
      metricCard({
        title: '태스크 성공률',
        unit: '% · 목표 화면에 도달했다고 응답한 비율',
        points: pts('successRate'),
        format: FMT.rate,
        deltaFormat: (v) => Math.round(v * 100) + '%p',
        betterWhen: 'up',
        max: 1,
        gridLines: [0, 0.25, 0.5, 0.75, 1],
        gridFormat: (v) => Math.round(v * 100),
      }),
      metricCard({
        title: '평균 소요시간',
        unit: '초 · 성공한 시도만',
        points: pts('avgMs'),
        format: FMT.sec,
        barFormat: (v) => (v / 1000).toFixed(1),
        betterWhen: 'down',
        max: msMax,
        gridLines: [0, msMax / 4, msMax / 2, (msMax * 3) / 4, msMax],
        gridFormat: (v) => Math.round(v / 1000),
      }),
      metricCard({
        title: '체감 난이도 (SEQ)',
        unit: '7점 척도 · 높을수록 쉬움',
        points: pts('seq'),
        format: FMT.score,
        betterWhen: 'up',
        max: 7,
        gridLines: [0, 2, 4, 6],
        gridFormat: (v) => v,
      }),
    ];

    const deadPoints = pts('avgDead');
    if (agg.tapsTracked) {
      const deadValues = deadPoints.flatMap((p) => [p.asis, p.tobe]).filter((v) => typeof v === 'number');
      const deadMax = deadValues.length ? niceMax(Math.max(...deadValues)) : 4;
      cards.push(
        metricCard({
          title: '반응 없는 영역 탭',
          unit: '회 · 미스클릭, 낮을수록 좋음',
          points: deadPoints,
          format: FMT.count,
          barFormat: (v) => v.toFixed(1),
          betterWhen: 'down',
          max: deadMax,
          gridLines: [0, deadMax / 2, deadMax],
          gridFormat: (v) => (Number.isInteger(v) ? v : v.toFixed(1)),
        })
      );
    }

    const missing = agg.tapsTracked
      ? ''
      : '<div class="seed-callout" data-tone="neutral" style="margin-top:16px">' +
        '<span>' + SeedIcon.svg('alert', 18) + '</span>' +
        '<span class="t4-regular"><b>반응 없는 영역 탭(미스클릭)은 이번 회차에서 측정되지 않았습니다.</b><br>' +
        'Figma 임베드가 탭 이벤트(MOUSE_PRESS_OR_RELEASE)를 보내지 않으면 셀 수 없습니다. ' +
        '이 지표가 필요하면 진행자가 화면 녹화로 세거나, Maze·Useberry 처럼 자체 이벤트를 제공하는 도구를 병행해야 합니다.</span></div>';

    return (
      '<div class="section">' +
      '<div class="section__head">' +
      '<h2 class="t6-bold">작업별 개선 전 · 후</h2>' +
      '<p class="t3-regular">막대 한 쌍이 작업 하나입니다. 값은 그 작업을 수행한 전체 참가자의 평균입니다.</p>' +
      '</div>' +
      Charts.legend() +
      '<div class="charts-grid">' + cards.join('') + '</div>' +
      '<div class="section__note t3-regular">' +
      '<b>읽는 법</b> — 성공률과 체감 난이도는 <b>높을수록</b>, 소요시간과 미스클릭은 <b>낮을수록</b> 개선된 결과입니다. ' +
      '각 작업 아래 배지는 개선 폭을 그 지표의 단위 그대로 적은 것이고, 좋아졌으면 초록 · 나빠졌으면 빨강입니다.' +
      '</div>' +
      missing +
      '</div>'
    );
  }

  /** 축 눈금이 어중간한 숫자로 끝나지 않도록 올림합니다. */
  function niceMax(v) {
    if (!v || v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    return Math.ceil(v / mag * 2) / 2 * mag;
  }

  /** 값이 하나뿐인 지표 — 차이만 또렷하게 */
  function renderPerceptionCards(agg) {
    const findability =
      '<div class="card">' +
      '<div class="card__head">' +
      '<div><h2 class="card__title t6-bold">정보 탐색 용이성</h2>' +
      '<p class="card__note t3-regular">구간이 끝날 때마다 물어본 주관적 평가입니다. 5점 만점.</p></div>' +
      Charts.delta({
        asis: agg.findability.asis,
        tobe: agg.findability.tobe,
        format: FMT.score,
        betterWhen: 'up',
        unitLabel: '5점 만점',
      }) +
      '</div>' +
      Charts.legend() +
      Charts.compare([{ label: '정보 찾기 쉬움', asis: agg.findability.asis, tobe: agg.findability.tobe }], {
        format: FMT.score,
        max: 5,
      }) +
      '</div>';

    const preference =
      '<div class="card">' +
      '<div class="card__head">' +
      '<div><h2 class="card__title t6-bold">어느 쪽을 더 편하게 느꼈나</h2>' +
      '<p class="card__note t3-regular">마지막에 두 화면을 비교해 고른 결과입니다.</p></div>' +
      Charts.delta({
        asis: agg.preference.asis,
        tobe: agg.preference.tobe,
        format: FMT.people,
        betterWhen: 'up',
        unitLabel: agg.preference.n + '명 중',
      }) +
      '</div>' +
      Charts.legend() +
      Charts.compare([{ label: '선호', asis: agg.preference.asis, tobe: agg.preference.tobe }], {
        format: FMT.people,
        max: Math.max(1, agg.preference.n),
      }) +
      '<hr class="seed-divider" style="margin:24px 0">' +
      '<div class="stat-row">' +
      '<div class="stat"><div class="stat__label t3-medium">재방문 의향 (5점)</div>' +
      '<div class="stat__value stat__value--sm">' + fmt1(agg.revisit) + '<span class="stat__unit">/5</span></div>' +
      '<div class="stat__sub t2-regular">Primary KPI · 거래 활성 사용자 재방문</div></div>' +
      '<div class="stat"><div class="stat__label t3-medium">SUS 평균</div>' +
      '<div class="stat__value stat__value--sm">' + (agg.sus === null ? '—' : agg.sus.toFixed(1)) + (agg.sus === null ? '' : '<span class="stat__unit">/100</span>') + '</div>' +
      '<div class="stat__sub t2-regular">68점 이상이면 평균 이상</div></div>' +
      '</div></div>';

    return findability + preference;
  }

  function renderOpenCard(rows) {
    const fields = [
      { key: 'asis-open', label: '개선 전 · 불편했던 점' },
      { key: 'tobe-open', label: '개선 후 · 좋았던 점 / 아쉬운 점' },
      { key: 'compare-why', label: '선호 이유' },
    ];
    const blocks = fields
      .map((f) => {
        const quotes = rows.map((r) => ({ text: (r.answers[f.key] || '').trim(), id: r.id })).filter((q) => q.text);
        if (!quotes.length) return '';
        return (
          '<h3 class="t4-bold" style="margin:24px 0 12px">' + esc(f.label) + '</h3>' +
          '<div class="quote-list">' +
          quotes
            .map(
              (q) =>
                '<blockquote class="quote article-body">' + esc(q.text) +
                '<cite class="t2-regular">' + esc(q.id) + '</cite></blockquote>'
            )
            .join('') +
          '</div>'
        );
      })
      .join('');

    return (
      '<div class="card">' +
      '<h2 class="card__title t6-bold">주관식 응답</h2>' +
      '<p class="card__note t3-regular">그대로 옮긴 원문입니다. 정리하지 않았습니다.</p>' +
      (blocks || '<p class="t3-regular" style="color:var(--seed-color-fg-placeholder)">아직 주관식 응답이 없습니다.</p>') +
      '</div>'
    );
  }

  function columns() {
    const cols = [
      { label: '응답 ID', get: (r) => r.id },
      { label: '시작', get: (r) => r.startedAt },
      { label: '종료', get: (r) => r.finishedAt },
      { label: '제시 순서', get: (r) => r.order.join(' → ') },
      { label: '사용 빈도', get: (r) => r.answers.participant },
      { label: '사용 목적', get: (r) => r.answers.purpose },
    ];
    TASKS.filter((t) => t.enabled).forEach((def) => {
      ['asis', 'tobe'].forEach((arm) => {
        const armLabel = arm === 'asis' ? '개선전' : '개선후';
        const at = (r) => tasksOf(r)[def.id] && tasksOf(r)[def.id][arm];
        cols.push({ label: `${armLabel}·${def.title}·성공`, get: (r) => (at(r) ? (succeeded(at(r)) ? '성공' : '실패') : '') });
        cols.push({ label: `${armLabel}·${def.title}·초`, get: (r) => (at(r) ? (at(r).durationMs / 1000).toFixed(1) : '') });
        cols.push({ label: `${armLabel}·${def.title}·탭`, get: (r) => (at(r) ? at(r).taps : '') });
        cols.push({ label: `${armLabel}·${def.title}·미스클릭`, get: (r) => (at(r) ? at(r).deadTaps : '') });
        cols.push({ label: `${armLabel}·${def.title}·SEQ`, get: (r) => r.answers[`${arm}-${def.id}-seq`] });
      });
    });
    cols.push({ label: '개선전·정보찾기', get: (r) => r.answers['asis-findability'] });
    cols.push({ label: '개선후·정보찾기', get: (r) => r.answers['tobe-findability'] });
    cols.push({ label: '개선전·불편한점', get: (r) => r.answers['asis-open'] });
    cols.push({ label: '개선후·좋은점', get: (r) => r.answers['tobe-open'] });
    cols.push({
      label: '선호',
      get: (r) => (r.answers['compare-pref'] === 'tobe' ? '개선 후' : r.answers['compare-pref'] === 'asis' ? '개선 전' : ''),
    });
    cols.push({ label: '선호 이유', get: (r) => r.answers['compare-why'] });
    cols.push({ label: '재방문 의향', get: (r) => r.answers.revisit });
    cols.push({ label: '더 개선할 영역', get: (r) => r.answers['improve-area'] });
    for (let i = 1; i <= 10; i += 1) cols.push({ label: 'SUS' + i, get: (r) => r.answers['sus-' + i] });
    cols.push({ label: 'SUS 점수', get: (r) => susScore(r) });
    return cols;
  }

  function renderTableCard(rows) {
    const head = ['응답 ID', '순서', '개선전 성공', '개선후 성공', '개선전 평균초', '개선후 평균초', 'SUS', '선호'];
    const body = rows
      .map((r) => {
        const ts = Object.values(r.tasks || {});
        const arm = (a) => ts.filter((t) => t.arm === a);
        const rate = (a) => (arm(a).length ? Math.round((arm(a).filter(succeeded).length / arm(a).length) * 100) + '%' : '—');
        const secs = (a) => {
          const ok = arm(a).filter(succeeded);
          return ok.length ? (mean(ok.map((t) => t.durationMs)) / 1000).toFixed(1) : '—';
        };
        const s = susScore(r);
        return (
          '<tr><td>' + esc(r.id) + '</td>' +
          '<td>' + esc(r.order[0] === 'asis' ? '전 → 후' : '후 → 전') + '</td>' +
          '<td>' + rate('asis') + '</td><td>' + rate('tobe') + '</td>' +
          '<td>' + secs('asis') + '</td><td>' + secs('tobe') + '</td>' +
          '<td>' + (s === null ? '—' : s.toFixed(1)) + '</td>' +
          '<td>' + esc(r.answers['compare-pref'] === 'tobe' ? '개선 후' : r.answers['compare-pref'] === 'asis' ? '개선 전' : '—') + '</td></tr>'
        );
      })
      .join('');

    return (
      '<div class="card">' +
      '<h2 class="card__title t6-bold">참가자별 응답</h2>' +
      '<p class="card__note t3-regular">전체 항목은 CSV 로 내려받으면 한 행에 한 명씩 들어 있습니다.</p>' +
      '<div class="table-wrap"><table class="data"><thead><tr>' +
      head.map((h) => '<th class="t3-bold">' + esc(h) + '</th>').join('') +
      '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      '</div>'
    );
  }

  function bindResults(rows) {
    const on = (sel, fn) => {
      const el = root.querySelector(sel);
      if (el) el.addEventListener('click', fn);
    };
    on('#refreshBtn', () => renderResults());
    on('#jsonBtn', () => Store.exportJSON(rows));
    on('#csvBtn', () => Store.exportCSV(rows, columns()));
    on('#resetBtn', async () => {
      if (!confirm('수집된 응답을 모두 지웁니다.\n서버에 저장된 것과 이 브라우저에 남은 것 모두 지워지고, 되돌릴 수 없습니다.\n\n계속할까요?')) return;
      const { server } = await Store.clearAll();
      if (!server) alert('이 브라우저의 응답은 지웠지만, 서버 응답은 지우지 못했습니다.\n서버가 켜져 있는지 확인해 주세요.');
      renderResults();
    });

    const file = root.querySelector('#importFile');
    on('#importBtn', () => file.click());
    if (file)
      file.addEventListener('change', async () => {
        let added = 0;
        for (const f of file.files) {
          try {
            const parsed = JSON.parse(await f.text());
            added += await Store.merge(Array.isArray(parsed) ? parsed : [parsed]);
          } catch (e) {
            alert(f.name + ' 을(를) 읽지 못했습니다. UT 에서 내보낸 json 파일이 맞는지 확인해 주세요.');
          }
        }
        alert(added + '건을 불러왔습니다.');
        renderResults();
      });
  }

  function start(mount) {
    root = mount;
    if (sessionStorage.getItem(UNLOCK_KEY) === '1') renderResults();
    else renderLocked('');
  }

  return { start };
})();
