// 가이드 쪽 — 폰 메뉴만 (머리글은 늘 진하게)
(function () {
  var nav = document.getElementById('nav');
  var burger = document.querySelector('.nav-burger');
  var mnav = document.getElementById('mnav');
  if (!nav || !burger || !mnav) return;
  function setMenu(open) {
    nav.classList.toggle('open', open);
    mnav.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
  }
  burger.addEventListener('click', function () { setMenu(!mnav.classList.contains('open')); });
  mnav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
  addEventListener('resize', function () { if (innerWidth > 860) setMenu(false); });
})();
