/**
 * Figma 프로토타입 임베드 제어
 *
 * ── 로딩 전략 ────────────────────────────────────────────────
 * Figma 임베드는 첫 로드에 5~7초가 걸립니다. 참가자가 그 시간을 보지 않게 하는 것이 목표입니다.
 * 방법은 "기다릴 일을 참가자가 보지 않는 시간대로 미리 옮겨 두는 것" 하나뿐입니다.
 *
 * 1. 페이지가 열리는 순간 개선 전/후 두 벌을 동시에 띄웁니다.
 *    안 보여 줄 쪽은 `display:none` 으로 숨기지 않고 **화면 밖으로 밀어 둡니다.**
 *    display:none 인 iframe 은 브라우저가 그리기를 미루기 때문에, Figma 앱이 실제로는
 *    켜지지 않은 채 대기하다가 보여 주는 순간 그때부터 로딩이 시작됩니다.
 *    화면 밖에 두면 보이지만 않을 뿐 정상적으로 다 켜집니다.
 *
 * 2. **태스크가 끝나도 다시 부르지 않습니다.** 한 구간 안에서는 화면을 이어서 씁니다.
 *    되돌리기는 결국 다시 불러오는 일이라, 예비 프레임이 준비되기 전에 참가자가 빨리 넘어가면
 *    그 로딩이 그대로 보였습니다. 그래서 되돌리는 시점을 구간 시작 · 새 참가자 ·
 *    '처음 화면으로' 버튼 세 가지로 줄였습니다.
 *
 * 3. 그 세 시점을 위해 **예비 프레임(spare)** 을 한 장 들고 있습니다.
 *    첫 화면 상태로 미리 다 켜 둔, 보이지 않는 복사본입니다.
 *    되돌릴 때는 다시 불러오지 않고 이 프레임과 **자리만 바꿔** 즉시 끝냅니다.
 *    자리를 바꾼 직후, 다음을 위한 새 예비 프레임을 백그라운드에서 다시 만들어 둡니다.
 *
 * 결과적으로 로딩 화면을 보게 되는 건 페이지를 처음 열었을 때 한 번뿐이고,
 * 그마저도 참가자가 시작 안내와 참가자 정보 문항을 읽는 동안 끝납니다.
 *
 * 프로토타입은 어느 화면에서든 그대로 눌러 볼 수 있습니다. 잠그지 않습니다.
 *
 * ── 이벤트 ──────────────────────────────────────────────────
 * Figma Embed Kit 은 embed-host 가 붙은 임베드에서 부모 창으로 postMessage 를 보낼 수 있습니다.
 *   PRESENTED_NODE_CHANGED   → 이동한 화면(노드) 경로
 *   MOUSE_PRESS_OR_RELEASE   → 탭 횟수 · 반응 없는 영역 탭(미스클릭)
 * 다만 2026-09 기준 이 파일의 임베드에서는 실제로 오지 않는 것을 확인했습니다
 * (embed.figma.com · www.figma.com/embed 양쪽, embed-host 를 정상적으로 붙인 상태).
 * 이벤트가 오면 자동 집계하고, 오지 않으면 '측정되지 않음'으로 표시합니다.
 */
