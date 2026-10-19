// =====================================================================
//  LUDO. 2 to 4 players use the classic cross board (4 arms).
//  5 or 6 players use a star board (6 arms). Same rules on both.
// =====================================================================

// ---------- BOARD SHAPE ----------
// Every arm has 3 lanes. The track goes OUT along one side lane (6 squares), across the end (1 square)
// and back IN along the other side lane (6 squares): 13 squares per arm.
// The middle lane of an arm is that colour's private home column (5 squares).
const PER_ARM = 13;
const COLORS4 = ['#e63946', '#2fbf71', '#ffb020', '#1d7bff'];                      // arms go clockwise, starting at the bottom
const NAMES4  = ['Red', 'Green', 'Yellow', 'Blue'];
const COLORS6 = ['#e63946', '#ff7a1a', '#ffb020', '#2fbf71', '#1d7bff', '#9b5de5'];
const NAMES6  = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];
// Which arms are used (2 players sit opposite each other)
const ARM_SETS = { 2:[0, 2], 3:[0, 1, 2], 4:[0, 1, 2, 3], 5:[0, 1, 2, 3, 4], 6:[0, 1, 2, 3, 4, 5] };
const CX = 300, CY = 300;                                // center of the 600 x 600 drawing

// ---------- STATE ----------
let count = 2, level = 'hard';
const seatTypes = ['human', 'bot', 'human', 'human', 'human', 'human'];
let A = 4, L = 52, FIN = 56, W = 36, R0 = 54;            // arms, ring length, finish value, square size, distance of arms from center
let arms = [], tokens = [], turn = 0, roll = null;
let busy = false, over = false, waiting = false, legal = [], gameId = 0;
// Token "progress": -1 = in the yard, 0 to L-2 = on the ring (0 = its start square),
// L-1 to L+3 = in its home column, FIN (= L+4) = finished.

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const colorsFor = n => n <= 4 ? COLORS4 : COLORS6;
const namesFor = n => n <= 4 ? NAMES4 : NAMES6;

// ---------- SETUP SCREEN ----------
function renderSetup() {
  const cb = $('count-btns');
  cb.innerHTML = '';
  for (let n = 2; n <= 6; n++) {
    const b = document.createElement('button');
    b.textContent = n;
    if (n === count) b.className = 'on';
    b.onclick = () => { count = n; renderSetup(); };
    cb.appendChild(b);
  }
  // At least one seat must stay Human (the game cannot be bots-only)
  if (!seatTypes.slice(0, count).includes('human')) seatTypes[0] = 'human';
  const humans = seatTypes.slice(0, count).filter(t => t === 'human').length;
  const seats = $('seats');
  seats.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const arm = ARM_SETS[count][i];
    const row = document.createElement('div');
    row.className = 'seat';
    row.innerHTML = '<span class="dot" style="background:' + colorsFor(count)[arm] + '"></span><span class="name">' + namesFor(count)[arm] + '</span>';
    ['human', 'bot'].forEach(t => {
      const b = document.createElement('button');
      b.textContent = t === 'human' ? 'Human' : 'Bot 🤖';
      if (seatTypes[i] === t) b.className = 'on';
      if (t === 'bot' && seatTypes[i] === 'human' && humans === 1) { b.disabled = true; b.title = 'At least one human player is needed'; }
      b.onclick = () => { seatTypes[i] = t; renderSetup(); };
      row.appendChild(b);
    });
    seats.appendChild(row);
  }
  $('board-note').textContent = count <= 4 ? 'Classic cross board.' : 'Star board for 5 to 6 players.';
}
document.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => {
  level = b.dataset.level;
  document.querySelectorAll('[data-level]').forEach(x => x.classList.toggle('on', x === b));
}));

// ---------- GEOMETRY ----------
const armOf = p => arms[p];
const colorOf = p => colorsFor(count)[armOf(p)];
const nameOf = p => namesFor(count)[armOf(p)];
const startIdx = k => k * PER_ARM + 8;                   // a colour starts on the 9th square of its own arm
const phi = k => Math.PI / 2 + k * 2 * Math.PI / A;      // direction of arm k (arm 0 points down)
// Is this ring square safe from capture? (the start squares, and the star squares)
const isSafe = i => { const j = i % PER_ARM; return j === 8 || j === 3; };

