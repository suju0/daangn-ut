/**
 * 대시보드 차트
 *
 * 두 가지만 씁니다.
 *   groupedBars() 작업별로 개선 전/후 막대를 나란히 세웁니다.
 *                 지표 하나가 카드 하나이고, 카드를 늘어놓아 Small Multiples 로 읽습니다.
 *   compare()     값이 하나뿐이라 개선 전/후 차이만 보면 될 때
 *
 * 왜 꺾은선이 아니라 막대인가
 *   작업 1 · 2 · 3 은 시간 순서가 아니라 서로 다른 과제입니다. 선으로 이으면 "작업이 진행될수록
 *   좋아진다" 는 없는 추세가 읽히고, 두 계열이 겹치면 구분도 어렵습니다.
 *   작업별로 칸을 나누고 막대를 옆에 세우면 "이 작업에서 얼마나 좋아졌나" 만 보면 됩니다.
 *
 * 색 규칙
 *   개선 전(AS-IS) — 그레이. 비교의 기준선이라 눈에 덜 띄어야 합니다.
 *   개선 후(TO-BE) — 당근 키컬러 주황 + 빗금. 색과 무늬 두 가지로 구분되므로
 *                    색만으로 계열을 읽지 않아도 됩니다.
 *
 * 막대 색·빗금·두께는 전부 ut.css 에 있습니다. 여기서는 값과 구조만 만듭니다.
 */