const Proto = (() => {
  /** arm(asis|tobe) → { wrap, url, live: Slot, spare: Slot|null } */
  const frames = {};
  let recording = null;
  let eventsSeen = false;
  const listeners = { node: [], pointer: [], ready: [] };

  /** press + release 가 각각 이벤트로 오므로, 한 번의 탭으로 묶기 위한 간격(ms) */
  const TAP_PAIR_WINDOW = 400;

  /**
   * iframe 의 load 이벤트는 Figma 문서를 받은 시점에 떨어지고,
   * 그 뒤에도 Figma 앱이 켜지면서 잠깐 자체 로딩 화면을 보여 줍니다.
   * 그 구간까지 덮기 위해 load 이후 이만큼 더 기다렸다가 '준비됨'으로 봅니다.
   * 이 대기는 페이지를 처음 열 때 한 번만 겪습니다(되돌리기는 예비 프레임 교체라 대기가 없습니다).
   */
  const READY_GRACE = 2500;

  /**
   * 예비 프레임을 만들기 시작하는 시점.
   * 본 프레임이 준비된 뒤 이만큼 뒤에 시작합니다. 둘을 동시에 켜면 서로 느려집니다.
   */
  const SPARE_DELAY = 1200;

  /**
   * 예비 프레임을 들고 있을 arm. 한 번에 **한 쪽만** 가집니다.
   *
   * Figma 임베드를 한 화면에 네 장 띄우면 그중 일부가 검은 화면으로 남는 것을 확인했습니다
   * (브라우저가 한 문서에 허용하는 WebGL 컨텍스트 수 제한으로 보입니다. 세 장까지는 정상).
   * 그래서 본 프레임 두 장(개선 전/후) + 예비 한 장, 최대 세 장만 유지합니다.
   * 예비는 지금 보여 주고 있는 쪽이 가져갑니다 — 되돌리기가 일어나는 곳이 거기뿐이기 때문입니다.
   */
  let spareArm = 'asis';

  /* ── 프레임 ───────────────────────────────────────────────── */

  /**
   * iframe 한 장을 만들어 기기 영역에 붙입니다.
   * @param {object} entry frames[arm]
   * @param {string} arm
   * @param {'live'|'spare'} role live 는 보이는 프레임, spare 는 뒤에 숨겨 둔 예비 프레임
   */
  function createSlot(entry, arm, role) {
    const iframe = document.createElement('iframe');
    iframe.className = 'device__frame';
    iframe.dataset.role = role;
    iframe.title = (arm === 'asis' ? '개선 전' : '개선 후') + ' 프로토타입';
    iframe.allow = 'fullscreen';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    if (role === 'spare') iframe.setAttribute('aria-hidden', 'true');

    const slot = { iframe, ready: false, timer: null };
    iframe.addEventListener('load', () => {
      clearTimeout(slot.timer);
      slot.timer = setTimeout(() => {
        slot.ready = true;
        if (entry.live === slot) markReady(entry, arm);
        else if (entry.spare === slot) entry.wrap.dataset.spare = 'ready';
      }, READY_GRACE);
    });

    entry.wrap.appendChild(iframe);
    iframe.src = entry.url;
    return slot;
  }

  function markReady(entry, arm) {
    entry.wrap.dataset.ready = 'true';
    resumeClock(); // 로딩이 끝났으니 멈춰 둔 시계를 다시 흐르게 합니다
    listeners.ready.forEach((fn) => fn(arm));
    // 본 프레임이 켜진 다음에 예비 프레임을 준비합니다.
    scheduleSpare(arm);
  }

  function dropSlot(entry, slot) {
    if (!slot) return;
    clearTimeout(slot.timer);
    slot.iframe.remove();
  }

  /** 예비 프레임을 버립니다. 다른 쪽에 예비를 넘겨 줄 때 씁니다. */
  function dropSpare(arm) {
    const entry = frames[arm];
    if (!entry) return;
    clearTimeout(entry.spareTimer);
    dropSlot(entry, entry.spare);
    entry.spare = null;
    delete entry.wrap.dataset.spare;
  }

  /** 예비 프레임이 없으면 만들어 둡니다. 이미 있으면 아무 것도 하지 않습니다. */
  function ensureSpare(arm) {
    const entry = frames[arm];
    // 임베드 세 장 제한 — 예비는 지정된 한 쪽만, 그것도 본 프레임이 켜진 뒤에 만듭니다.
    if (!entry || arm !== spareArm || entry.spare || !entry.live.ready) return;
    delete entry.wrap.dataset.spare;
    entry.spare = createSlot(entry, arm, 'spare');
  }

  function scheduleSpare(arm) {
    const entry = frames[arm];
    if (!entry) return;
    clearTimeout(entry.spareTimer);
    entry.spareTimer = setTimeout(() => ensureSpare(arm), SPARE_DELAY);
  }

  /** 예비 프레임을 가질 쪽을 옮깁니다. 반대쪽 예비는 버립니다(동시 세 장 제한). */
  function setSpareArm(arm) {
    if (!arm || arm === spareArm) return;
    dropSpare(spareArm);
    spareArm = arm;
    scheduleSpare(arm);
  }

  function createFrame(arm, url) {
    const wrap = document.createElement('div');
    wrap.className = 'device';
    wrap.dataset.arm = arm;
    wrap.dataset.shown = 'false';

    const loading = document.createElement('div');
    loading.className = 'device__loading';
    loading.innerHTML =
      '<span class="device__spinner" aria-hidden="true"></span>' +
      '<span class="t3-regular">프로토타입 불러오는 중</span>';
    wrap.appendChild(loading);

    const entry = { wrap, url, live: null, spare: null, spareTimer: null };
    entry.live = createSlot(entry, arm, 'live');
    return entry;
  }

  /**
   * 프로토타입 두 벌을 만들어 미리 불러옵니다. 페이지가 열릴 때 한 번만 호출합니다.
   * @param {HTMLElement} stage 기기 영역이 들어갈 컨테이너
   * @param {{asis: string, tobe: string}} urls
   */
  function init(stage, urls) {
    Object.keys(frames).forEach((k) => delete frames[k]);
    spareArm = 'asis'; // 먼저 쓰는 쪽. 개선 후로 넘어가면 show() 가 옮겨 줍니다.
    for (const arm of ['asis', 'tobe']) {
      frames[arm] = createFrame(arm, urls[arm]);
      stage.appendChild(frames[arm].wrap);
    }
  }

  /**
   * 지정한 프로토타입만 보여 줍니다. arm 이 없으면 둘 다 감춥니다.
   * 감춘 쪽도 화면 밖에서 계속 켜져 있으므로, 다시 보여 줄 때 로딩이 없습니다.
   */
  function show(arm) {
    for (const key of Object.keys(frames)) {
      frames[key].wrap.dataset.shown = String(key === arm);
    }
    // 되돌리기가 일어나는 건 지금 보고 있는 쪽이므로, 예비 프레임도 이쪽으로 옮깁니다.
    setSpareArm(arm);
  }

  function isReady(arm) {
    return !!(frames[arm] && frames[arm].live && frames[arm].live.ready);
  }

  /**
   * 프로토타입을 첫 화면으로 되돌립니다.
   *
   * 미리 켜 둔 예비 프레임이 있으면 자리만 바꿉니다 — 다시 불러오지 않으므로 대기가 없습니다.
   * 없을 때만(아직 준비 중이거나 연속으로 두 번 눌렀을 때) 본 프레임을 새로 불러옵니다.
   */
  function reset(arm) {
    const entry = frames[arm];
    if (!entry) return;
    clearTimeout(entry.spareTimer);

    if (entry.spare && entry.spare.ready) {
      const next = entry.spare;
      entry.spare = null;
      delete entry.wrap.dataset.spare;
      dropSlot(entry, entry.live);
      next.iframe.dataset.role = 'live';
      next.iframe.removeAttribute('aria-hidden');
      entry.live = next;
      // 이미 준비된 프레임이므로 준비 상태는 유지하고, 다음 예비 프레임만 다시 채웁니다.
      entry.wrap.dataset.ready = 'true';
      listeners.ready.forEach((fn) => fn(arm));
      scheduleSpare(arm);
      return;
    }

    // 예비가 없으면 예전 방식대로 새로 불러옵니다. 이때만 로딩 화면이 보입니다.
    dropSpare(arm);
    dropSlot(entry, entry.live);
    delete entry.wrap.dataset.ready;
    // 다시 불러오는 동안은 태스크 시계를 멈춥니다. 로딩 시간이 소요시간에 섞이면 안 됩니다.
    pauseClock();
    entry.live = createSlot(entry, arm, 'live');
  }

  /* ── 태스크 측정 ─────────────────────────────────────────── */

  function startRecording(blockId) {
    recording = {
      blockId,
      startedAt: Date.now(),
      // 프로토타입이 다시 로딩되는 동안 멈춰 있던 시간. 소요시간에서 빼냅니다.
      pausedMs: 0,
      pausedAt: null,
      path: [],
      taps: 0,
      deadTaps: 0,
      restarts: 0,
      lastPointerAt: 0,
    };
    return recording;
  }

  /** 프로토타입을 다시 불러오는 동안 시계를 멈춥니다. */
  function pauseClock() {
    if (recording && recording.pausedAt === null) recording.pausedAt = Date.now();
  }

  /** 로딩이 끝나면 멈춰 있던 만큼을 덜어내고 다시 흐르게 합니다. */
  function resumeClock() {
    if (!recording || recording.pausedAt === null) return;
    recording.pausedMs += Date.now() - recording.pausedAt;
    recording.pausedAt = null;
  }

  /** 지금까지의 순수 소요시간(ms). 로딩으로 멈춰 있던 시간은 빠져 있습니다. */
  function elapsed() {
    if (!recording) return 0;
    const paused =
      recording.pausedMs + (recording.pausedAt === null ? 0 : Date.now() - recording.pausedAt);
    return Date.now() - recording.startedAt - paused;
  }

  /** 지금 시계가 멈춰 있는지 (화면 표시용) */
  const isClockPaused = () => !!(recording && recording.pausedAt !== null);

  function stopRecording() {
    if (!recording) return null;
    const r = recording;
    const durationMs = elapsed();
    recording = null;
    return {
      // 로딩으로 멈춰 있던 시간은 빠진, 참가자가 실제로 화면을 본 시간입니다.
      durationMs,
      loadingPausedMs: r.pausedMs,
      path: r.path,
      restarts: r.restarts,
      // 이벤트가 오지 않는 환경에서는 0 이 아니라 '측정 안 됨'으로 남깁니다.
      tracked: eventsSeen,
      taps: eventsSeen ? r.taps : null,
      deadTaps: eventsSeen ? r.deadTaps : null,
    };
  }

  const peekRecording = () => recording;

  /* ── 이벤트 수신 ─────────────────────────────────────────── */

  function emit(kind, payload) {
    listeners[kind].forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        console.warn('[proto] listener 오류', e);
      }
    });
  }

  function on(kind, fn) {
    if (listeners[kind]) listeners[kind].push(fn);
  }

  window.addEventListener('message', (evt) => {
    if (!String(evt.origin).endsWith('figma.com')) return;
    const msg = evt.data;
    if (!msg || typeof msg !== 'object' || !msg.type) return;
    eventsSeen = true;

    if (msg.type === 'PRESENTED_NODE_CHANGED') {
      const nodeId = msg.data && msg.data.presentedNodeId;
      if (!nodeId) return;
      if (recording) {
        const last = recording.path[recording.path.length - 1];
        if (!last || last.nodeId !== nodeId) {
          recording.path.push({ nodeId, at: Date.now() - recording.startedAt });
        }
      }
      emit('node', nodeId);
      return;
    }

    if (msg.type === 'MOUSE_PRESS_OR_RELEASE') {
      if (!recording) return;
      const now = Date.now();
      // press 와 release 가 쌍으로 오므로 첫 이벤트만 한 번의 탭으로 셉니다.
      const isNewTap = now - recording.lastPointerAt > TAP_PAIR_WINDOW;
      recording.lastPointerAt = now;
      if (!isNewTap) return;
      recording.taps += 1;
      // handled === false 는 아무 동작도 연결되지 않은 곳을 누른 경우입니다.
      if (msg.data && msg.data.handled === false) recording.deadTaps += 1;
      emit('pointer', { taps: recording.taps, deadTaps: recording.deadTaps });
    }
  });

  return {
    init,
    show,
    reset,
    isReady,
    startRecording,
    stopRecording,
    peekRecording,
    elapsed,
    isClockPaused,
    on,
    hasEvents: () => eventsSeen,
  };
})();