// A point inside arm k: lat = -1 / 0 / +1 picks the lane, row = 0 (near the center) to 5 (outer end)
function armPoint(k, lat, row) {
  const a = phi(k), ax = R0 + (row + 0.5) * W, lt = lat * W;
  return [CX + ax * Math.cos(a) - lt * Math.sin(a), CY + ax * Math.sin(a) + lt * Math.cos(a)];
}
function ringXY(i) {
  const k = Math.floor(i / PER_ARM), j = i % PER_ARM;
  if (j <= 5) return armPoint(k, -1, j);                 // out along one side lane
  if (j === 6) return armPoint(k, 0, 5);                 // across the outer end
  return armPoint(k, 1, 5 - (j - 7));                    // back in along the other side lane
}
const homeXY = (k, c) => armPoint(k, 0, 4 - c);          // home column square c (0 = outermost)
const ringIdx = (p, pr) => (startIdx(armOf(p)) + pr) % L;

function yardCenter(k) {
  const a = phi(k) + Math.PI / A, t = A === 4 ? 6.36 * W : 6.6 * W;
  return [CX + t * Math.cos(a), CY + t * Math.sin(a)];
}
function yardSlot(k, t) {
  const [x, y] = yardCenter(k), d = A === 4 ? 0.95 * W : 0.7 * W;
  return [x + (t % 2 ? d : -d), y + (t < 2 ? -d : d)];
}
function finishSlot(k, t) {                              // finished tokens rest inside the colour's triangle
  const a = phi(k), ax = A === 4 ? 0.95 * W : 1.7 * W, lt = (t - 1.5) * (A === 4 ? 0.4 : 0.45) * W;
  return [CX + ax * Math.cos(a) - lt * Math.sin(a), CY + ax * Math.sin(a) + lt * Math.cos(a)];
}
function tokenXY(p, t) {
  const pr = tokens[p][t], k = armOf(p);
  if (pr === -1) return yardSlot(k, t);
  if (pr === FIN) return finishSlot(k, t);
  if (pr <= L - 2) return ringXY(ringIdx(p, pr));
  return homeXY(k, pr - (L - 1));
}

// ---------- RULES ----------
function legalMoves(p, r) {
  const out = [];
  tokens[p].forEach((pr, t) => {
    if (pr === FIN) return;
    if (pr === -1) { if (r === 6) out.push(t); }         // leaving the yard needs a 6
    else if (pr + r <= FIN) out.push(t);                 // cannot overshoot the finish
  });
  return out;
}

// Move the token. Landing on an opponent (on a square that is not safe) sends it back to its yard.
function applyMove(p, t, r) {
  const pr = tokens[p][t], np = pr === -1 ? 0 : pr + r;
  tokens[p][t] = np;
  let captured = false;
  if (np <= L - 2) {
    const i = ringIdx(p, np);
    if (!isSafe(i)) {
      for (let q = 0; q < count; q++) {
        if (q === p) continue;
        tokens[q].forEach((qpr, u) => {
          if (qpr >= 0 && qpr <= L - 2 && ringIdx(q, qpr) === i) { tokens[q][u] = -1; captured = true; }
        });
      }
    }
  }
  return captured;
}

// ---------- BOT BRAIN ----------
function scoreMove(p, t, r) {
  const pr = tokens[p][t], np = pr === -1 ? 0 : pr + r;
  let s = 0;
  if (np === FIN) s += 90;
  else if (np >= L - 1) s += 40;                         // reached the safe home column
  if (pr === -1) s += 60;                                // bringing a new token out is good
  if (np <= L - 2) {
    const i = ringIdx(p, np), safe = isSafe(i);
    for (let q = 0; q < count; q++) {
      if (q === p) continue;
      tokens[q].forEach(qpr => {
        if (qpr < 0 || qpr > L - 2) return;
        const qi = ringIdx(q, qpr);
        if (!safe && qi === i) s += 100;                 // capture!
        const d = (i - qi + L) % L;
        if (!safe && d >= 1 && d <= 6) s -= 20;          // an enemy is close behind: risky
      });
    }
    if (safe) s += 15;
  }
  return s + np * 0.5;                                   // prefer moving the leading token
}
function chooseBot(opts) {
  const random = () => opts[Math.floor(Math.random() * opts.length)];
  const smart = () => opts.slice().sort((a, b) => scoreMove(turn, b, roll) - scoreMove(turn, a, roll))[0];
  if (level === 'easy') return random();
  if (level === 'medium') return Math.random() < 0.5 ? smart() : random();
  return smart();
}

// ---------- DRAWING ----------
const deg = k => (phi(k) - Math.PI / 2) * 180 / Math.PI;

function square(x, y, k, fill, stroke) {
  return '<rect x="' + (-W / 2 + 1.5) + '" y="' + (-W / 2 + 1.5) + '" width="' + (W - 3) + '" height="' + (W - 3) + '" rx="6" fill="' + fill + '" stroke="' + (stroke || 'rgba(0,0,0,.18)') +
    '" transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + deg(k).toFixed(1) + ')"/>';
}

