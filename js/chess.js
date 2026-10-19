// ---------- STATE ----------
const game = new Chess();          // chess.js keeps the position and knows all the rules
let mode = 'bot';                  // 'bot' or 'local'
let level = 'medium';              // 'easy', 'medium' or 'hard'
let human = 'w';                   // the human's color when playing the bot
let flipped = false;               // true = black at the bottom
let selected = null, targets = [], lastMove = null, thinking = false;

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
// "\uFE0E" forces the plain text glyph (some phones turn the pawn into an emoji otherwise)
const GLYPH = { p:'♟\uFE0E', n:'♞\uFE0E', b:'♝\uFE0E', r:'♜\uFE0E', q:'♛\uFE0E', k:'♚\uFE0E' };

// ---------- DRAWING ----------
function render() {
  const b = game.board();                       // 8x8 array, row 0 = rank 8
  let html = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const rr = flipped ? 7 - r : r, cc = flipped ? 7 - c : c;
      const sq = 'abcdefgh'[cc] + (8 - rr);
      const piece = b[rr][cc];
      let cls = 'sq ' + ((rr + cc) % 2 === 0 ? 'light' : 'dark');
      if (sq === selected) cls += ' sel';
      if (lastMove && (sq === lastMove[0] || sq === lastMove[1])) cls += ' last';
      if (targets.includes(sq)) cls += ' hint' + (piece ? ' cap' : '');
      if (piece && piece.type === 'k' && piece.color === game.turn() && game.in_check()) cls += ' check';
      const glyph = piece ? '<span class="' + (piece.color === 'w' ? 'pw' : 'pb') + '">' + GLYPH[piece.type] + '</span>' : '';
      html += '<div class="' + cls + '" data-sq="' + sq + '">' + glyph + '</div>';
    }
  }
  boardEl.innerHTML = html;
}

function updateStatus() {
  const side = game.turn() === 'w' ? 'White' : 'Black';
  if (game.in_checkmate()) statusEl.textContent = 'Checkmate! ' + (side === 'White' ? 'Black' : 'White') + ' wins';
  else if (game.in_draw()) statusEl.textContent = 'Draw';
  else if (mode === 'bot') statusEl.textContent = game.turn() === human ? 'Your move' + (game.in_check() ? ' (check!)' : '') : 'Bot is thinking...';
  else statusEl.textContent = side + ' to move' + (game.in_check() ? ' (check!)' : '');
}

// ---------- HUMAN MOVES ----------
function onSquare(sq) {
  if (thinking || game.game_over()) return;
  if (mode === 'bot' && game.turn() !== human) return;
  if (selected && targets.includes(sq)) { makeMove(selected, sq); return; }
  const piece = game.get(sq);
  if (piece && piece.color === game.turn()) {
    selected = sq;
    targets = game.moves({ square: sq, verbose: true }).map(m => m.to);
  } else { selected = null; targets = []; }
  render();
}
boardEl.addEventListener('click', e => {
  const el = e.target.closest('.sq');
  if (el) onSquare(el.dataset.sq);
});

function makeMove(from, to) {
  game.move({ from, to, promotion: 'q' });      // pawns always promote to a queen (keeps it simple)
  lastMove = [from, to]; selected = null; targets = [];
  render(); updateStatus();
  botTurn();
}

// ---------- BOT BRAIN ----------
const VAL = { p:100, n:320, b:330, r:500, q:900, k:0 };

// Score of the position from White's point of view (positive = White is better)
function evaluate() {
  const rows = game.fen().split(' ')[0].split('/');
  let s = 0;
  for (let r = 0; r < 8; r++) {
    let c = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) { c += +ch; continue; }
      const white = ch === ch.toUpperCase(), t = ch.toLowerCase();
      let v = VAL[t];
      if ((t === 'p' || t === 'n' || t === 'b') && c >= 2 && c <= 5 && r >= 2 && r <= 5) v += 12;   // center control
      if (t === 'p') v += (white ? 6 - r : r - 1) * 6;                                              // advanced pawns
      s += white ? v : -v;
      c++;
    }
  }
  return s;
}

// Try captures first: makes the search faster
const ordered = moves => moves.slice().sort((a, b) => (b.captured ? 1 : 0) - (a.captured ? 1 : 0));

// Minimax with alpha-beta pruning (looks `depth` moves ahead)
function search(depth, alpha, beta) {
  if (game.in_checkmate()) return game.turn() === 'w' ? -100000 - depth : 100000 + depth;
  if (game.game_over()) return 0;
  if (depth === 0) return evaluate();
  const whiteToMove = game.turn() === 'w';
  let best = whiteToMove ? -Infinity : Infinity;
  for (const m of ordered(game.moves({ verbose: true }))) {
    game.move({ from: m.from, to: m.to, promotion: m.promotion });
    const v = search(depth - 1, alpha, beta);
    game.undo();
    if (whiteToMove) { best = Math.max(best, v); alpha = Math.max(alpha, v); }
    else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (beta <= alpha) break;
  }
  return best;
}

// Easy: looks 1 move ahead and plays randomly half the time.
// Medium: looks 2 moves ahead. Hard: looks 3 moves ahead.
function pickBotMove() {
  const moves = game.moves({ verbose: true });
  if (level === 'easy' && Math.random() < 0.5) return moves[Math.floor(Math.random() * moves.length)];
  const depth = level === 'hard' ? 3 : level === 'medium' ? 2 : 1;
  const botIsWhite = game.turn() === 'w';
  let bestScore = -Infinity, best = [];
  for (const m of ordered(moves)) {
    game.move({ from: m.from, to: m.to, promotion: m.promotion });
    const v = search(depth - 1, -Infinity, Infinity);
    game.undo();
    const sc = botIsWhite ? v : -v;
    if (sc > bestScore) { bestScore = sc; best = [m]; }
    else if (sc === bestScore) best.push(m);
  }
  return best[Math.floor(Math.random() * best.length)];
}

function botTurn() {
  if (mode !== 'bot' || game.game_over() || game.turn() === human) return;
  thinking = true;
  updateStatus();
  setTimeout(() => {                                // small delay so the page can show "thinking"
    const m = pickBotMove();
    game.move({ from: m.from, to: m.to, promotion: m.promotion });
    lastMove = [m.from, m.to];
    thinking = false;
    render(); updateStatus();
  }, 80);
}

// ---------- BUTTONS ----------
function newGame() {
  game.reset();
  selected = null; targets = []; lastMove = null; thinking = false;
  flipped = mode === 'bot' && human === 'b';
  render(); updateStatus();
  botTurn();                                         // if the human plays Black, the bot opens
}
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
  if (b.disabled) return;
  mode = b.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
  document.getElementById('bot-row').style.display = mode === 'bot' ? '' : 'none';
  document.getElementById('side-row').style.display = mode === 'bot' ? '' : 'none';
  newGame();
}));
document.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => {
  level = b.dataset.level;
  document.querySelectorAll('[data-level]').forEach(x => x.classList.toggle('on', x === b));
  newGame();
}));
document.querySelectorAll('[data-side]').forEach(b => b.addEventListener('click', () => {
  human = b.dataset.side;
  document.querySelectorAll('[data-side]').forEach(x => x.classList.toggle('on', x === b));
  newGame();
}));
document.getElementById('new').onclick = newGame;
document.getElementById('undo').onclick = () => {
  if (thinking) return;
  game.undo();
  if (mode === 'bot' && game.turn() !== human) game.undo();   // take back the bot's move too
  selected = null; targets = []; lastMove = null;
  render(); updateStatus();
};
document.getElementById('flip').onclick = () => { flipped = !flipped; render(); };
newGame();