const Charts = (() => {
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /**
   * 그룹 막대 — 작업 하나당 개선 전/후 막대 두 개를 나란히 세웁니다.
   * 지표 하나가 카드 하나이고, 카드를 나란히 늘어놓아 Small Multiples 로 읽습니다.
   *
   * 한 지표 안에 세 작업을 겹쳐 그리면 선이 엉켜 비교가 어렵습니다.
   * 작업별로 칸을 나누면 "이 작업에서 얼마나 좋아졌나"를 바로 옆에서 바로 읽을 수 있습니다.
   *
   * @param {{label: string, name?: string, asis: number|null, tobe: number|null}[]} groups
   * @param {{format, max?, gridLines?: number[], betterWhen?: 'up'|'down', deltaFormat?}} opts
   */
  function groupedBars(groups, opts) {
    const values = groups.flatMap((g) => [g.asis, g.tobe]).filter((v) => typeof v === 'number');
    if (!values.length) return '<p class="t3-regular" style="color:var(--seed-color-fg-placeholder)">표시할 값이 없습니다.</p>';

    const max = opts.max ?? Math.max(Math.max(...values) * 1.2, 1);
    const grid = opts.gridLines || [0, max / 2, max];
    const pct = (v) => Math.max(0, Math.min(100, (v / max) * 100));

    const gridHtml = grid
      .map(
        (v) =>
          '<span class="gbar__gridline" style="bottom:' + pct(v).toFixed(1) + '%">' +
          '<i class="gbar__gridlabel">' + esc(opts.gridFormat ? opts.gridFormat(v) : String(v)) + '</i></span>'
      )
      .join('');

    // 막대 위 라벨은 단위를 뺀 숫자만 씁니다. 칸이 좁아 "23.7초" 처럼 적으면 옆 라벨과 부딪힙니다.
    // 단위는 카드 제목 아래에 한 번만 적어 두었고, 마우스를 올리면 단위까지 나옵니다.
    const barFormat = opts.barFormat || opts.format;

    const col = (arm, v, groupName) => {
      const has = typeof v === 'number';
      const label = arm === 'asis' ? '개선 전' : '개선 후';
      return (
        '<span class="gbar__col" title="' + esc(groupName + ' · ' + label + ' · ' + (has ? opts.format(v) : '응답 없음')) + '">' +
        '<span class="gbar__val" data-arm="' + arm + '">' + esc(has ? barFormat(v) : '—') + '</span>' +
        // 막대 높이는 라벨을 뺀 트랙 기준입니다. 값이 만점이어도 라벨이 카드 밖으로 넘치지 않습니다.
        '<span class="gbar__track">' +
        (has ? '<span class="gbar__bar" data-arm="' + arm + '" style="height:' + pct(v).toFixed(1) + '%"></span>' : '') +
        '</span></span>'
      );
    };

    const groupsHtml = groups
      .map(
        (g) =>
          '<div class="gbar__group">' +
          '<div class="gbar__bars">' + col('asis', g.asis, g.name || g.label) + col('tobe', g.tobe, g.name || g.label) + '</div>' +
          '</div>'
      )
      .join('');

    const labelsHtml = groups
      .map((g) => '<div class="gbar__label t2-medium">' + esc(g.name || g.label) + '</div>')
      .join('');

    const deltas = groups.map((g) => '<div class="gbar__delta-cell">' + deltaBadge(g, opts) + '</div>').join('');

    return (
      '<div class="gbar">' +
      '<div class="gbar__plot">' +
      '<div class="gbar__grid" aria-hidden="true">' + gridHtml + '</div>' +
      '<div class="gbar__groups">' + groupsHtml + '</div>' +
      '<div class="gbar__labels">' + labelsHtml + '</div>' +
      '</div>' +
      '<div class="gbar__deltas">' + deltas + '</div>' +
      '</div>'
    );
  }

  /**
   * 작업 하나의 개선 폭 배지.
   * 차이는 그 지표의 단위 그대로 적습니다. 비율(%)로 바꾸면 기준값이 작을 때 과장돼 보입니다.
   * 퍼센트 지표는 %p 로 적어 상대변화와 헷갈리지 않게 합니다.
   */
  function deltaBadge(g, opts) {
    if (typeof g.asis !== 'number' || typeof g.tobe !== 'number') {
      return '<span class="badge" data-tone="none">비교 불가</span>';
    }
    const diff = g.tobe - g.asis;
    const text = (opts.deltaFormat || opts.format)(Math.abs(diff));
    if ((opts.deltaFormat || opts.format)(0) === text) {
      return '<span class="badge" data-tone="none">변화 없음</span>';
    }
    const better = opts.betterWhen === 'down' ? diff < 0 : diff > 0;
    return (
      '<span class="badge" data-tone="' + (better ? 'good' : 'bad') + '">' +
      (diff > 0 ? '▲ ' : '▼ ') + esc(text) + '</span>'
    );
  }

  /**
   * 비교 막대 — 값이 하나뿐일 때. 개선 전/후 차이만 또렷하게 보여 줍니다.
   * 레퍼런스처럼 채워진 알약과 남은 만큼의 회색 블록을 한 칸 띄워 놓고,
   * 그 경계에 후광 마커를 세웁니다.
   */
  function compare(rows, opts) {
    const max = opts.max ?? Math.max(1, ...rows.flatMap((r) => [r.asis || 0, r.tobe || 0]));

    /** 알약과 나머지 블록 사이 간격(px). ut.css 의 .cbar__lane gap 과 같아야 합니다. */
    const GAP = 8;

    const bar = (arm, v) => {
      const ratio = typeof v === 'number' ? Math.max(0, Math.min(1, v / max)) : 0;
      const pct = ratio * 100;
      const full = ratio > 0.999;
      const label = arm === 'asis' ? '개선 전' : '개선 후';
      // 간격만큼 줄어든 실제 끝 지점에 마커를 세웁니다.
      const markerLeft = 'calc(' + pct.toFixed(1) + '% - ' + (ratio * GAP).toFixed(2) + 'px)';
      return (
        '<div class="cbar__row" title="' + esc(label + ' · ' + (typeof v === 'number' ? opts.format(v) : '응답 없음')) + '">' +
        '<span class="cbar__name t3-medium">' + label + '</span>' +
        '<span class="cbar__lane">' +
        '<span class="cbar__fill" data-arm="' + arm + '" style="flex-basis:' + pct.toFixed(1) + '%"></span>' +
        (full ? '' : '<span class="cbar__rest" style="flex-basis:' + (100 - pct).toFixed(1) + '%"></span>') +
        (arm === 'tobe' ? '<span class="cbar__marker" style="left:' + markerLeft + '"></span>' : '') +
        '</span>' +
        '<span class="cbar__val t4-medium">' + esc(typeof v === 'number' ? opts.format(v) : '—') + '</span>' +
        '</div>'
      );
    };

    return (
      '<div class="cbar">' +
      rows
        .map(
          (r) =>
            '<div class="cbar__group">' +
            (rows.length > 1 ? '<div class="cbar__title t3-medium">' + esc(r.label) + '</div>' : '') +
            bar('tobe', r.tobe) +
            bar('asis', r.asis) +
            '</div>'
        )
        .join('') +
      '</div>'
    );
  }

  /**
   * 변화량 표시.
   * 레퍼런스의 `72%/100` 처럼 큰 숫자 옆에 기준을 옅게 붙이고,
   * “▲ 10.8초” 만으로는 좋아진 건지 나빠진 건지 알 수 없으므로 한 줄 해석을 함께 둡니다.
   */
  function delta({ asis, tobe, format, betterWhen = 'up', unitLabel }) {
    if (typeof asis !== 'number' || typeof tobe !== 'number') {
      return '<div class="delta delta--empty"><span class="delta__value">—</span>' +
        '<span class="delta__note t2-regular">비교할 응답이 아직 없습니다</span></div>';
    }
    const diff = tobe - asis;
    if (format(Math.abs(diff)) === format(0)) {
      return '<div class="delta delta--flat"><span class="delta__value">변화 없음</span>' +
        '<span class="delta__note t2-regular">' + esc(unitLabel || '') + '</span></div>';
    }
    const better = betterWhen === 'up' ? diff > 0 : diff < 0;
    const arrow = diff > 0 ? '▲' : '▼';
    const verb = better ? '좋아졌어요' : '나빠졌어요';
    // 차이값에는 `/100` 같은 만점 표기를 붙이지 않습니다. 차이는 점수가 아니니까요.
    // 기준(전체 평균 · 5점 만점 등)은 아래 설명 줄에 둡니다.
    return (
      '<div class="delta" data-dir="' + (better ? 'better' : 'worse') + '">' +
      '<span class="delta__value">' + arrow + ' ' + esc(format(Math.abs(diff))) + '</span>' +
      '<span class="delta__note t2-regular">' + esc((unitLabel ? unitLabel + ' · ' : '') + '개선 후가 ' + verb) + '</span>' +
      '</div>'
    );
  }

  function legend() {
    return (
      '<div class="legend t3-medium">' +
      '<span class="legend__item"><span class="legend__swatch" data-arm="asis"></span>개선 전 (AS-IS)</span>' +
      '<span class="legend__item"><span class="legend__swatch" data-arm="tobe"></span>개선 후 (TO-BE)</span>' +
      '</div>'
    );
  }

  return { groupedBars, compare, delta, legend };
})();