function renderBoard() {
  const used = arms, cols = colorsFor(count);
  let s = '';
  // board base
  if (A === 4) s += '<rect x="' + (CX - 7.5 * W - 10) + '" y="' + (CY - 7.5 * W - 10) + '" width="' + (15 * W + 20) + '" height="' + (15 * W + 20) + '" rx="28" fill="rgba(255,255,255,.55)" stroke="#fff" stroke-width="2"/>';
  else s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + (8.9 * W + 8) + '" fill="rgba(255,255,255,.55)" stroke="#fff" stroke-width="2"/>';

  // yards (the waiting areas), one per arm, between that arm and the next one
  for (let k = 0; k < A; k++) {
    const [yx, yy] = yardCenter(k), col = used.includes(k) ? cols[k] : '#c7c7cc';
    if (A === 4) s += '<rect x="' + (yx - 2.35 * W) + '" y="' + (yy - 2.35 * W) + '" width="' + 4.7 * W + '" height="' + 4.7 * W + '" rx="22" fill="' + col + '" opacity=".35"/>';
    else s += '<circle cx="' + yx.toFixed(1) + '" cy="' + yy.toFixed(1) + '" r="' + 1.75 * W + '" fill="' + col + '" opacity=".35"/>';
    for (let t = 0; t < 4; t++) { const [sx, sy] = yardSlot(k, t); s += '<circle cx="' + sx.toFixed(1) + '" cy="' + sy.toFixed(1) + '" r="' + 0.42 * W + '" fill="#fff" opacity=".8"/>'; }
  }
  // ring squares
  for (let i = 0; i < L; i++) {
    const [x, y] = ringXY(i), k = Math.floor(i / PER_ARM), j = i % PER_ARM;
    const startOfUsed = j === 8 && used.includes(k);
    s += square(x, y, k, startOfUsed ? cols[k] : '#ffffff');
    if (j === 3 || (j === 8 && !startOfUsed)) s += '<text x="' + x.toFixed(1) + '" y="' + (y + 5).toFixed(1) + '" text-anchor="middle" font-size="' + (W * 0.5).toFixed(0) + '" fill="#8e8e93">★</text>';
    if (startOfUsed) s += '<text x="' + x.toFixed(1) + '" y="' + (y + 5).toFixed(1) + '" text-anchor="middle" font-size="' + (W * 0.45).toFixed(0) + '" fill="#fff">★</text>';
  }
  // home columns
  for (let k = 0; k < A; k++) {
    for (let c = 0; c < 5; c++) {
      const [x, y] = homeXY(k, c);
      s += square(x, y, k, used.includes(k) ? cols[k] : '#e5e5ea', 'rgba(0,0,0,.12)').replace('<rect', '<rect opacity="' + (used.includes(k) ? 0.6 : 1) + '"');
    }
  }
  // center: one triangle per arm
  for (let k = 0; k < A; k++) {
    const a = phi(k), ux = Math.cos(a), uy = Math.sin(a), vx = -Math.sin(a), vy = Math.cos(a);
    const p1 = [CX + R0 * ux + 1.5 * W * vx, CY + R0 * uy + 1.5 * W * vy], p2 = [CX + R0 * ux - 1.5 * W * vx, CY + R0 * uy - 1.5 * W * vy];
    s += '<polygon points="' + CX + ',' + CY + ' ' + p1.map(n => n.toFixed(1)).join(',') + ' ' + p2.map(n => n.toFixed(1)).join(',') + '" fill="' + (used.includes(k) ? cols[k] : '#d1d1d6') + '" stroke="#fff" stroke-width="2"/>';
  }

  // tokens (yard, ring, home column and finished all live on the board)
  const stack = {};
  for (let p = 0; p < count; p++) {
    tokens[p].forEach((pr, t) => {
      const [x, y] = tokenXY(p, t);
      const key = x.toFixed(0) + ',' + y.toFixed(0), n = stack[key] = (stack[key] || 0) + 1;
      const ox = pr === -1 || pr === FIN ? 0 : (n - 1) * 5, oy = pr === -1 || pr === FIN ? 0 : -(n - 1) * 5;   // stacked tokens stay visible
      const isLegal = waiting && p === turn && legal.includes(t);
      const r = (pr === FIN ? 0.3 : 0.38) * W;
      s += '<g class="tk' + (isLegal ? ' legal' : '') + '" data-t="' + t + '">' +
        '<circle cx="' + (x + ox).toFixed(1) + '" cy="' + (y + oy).toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + colorOf(p) + '" stroke="' + (isLegal ? '#1d1d1f' : '#fff') + '" stroke-width="' + (isLegal ? 4 : 2.5) + '"/>' +
        '<circle cx="' + (x + ox - r * 0.3).toFixed(1) + '" cy="' + (y + oy - r * 0.3).toFixed(1) + '" r="' + (r * 0.3).toFixed(1) + '" fill="#fff" opacity=".4"/></g>';
    });
  }
  $('board').innerHTML = s;
  document.querySelectorAll('#board .tk.legal').forEach(el => el.onclick = () => pick(+el.dataset.t));
}

