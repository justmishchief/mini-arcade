// Home page: the pill tabs filter the game list
const tabs = document.querySelectorAll('#tabs button');
const cards = document.querySelectorAll('#glist .gcard');

tabs.forEach(tab => tab.addEventListener('click', () => {
  const f = tab.dataset.f;
  tabs.forEach(t => t.classList.toggle('on', t === tab));
  let shown = 0;
  cards.forEach(card => {
    const show = f === 'all' || card.dataset.cats.split(' ').includes(f);   // each card lists its categories
    card.style.display = show ? '' : 'none';
    if (show) shown++;
  });
  document.getElementById('count').textContent = shown + (shown === 1 ? ' game' : ' games');
}));