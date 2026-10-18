// ---------- STATE ----------
// All 8 ways to win (3 rows, 3 columns, 2 diagonals), as cell indexes 0-8
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
let cells, turn, over;
let mode = 'bot';      // 'bot' or 'local'
let level = 'hard';    // 'easy' or 'hard'
const score = { X:0, O:0, draw:0 };

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');

// ---------- GAME LOGIC ----------
// Returns { w: 'X' | 'O' | 'draw', line: [...] } if the game is over, otherwise null
function check(b) {
  for (const [a, c, d] of LINES) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { w:b[a], line:[a, c, d] };
  }
  return b.every(Boolean) ? { w:'draw', line:[] } : null;
}

// Minimax: tries every possible future and picks the best outcome.
// Score from the bot's ('O') view: O wins = +1, X wins = -1, draw = 0
function minimax(b, isO) {
  const r = check(b);
  if (r) return r.w === 'O' ? 1 : r.w === 'X' ? -1 : 0;
  let best = isO ? -2 : 2;
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = isO ? 'O' : 'X';        // try this move
    const s = minimax(b, !isO);
    b[i] = '';                      // undo it
    best = isO ? Math.max(best, s) : Math.min(best, s);
  }
  return best;
}

// Easy: random free cell. Hard: the move with the best minimax score.
function botMove() {
  const free = cells.map((v, i) => v ? null : i).filter(i => i !== null);
  if (level === 'easy') return free[Math.floor(Math.random() * free.length)];
  let bestScore = -2, bestMove = free[0];
  for (const i of free) {
    cells[i] = 'O';
    const s = minimax(cells, false);
    cells[i] = '';
    if (s > bestScore) { bestScore = s; bestMove = i; }
  }
  return bestMove;
}

// ---------- UI ----------
// Redraws the whole board. winLine = cells to highlight when someone wins.
function render(winLine = []) {
  boardEl.innerHTML = '';
  cells.forEach((v, i) => {
    const b = document.createElement('button');
    b.className = 'cell ' + v.toLowerCase() + (winLine.includes(i) ? ' win' : '');
    b.textContent = v;
    b.setAttribute('aria-label', 'cell ' + (i + 1));
    b.onclick = () => play(i);
    boardEl.appendChild(b);
  });
}

function turnText() {
  if (mode === 'bot') return 'Your turn (X)';
  return 'Player ' + turn + "'s turn";
}

// Called when the round ends: update scores and show the result
function finish(r) {
  over = true;
  score[r.w === 'draw' ? 'draw' : r.w]++;
  document.getElementById('sx').textContent = 'X: ' + score.X;
  document.getElementById('so').textContent = 'O: ' + score.O;
  document.getElementById('sd').textContent = 'Draws: ' + score.draw;
  if (r.w === 'draw') statusEl.textContent = "It's a draw";
  else if (mode === 'bot') statusEl.textContent = r.w === 'X' ? 'You win!' : 'Bot wins';
  else statusEl.textContent = 'Player ' + r.w + ' wins!';
  render(r.line);
}

// Called when a player clicks cell i
function play(i) {
  if (over || cells[i]) return;                  // ignore clicks after game over or on a filled cell
  if (mode === 'bot' && turn !== 'X') return;    // ignore clicks while the bot is thinking
  cells[i] = turn;
  let r = check(cells);
  if (r) return finish(r);
  turn = turn === 'X' ? 'O' : 'X';
  render();
  if (mode === 'bot') {
    statusEl.textContent = 'Bot is thinking...';
    setTimeout(() => {                           // small delay so the bot feels natural
      cells[botMove()] = 'O';
      r = check(cells);
      if (r) return finish(r);
      turn = 'X';
      statusEl.textContent = turnText();
      render();
    }, 350);
  } else {
    statusEl.textContent = turnText();
  }
}

// Start a fresh round (scores are kept)
function reset() {
  cells = Array(9).fill('');
  turn = 'X'; over = false;
  statusEl.textContent = turnText();
  render();
}

// ---------- BUTTONS ----------
// Mode buttons (vs Bot / Same device)
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
  if (b.disabled) return;
  mode = b.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
  document.getElementById('level-row').style.display = mode === 'bot' ? '' : 'none';  // bot level only matters vs bot
  reset();
}));
// Bot level buttons (Easy / Hard)
document.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => {
  level = b.dataset.level;
  document.querySelectorAll('[data-level]').forEach(x => x.classList.toggle('on', x === b));
  reset();
}));
document.getElementById('reset').onclick = reset;
reset();   // start the first round