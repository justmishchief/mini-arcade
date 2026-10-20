// ---------- STATE ----------
// All 8 ways to win (3 rows, 3 columns, 2 diagonals), as cell indexes 0-8
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
let cells, turn, over;
let mode = 'bot';      // 'bot', 'local', or 'online'
let level = 'medium';  // 'easy', 'medium' or 'hard'
const score = { X:0, O:0, draw:0 };
let roundId = 0;       // changes every round, so a late bot move from an old round is ignored
let skill = 0.5;       // how well the human plays (0 = badly, 1 = perfectly). The Medium bot adapts to this.

// ---------- ONLINE STATE ----------
let onlineManager = null;
let myRole = 'X'; // Host = 'X', Guest = 'O'

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

function freeCells() { return cells.map((v, i) => v ? null : i).filter(i => i !== null); }

// The strongest move for the bot (full brain)
function bestBotMove() {
  let bestScore = -2, bestMoves = [];
  for (const i of freeCells()) {
    cells[i] = 'O';
    const s = minimax(cells, false);
    cells[i] = '';
    if (s > bestScore) { bestScore = s; bestMoves = [i]; }
    else if (s === bestScore) bestMoves.push(i);
  }
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

// Was the human's move one of the best available moves? Used to measure the human's level.
function humanMoveWasBest(i) {
  const scoreOf = k => { cells[k] = 'X'; const s = minimax(cells, true); cells[k] = ''; return s; };
  const best = Math.min(...freeCells().map(scoreOf));   // X wants the lowest score
  return scoreOf(i) === best;
}

// Chance that the bot plays its best move this turn:
//   Easy   = 30% of the time (otherwise a random move)
//   Medium = depends on how well the human has been playing (25% to 95%)
//   Hard   = always
function botMove() {
  let p = 1;
  if (level === 'easy') p = 0.3;
  else if (level === 'medium') p = 0.25 + 0.7 * skill;
  if (Math.random() < p) return bestBotMove();
  const free = freeCells();
  return free[Math.floor(Math.random() * free.length)];
}

// Small line under the level buttons
function updateNote() {
  const note = document.getElementById('level-note');
  if (!note) return;
  if (mode !== 'bot') { note.textContent = ''; return; }
  if (level === 'easy') note.textContent = 'Easy: the bot plays smart only now and then.';
  else if (level === 'hard') note.textContent = 'Hard: the bot uses its full brain. You can only draw.';
  else note.textContent = 'Medium: the bot matches your level (it thinks you play at ' + Math.round(skill * 100) + '%).';
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
  if (mode === 'online') {
    return turn === myRole ? 'Your turn (' + myRole + ')' : "Opponent's turn (" + turn + ')...';
  }
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
  else if (mode === 'online') statusEl.textContent = r.w === myRole ? '🎉 You win!' : 'Opponent wins!';
  else if (mode === 'bot') statusEl.textContent = r.w === 'X' ? 'You win!' : 'Bot wins';
  else statusEl.textContent = 'Player ' + r.w + ' wins!';
  
  if (window.ArcadeAuth) ArcadeAuth.recordGamePlay();
  render(r.line);
}

// Called when a player clicks cell i
function play(i, fromRemote = false) {
  if (over || cells[i]) return;                  // ignore clicks after game over or on a filled cell
  if (mode === 'bot' && turn !== 'X') return;    // ignore clicks while the bot is thinking
  if (mode === 'online' && !fromRemote && turn !== myRole) return; // not your turn online

  if (mode === 'bot') {                          // measure how good the human's move is (Medium bot uses this)
    skill = 0.7 * skill + 0.3 * (humanMoveWasBest(i) ? 1 : 0);
    updateNote();
  }
  cells[i] = turn;

  if (mode === 'online' && !fromRemote) {
    onlineManager.sendMove({ type: 'move', index: i });
  }

  let r = check(cells);
  if (r) return finish(r);
  turn = turn === 'X' ? 'O' : 'X';
  render();

  if (mode === 'bot') {
    statusEl.textContent = 'Bot is thinking...';
    const rid = roundId;
    setTimeout(() => {                           // small delay so the bot feels natural
      if (rid !== roundId) return;               // the round was restarted meanwhile
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
function reset(fromRemote = false) {
  roundId++;
  cells = Array(9).fill('');
  turn = 'X'; over = false;
  statusEl.textContent = turnText();
  updateNote();
  render();

  if (mode === 'online' && !fromRemote && onlineManager) {
    onlineManager.sendMove({ type: 'reset' });
  }
}

// ---------- ONLINE ROOM CONNECTION ----------
function setupOnline() {
  onlineManager = new OnlineManager('tictactoe', {
    onPlayerJoined: () => {
      showGame();
      document.getElementById('online-wait-msg').style.display = 'none';
      myRole = 'X';
      reset(true);
      statusEl.textContent = "🎮 Opponent connected! Your turn (X)";
    },
    onMoveReceived: (data) => {
      if (data.type === 'move') {
        play(data.index, true);
      } else if (data.type === 'reset') {
        reset(true);
      }
    },
    onRoomReady: (playerNum) => {
      myRole = playerNum === 0 ? 'X' : 'O';
      if (!onlineManager.isHost) {
        showGame();
        document.getElementById('online-wait-msg').style.display = 'none';
        reset(true);
        statusEl.textContent = "🎮 Connected to Host! Opponent's turn (X)...";
      }
    }
  });

  document.getElementById('btn-create-room').onclick = async () => {
    if (window.ArcadeAuth && !ArcadeAuth.canPlay()) return;
    const btn = document.getElementById('btn-create-room');
    btn.disabled = true;
    btn.textContent = "Creating...";
    const code = await onlineManager.createRoom();
    if (code) {
      document.getElementById('disp-room-code').textContent = code;
      document.getElementById('online-wait-msg').style.display = 'block';
    } else {
      btn.disabled = false;
      btn.textContent = "Create Room";
    }
  };

  document.getElementById('btn-join-room').onclick = async () => {
    if (window.ArcadeAuth && !ArcadeAuth.canPlay()) return;
    const code = document.getElementById('join-code-input').value.trim();
    if (code.length !== 4) return alert("Please enter a 4-character code!");
    const btn = document.getElementById('btn-join-room');
    btn.disabled = true;
    btn.textContent = "...";
    const ok = await onlineManager.joinRoom(code);
    if (!ok) {
      btn.disabled = false;
      btn.textContent = "Join";
    }
  };
}

// ---------- BUTTONS ----------
// Mode buttons (vs Bot / Same device / Online)
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
  if (b.disabled) return;
  mode = b.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
  document.getElementById('level-row').style.display = mode === 'bot' ? '' : 'none';
  document.getElementById('online-opts').style.display = mode === 'online' ? '' : 'none';
  
  if (mode !== 'online' && onlineManager) {
    onlineManager.disconnect();
    document.getElementById('online-wait-msg').style.display = 'none';
    document.getElementById('btn-create-room').disabled = false;
    document.getElementById('btn-create-room').textContent = "Create Room";
    document.getElementById('btn-join-room').disabled = false;
    document.getElementById('btn-join-room').textContent = "Join";
  }
  document.getElementById('start-row').style.display = mode === 'online' ? 'none' : '';
  reset();
}));

// Bot level buttons (Easy / Medium / Hard)
document.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => {
  level = b.dataset.level;
  document.querySelectorAll('[data-level]').forEach(x => x.classList.toggle('on', x === b));
  updateNote();
}));

document.getElementById('reset').onclick = () => reset();

// ---------- SETTINGS FIRST, THEN THE GAME ----------
function showGame() {
  document.getElementById('setup').style.display = 'none';
  document.getElementById('game').style.display = '';
}
function showSetup() {
  document.getElementById('game').style.display = 'none';
  document.getElementById('setup').style.display = '';
}
document.getElementById('start').onclick = () => {
  if (window.ArcadeAuth && !ArcadeAuth.canPlay()) return;   // same guest-pass check as before
  showGame();
  reset();
};
document.getElementById('change').onclick = () => {
  roundId++;                                               // cancel any bot move that is still pending
  if (mode === 'online' && onlineManager) {
    onlineManager.disconnect();
    document.getElementById('online-wait-msg').style.display = 'none';
    document.getElementById('btn-create-room').disabled = false;
    document.getElementById('btn-create-room').textContent = "Create Room";
    document.getElementById('btn-join-room').disabled = false;
    document.getElementById('btn-join-room').textContent = "Join";
  }
  showSetup();
};

reset();   // start the first round
setupOnline();