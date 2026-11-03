/**
 * 라우터
 *   #/        → UT 진행 화면 (참가자)
 *   #/result  → 응답 대시보드 (진행자 · 비밀번호 필요)
 */
(() => {
  const root = document.getElementById('root');

  function route() {
    if (location.hash.startsWith('#/result')) Dashboard.start(root);
    else Survey.start(root);
  }

  window.addEventListener('hashchange', route);
  route();
})();
