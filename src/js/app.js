(function () {
  var app = document.getElementById('app');
  var DEALS = {
    sell: {
      cta: '판매내역',
      items: [
        { n: '자라 블랙 플리츠 원피스 S', p: '20,000원', s: '판매중' },
        { n: '아크테릭스 Arcteryx Atom LT 자켓', p: '18,000원', s: '거래완료' }
      ]
    },
    buy: {
      cta: '구매내역',
      items: [
        { n: '루미큐브 보드게임 정품', p: '22,000원', s: '거래완료' },
        { n: '무선 키보드 저소음 적축', p: '38,000원', s: '후기 남기기' }
      ]
    },
    like: {
      cta: '관심목록',
      items: [
        { n: '다이슨 에어랩 컴플리트', p: '390,000원', s: '가격 인하' },
        { n: '브롬톤 자전거 C라인', p: '1,250,000원', s: '예약중' }
      ]
    }
  };

  /* ── 세그먼트 ── */
  var segDeal = document.getElementById('segDeal'), segSvc = document.getElementById('segSvc');
  var tabDeal = document.getElementById('tabDeal'), tabSvc = document.getElementById('tabSvc');
  var scroll = app.querySelector('.scroll');
  function seg(deal) {
    segDeal.setAttribute('aria-selected', String(deal));
    segSvc.setAttribute('aria-selected', String(!deal));
    tabDeal.hidden = !deal; tabSvc.hidden = deal;
    scroll.scrollTop = 0;
  }
  segDeal.addEventListener('click', function () { seg(true); });
  segSvc.addEventListener('click', function () { seg(false); });

  /* ── 판매 · 구매 · 관심 ── */
  var tri = [].slice.call(app.querySelectorAll('.tri button'));
  var plist = document.getElementById('plist'), allTxt = document.getElementById('allTxt');
  var active = 'sell';
  function rows(k) {
    active = k;
    tri.forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.k === k)); });
    plist.innerHTML = DEALS[k].items.map(function (it) {
      return '<div class="prow" data-nav-prod="' + it.n + '">' +
        '<span class="th"><svg width="26" height="26" viewBox="0 0 48 22" style="width:26px;height:auto"><use href="#pay-logo"/></svg></span>' +
        '<span class="in"><span class="t">' + it.n + '</span><span class="p">' + it.p + '</span></span>' +
        '<span class="pbadge">' + it.s + '</span></div>';
    }).join('');
    allTxt.textContent = DEALS[k].cta;
    wire(plist);
  }
  tri.forEach(function (b) { b.addEventListener('click', function () { rows(b.dataset.k); }); });

  /* ── 화면 스택 ── */
  var BACK = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
  var NAV = {
    '중고거래': ['중고거래', 'svc-used', 50, '우리 동네 중고 거래'],
    '모임': ['모임', 'svc-meet', 50, '취미가 같은 이웃과 함께'],
    '알바': ['알바', 'svc-job', 50, '걸어서 10분 알바'],
    '세탁수거': ['세탁 수거', 'svc-laundry', 40, '집에서 맡기는 세탁'],
    '부동산': ['부동산', 'svc-estate', 50, '동네 부동산 직거래'],
    '내 아파트': ['내 아파트', 'svc-apt', 50, '우리 아파트 이웃 소식'],
    '중고차': ['중고차', 'svc-car', 50, '내 근처 중고차'],
    '동네걷기': ['동네걷기', 'svc-walk', 40, '걸으면 쌓이는 리워드'],
    '전체보기': ['전체 서비스', 'm-info', 24, '당근의 모든 서비스'],
    '판매관리': ['판매관리', 'm-sell', 24, '판매 중인 상품을 관리해요'],
    '구매내역': ['구매내역', 'm-buy', 24, '구매한 상품 내역'],
    '내 물건 가격 찾기': ['내 물건 가격 찾기', 'm-price', 24, '사진 한 장으로 시세를 확인해요'],
    '중고거래 가계부': ['중고거래 가계부', 'm-ledger', 24, '번 돈과 쓴 돈을 한눈에'],
    '관심목록': ['관심목록', 'q-heart', 24, '관심 표시한 상품 24개'],
    '키워드 알림 설정': ['키워드 알림 설정', 'm-keyword', 24, '등록한 키워드 3개'],
    '선생님 프로필 관리': ['선생님 프로필 관리', 'm-teacher', 24, '과외 · 클래스 프로필'],
    '내 동네생활 글': ['내 동네생활 글', 'm-post', 24, '내가 쓴 글 3개'],
    '비즈프로필 관리': ['비즈프로필 관리', 'm-biz', 24, '가게 정보와 소식'],
    '광고': ['광고', 'm-ad', 24, '이웃에게 우리 가게를 알려요'],
    '사장님 라운지': ['사장님 라운지', 'm-lounge', 24, '사장님들의 이야기 공간'],
    '내 동네 설정': ['내 동네 설정', 'm-loc', 24, '역삼동 · 대치동'],
    '동네 인증하기': ['동네 인증하기', 'm-crosshair', 24, 'GPS로 지금 동네를 인증해요'],
    'QR 코드 스캔': ['QR 코드 스캔', 'scan', 24, '매장 QR을 스캔해 결제해요'],
    '앱 설정': ['앱 설정', 'gear', 24, '알림 · 계정 설정'],
    '공지사항': ['공지사항', 'm-ad', 24, '당근 소식과 안내'],
    '고객센터': ['고객센터', 'm-cs', 24, '무엇을 도와드릴까요?'],
    '의견 남기기': ['의견 남기기', 'm-mail', 24, '당근에 바라는 점을 알려주세요'],
    '탈퇴하기': ['탈퇴하기', 'm-exit', 24, '계정을 삭제하면 되돌릴 수 없어요'],
    '당근 더 알아보기': ['당근 더 알아보기', 'm-carrot', 24, '당근이 만드는 동네 이야기'],
    '약관 및 정책': ['약관 및 정책', 'm-info', 24, '이용약관 · 개인정보 처리방침'],
    '충전': ['당근머니 충전', 'm-card', 24, '계좌에서 당근머니를 충전해요'],
    '송금': ['송금', 'm-card', 24, '이웃에게 당근머니를 보내요'],
    '결제': ['QR 결제', 'scan', 24, '매장 QR을 비춰주세요'],
    '머니': ['당근머니', 'm-card', 24, '잔액 0원'],
    '포인트': ['당근포인트', 'm-card', 24, '잔액 0원'],
    '혜택': ['쿠폰 · 혜택', 'm-coupon', 24, '사용 가능한 쿠폰 2장'],
    '홈': ['홈', 'n-home', 26, '우리 동네 중고 매물'],
    '커뮤니티': ['커뮤니티', 'n-comm', 26, '동네생활 · 모임 · 아파트'],
    '동네지도': ['동네지도', 'n-map', 26, '내 근처 가게와 소식'],
    '채팅': ['채팅', 'n-chat', 26, '진행 중인 대화'],
    '(주) 당근마켓 사업자 정보': ['사업자 정보', 'm-info', 24, '주식회사 당근마켓'],
    '내 프로필': ['내 프로필', 'av', 52, '우리동네두쫀쿠사천원 · 37.5°C']
  };
  var depth = 0;
  function push(title, icon, box, sub) {
    depth++;
    var el = document.createElement('div');
    el.className = 'scr';
    el.style.zIndex = String(50 + depth);
    el.innerHTML = '<div class="snav"><button type="button" class="sback" aria-label="뒤로">' + BACK + '</button>' +
      '<span class="st">' + title + '</span></div>' +
      '<div class="sbody"><div class="shero">' +
      '<svg width="56" height="56" viewBox="0 0 ' + box + ' ' + box + '"><use href="#' + icon + '"/></svg>' +
      '<b>' + title + '</b><span>' + sub + '</span></div>' +
      '<div class="snote">프로토타입에서는 여기까지 준비되어 있어요.</div></div>';
    app.appendChild(el);
    el.querySelector('.sback').addEventListener('click', function () {
      el.classList.remove('on'); depth--;
      setTimeout(function () { el.remove(); }, 300);
    });
    requestAnimationFrame(function () { el.classList.add('on'); });
  }
  function go(label) {
    var v = NAV[(label || '').trim()];
    if (v) push(v[0], v[1], v[2], v[3]);
    else push((label || '화면').trim(), 'm-info', 24, '이 화면까지 연결됩니다');
  }

  function wire(root) {
    function on(el, fn) {
      if (el.dataset.w) return; el.dataset.w = '1';
      el.style.cursor = 'pointer';
      el.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
    }
    [].slice.call(root.querySelectorAll('.mrow')).forEach(function (el) {
      var l = el.querySelector('.ml'); if (l) on(el, function () { go(l.textContent); });
    });
    [].slice.call(root.querySelectorAll('.sgrid a')).forEach(function (el) {
      var l = el.querySelector('.sl'); if (l) on(el, function () { go(l.textContent); });
    });
    [].slice.call(root.querySelectorAll('.prow')).forEach(function (el) {
      var n = el.dataset.navProd || '상품';
      on(el, function () { push(n, 'svc-used', 50, '중고거래 상품 상세'); });
    });
    [].slice.call(root.querySelectorAll('.chead .more')).forEach(function (el) {
      on(el, function () { go(el.dataset.nav || '전체보기'); });
    });
  }

  /* 정적 요소 배선 */
  wire(app);
  app.querySelector('.prof').addEventListener('click', function () { go('내 프로필'); });
  app.querySelector('.prof').style.cursor = 'pointer';
  document.getElementById('gearBtn').addEventListener('click', function () { go('앱 설정'); });
  document.getElementById('gearBtn').style.cursor = 'pointer';
  [].slice.call(app.querySelectorAll('.pay-top a')).forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); go(a.textContent); });
  });
  app.querySelector('.pay-top .lg').addEventListener('click', function () { go('머니'); });
  app.querySelector('.pay-top .lg').style.cursor = 'pointer';
  app.querySelector('.pill').addEventListener('click', function () { go('결제'); });
  app.querySelector('.pill').style.cursor = 'pointer';
  [].slice.call(app.querySelectorAll('.wallet > div')).forEach(function (d) {
    d.style.cursor = 'pointer';
    d.addEventListener('click', function () { go(d.textContent.trim().split(' ')[0]); });
  });
  document.getElementById('allBtn').addEventListener('click', function () {
    go({ sell: '판매관리', buy: '구매내역', like: '관심목록' }[active]);
  });
  app.querySelector('.legal .biz').addEventListener('click', function () { go('(주) 당근마켓 사업자 정보'); });
  [].slice.call(app.querySelectorAll('.tabbar > div')).forEach(function (d) {
    if (d.classList.contains('on')) return;
    d.addEventListener('click', function () { go(d.textContent.trim()); });
  });

  rows('sell');
  seg(true);
})();