function renderCards() {
  $('pcards').innerHTML = tokens.map((tk, p) => {
    const done = tk.filter(pr => pr === FIN).length;
    return '<div class="pcard' + (p === turn && !over ? ' active' : '') + '"><span class="dot" style="background:' + colorOf(p) + '"></span>' +
      nameOf(p) + (seatTypes[p] === 'bot' ? ' 🤖' : '') + ' · home ' + done + '/4</div>';
  }).join('');
}

// ---------- GAME FLOW ----------
function startGame() {
  if (!seatTypes.slice(0, count).includes('human')) return;   // never start a bots-only game
  gameId++;
  A = count <= 4 ? 4 : 6;
  L = A * PER_ARM; FIN = L + 4;
  W = A === 4 ? 36 : 31;
  R0 = A === 4 ? 1.5 * W : 3 * Math.cos(Math.PI / 6) * W;
  arms = ARM_SETS[count];
  tokens = Array.from({ length: count }, () => [-1, -1, -1, -1]);
  turn = 0; roll = null; busy = false; over = false; waiting = false; legal = [];
  $('setup').style.display = 'none';
  $('game').style.display = '';
  nextTurn();
}

function nextTurn() {
  busy = false; waiting = false; legal = []; roll = null;
  renderBoard(); renderCards();
  $('status').textContent = nameOf(turn) + "'s turn";
  const isBot = seatTypes[turn] === 'bot';
  $('roll').disabled = isBot;
  if (isBot) {
    const gid = gameId;
    setTimeout(() => { if (gid === gameId && !over && seatTypes[turn] === 'bot') doRoll(); }, 700);
  }
}

// A human clicked the dice: ignore it if it is a bot's turn
function humanRoll() {
  if (seatTypes[turn] === 'bot') return;
  doRoll();
}

async function doRoll() {
  if (busy || over || waiting || roll !== null) return;
  busy = true;
  const gid = gameId;
  const alive = async ms => { await sleep(ms); return gid === gameId; };   // false if a new game started meanwhile
  $('roll').disabled = true;
  for (let i = 0; i < 6; i++) { $('dice').textContent = String.fromCharCode(9855 + 1 + Math.floor(Math.random() * 6)); if (!(await alive(70))) return; }
  roll = 1 + Math.floor(Math.random() * 6);
  $('dice').textContent = String.fromCharCode(9855 + roll);
  legal = legalMoves(turn, roll);

  if (!legal.length) {                                   // nothing can move: pass the turn
    $('status').textContent = nameOf(turn) + ' rolled ' + roll + ': no move';
    if (!(await alive(900))) return;
    turn = (turn + 1) % count;
    return nextTurn();
  }
  const isBot = seatTypes[turn] === 'bot';
  if (isBot || legal.length === 1) {                     // bots choose; a single option is played automatically
    $('status').textContent = nameOf(turn) + ' rolled ' + roll;
    if (!(await alive(600))) return;
    return doMove(isBot ? chooseBot(legal) : legal[0]);
  }
  waiting = true; busy = false;                          // human must pick a token
  $('status').textContent = nameOf(turn) + ' rolled ' + roll + ': tap a glowing token';
  renderBoard(); renderCards();
}

// A human clicked a highlighted token
function pick(t) {
  if (!waiting || !legal.includes(t)) return;
  waiting = false; busy = true;
  doMove(t);
}

async function doMove(t) {
  const p = turn, gid = gameId;
  const captured = applyMove(p, t, roll);
  legal = [];
  renderBoard(); renderCards();
  if (tokens[p].every(pr => pr === FIN)) {
    over = true; renderCards();
    $('status').textContent = '🎉 ' + nameOf(p) + ' wins!';
    return;
  }
  const extra = roll === 6 || captured;                  // a 6 or a capture gives another turn
  if (captured) $('status').textContent = nameOf(p) + ' captured a token!';
  await sleep(600);
  if (gid !== gameId) return;
  if (!extra) turn = (turn + 1) % count;
  nextTurn();
}

// ---------- BUTTONS ----------
$('start').onclick = startGame;
$('roll').onclick = humanRoll;
$('dice').onclick = () => { if (!$('roll').disabled) humanRoll(); };
$('again').onclick = startGame;
$('change').onclick = () => { gameId++; over = true; $('game').style.display = 'none'; $('setup').style.display = ''; };
renderSetup();