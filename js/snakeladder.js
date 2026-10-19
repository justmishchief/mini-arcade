// ---------- CONSTANTS ----------
const COLORS = ['#ff4d4f', '#1d7bff', '#2fbf71', '#ffb020', '#9b5de5', '#ff7a1a'];
const NAMES  = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange'];
// Snakes and ladders layout generated per match
let SNAKES = {};     // head square -> tail square
let LADDERS = {};    // bottom square -> top square
let SNAKE_LOOK = {}; // aesthetic curve configuration per snake

// ---------- STATE ----------
let count = 2;                                              // number of players (2 to 6)
const seatTypes = ['human', 'bot', 'human', 'human', 'human', 'human'];
let pos = [], turn = 0, busy = false, over = false;
let gameId = 0;   // unique identifier to cancel async tasks from older sessions

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- GEOMETRIC INTERSECTION DETECTION ----------
const rowOf = n => Math.floor((n - 1) / 10);
const between = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// Counter-clockwise orientation test
function ccw(ax, ay, bx, by, cx, cy) {
  return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
}

// Checks if line segment AB intersects line segment CD
function segIntersects(p1, p2, p3, p4) {
  return ccw(p1[0], p1[1], p3[0], p3[1], p4[0], p4[1]) !== ccw(p2[0], p2[1], p3[0], p3[1], p4[0], p4[1]) &&
         ccw(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]) !== ccw(p1[0], p1[1], p2[0], p2[1], p4[0], p4[1]);
}

// Generates snakes and ladders without overlapping paths or shared squares
function makeLayout() {
  const used = new Set([1, 100]);
  SNAKES = {}; LADDERS = {}; SNAKE_LOOK = {};
  const segments = [];

  const addLine = (isSnake, nTries) => {
    for (let t = 0; t < nTries; t++) {
      let from, to;
      if (isSnake) {
        from = between(15, 98);
        to = from - between(10, 38);
      } else {
        from = between(2, 85);
        to = from + between(10, 38);
      }
      if (to < 2 || to > 99 || used.has(from) || used.has(to) || rowOf(from) === rowOf(to)) continue;

      const pA = center(from), pB = center(to);
      // Ensure the candidate path does not intersect any existing snake or ladder
      const collides = segments.some(([sA, sB]) => segIntersects(pA, pB, sA, sB));
      if (collides) continue;

      segments.push([pA, pB]);
      used.add(from); used.add(to);

      if (isSnake) {
        SNAKES[from] = to;
        SNAKE_LOOK[from] = { phase: Math.random() * 6.28, amp: 6 + Math.random() * 4, extra: 0 };
      } else {
        LADDERS[from] = to;
      }
      return true;
    }
    return false;
  };

  // Add 6 to 7 ladders and 6 to 7 snakes cleanly
  for (let i = 0; i < 7; i++) addLine(false, 300);
  for (let i = 0; i < 7; i++) addLine(true, 300);
}

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
  // At least one seat must remain human
  if (!seatTypes.slice(0, count).includes('human')) seatTypes[0] = 'human';
  const humans = seatTypes.slice(0, count).filter(t => t === 'human').length;
  const seats = $('seats');
  seats.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const row = document.createElement('div');
    row.className = 'seat';
    row.innerHTML = '<span class="dot" style="background:' + COLORS[i] + '"></span><span class="name">' + NAMES[i] + '</span>';
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
}

// ---------- BOARD GEOMETRY ----------
// Maps board square (1 to 100) to grid coordinates
function center(n) {
  const row = Math.floor((n - 1) / 10);
  let col = (n - 1) % 10;
  if (row % 2 === 1) col = 9 - col;
  return [col * 50 + 25, (9 - row) * 50 + 25];
}

function renderBoard() {
  let s = '';
  // Draw board tiles and labels
  for (let n = 1; n <= 100; n++) {
    const [cx, cy] = center(n);
    const row = Math.floor((n - 1) / 10), col = (n - 1) % 10;
    s += '<rect x="' + (cx - 25) + '" y="' + (cy - 25) + '" width="50" height="50" fill="' + ((row + col) % 2 ? '#f4f4f7' : '#e1e1e7') + '" stroke="#ffffff" stroke-width="1"/>';
    s += '<text x="' + (cx - 21) + '" y="' + (cy - 12) + '" font-size="10" fill="#0f2a4a" opacity=".6">' + n + '</text>';
  }
  // Draw ladders
  for (const [a, b] of Object.entries(LADDERS)) {
    const [x1, y1] = center(+a), [x2, y2] = center(b);
    const len = Math.hypot(x2 - x1, y2 - y1), nx = -(y2 - y1) / len * 6, ny = (x2 - x1) / len * 6;
    s += '<line x1="' + (x1 + nx) + '" y1="' + (y1 + ny) + '" x2="' + (x2 + nx) + '" y2="' + (y2 + ny) + '" stroke="#b8860b" stroke-width="4" stroke-linecap="round"/>';
    s += '<line x1="' + (x1 - nx) + '" y1="' + (y1 - ny) + '" x2="' + (x2 - nx) + '" y2="' + (y2 - ny) + '" stroke="#b8860b" stroke-width="4" stroke-linecap="round"/>';
    const rungs = Math.floor(len / 22);
    for (let k = 1; k < rungs; k++) {
      const t = k / rungs, rx = x1 + (x2 - x1) * t, ry = y1 + (y2 - y1) * t;
      s += '<line x1="' + (rx + nx) + '" y1="' + (ry + ny) + '" x2="' + (rx - nx) + '" y2="' + (ry - ny) + '" stroke="#b8860b" stroke-width="3"/>';
    }
  }
  // Draw snakes
  const SNAKE_COLORS = ['#2d9a4a', '#e5383b', '#7b2cbf', '#f08c00', '#0077b6', '#d6336c', '#2a9d8f', '#8d5524', '#5f27cd'];
  Object.entries(SNAKES).forEach(([h, t], k) => {
    const [x1, y1] = center(+h), [x2, y2] = center(t);
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const nx = -uy, ny = ux;
    const look = SNAKE_LOOK[h] || { phase: 0, amp: 8, extra: 0 };
    const waves = Math.max(2, Math.round(len / 55)) + look.extra;
    const N = 36, pts = [];
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      const off = Math.sin(f * waves * Math.PI * 2 + look.phase) * look.amp * (1 - f * 0.5);
      pts.push([x1 + (x2 - x1) * f + nx * off, y1 + (y2 - y1) * f + ny * off]);
    }
    const col = SNAKE_COLORS[k % SNAKE_COLORS.length];
    for (let i = 0; i < N; i++) {
      const w = 12 - 8 * (i / N);
      s += '<line x1="' + pts[i][0].toFixed(1) + '" y1="' + pts[i][1].toFixed(1) + '" x2="' + pts[i + 1][0].toFixed(1) + '" y2="' + pts[i + 1][1].toFixed(1) + '" stroke="' + col + '" stroke-width="' + w.toFixed(1) + '" stroke-linecap="round"/>';
      if (i % 3 === 1) s += '<circle cx="' + pts[i][0].toFixed(1) + '" cy="' + pts[i][1].toFixed(1) + '" r="' + (w * 0.22).toFixed(1) + '" fill="#ffffff" opacity=".55"/>';
    }
    const hx = pts[0][0], hy = pts[0][1];
    const dx = hx - pts[2][0], dy = hy - pts[2][1], dl = Math.hypot(dx, dy) || 1;
    const fx = dx / dl, fy = dy / dl;
    s += '<path d="M' + (hx + fx * 8) + ' ' + (hy + fy * 8) + ' L' + (hx + fx * 17) + ' ' + (hy + fy * 17) + ' M' + (hx + fx * 14) + ' ' + (hy + fy * 14) + ' l' + (-fy * 3 + fx * 3) + ' ' + (fx * 3 + fy * 3) + ' M' + (hx + fx * 14) + ' ' + (hy + fy * 14) + ' l' + (fy * 3 + fx * 3) + ' ' + (-fx * 3 + fy * 3) + '" stroke="#d90429" stroke-width="1.8" fill="none" stroke-linecap="round"/>';
    s += '<ellipse cx="' + hx.toFixed(1) + '" cy="' + hy.toFixed(1) + '" rx="10" ry="9" fill="' + col + '" stroke="#ffffff" stroke-width="1.5"/>';
    [-1, 1].forEach(sd => {
      const ex = hx + nx * 4.5 * sd + fx * 2, ey = hy + ny * 4.5 * sd + fy * 2;
      s += '<circle cx="' + ex.toFixed(1) + '" cy="' + ey.toFixed(1) + '" r="2.6" fill="#fff"/><circle cx="' + (ex + fx * 0.8).toFixed(1) + '" cy="' + (ey + fy * 0.8).toFixed(1) + '" r="1.3" fill="#111"/>';
    });
  });
  // Draw player pieces
  for (let p = 0; p < count; p++) {
    if (pos[p] < 1) continue;
    const [cx, cy] = center(pos[p]);
    const ox = (p % 3 - 1) * 11, oy = (Math.floor(p / 3) - 0.5) * 14;
    s += '<circle cx="' + (cx + ox) + '" cy="' + (cy + oy) + '" r="9" fill="' + COLORS[p] + '" stroke="#fff" stroke-width="2.5"/>';
  }
  $('board').innerHTML = s;
}

function renderCards() {
  $('pcards').innerHTML = pos.map((p, i) =>
    '<div class="pcard' + (i === turn && !over ? ' active' : '') + '"><span class="dot" style="background:' + COLORS[i] + '"></span>' +
    NAMES[i] + (seatTypes[i] === 'bot' ? ' 🤖' : '') + ' · ' + (p ? 'square ' + p : 'Start') + '</div>'
  ).join('');
}

// ---------- GAME FLOW ----------
function startGame() {
  if (!seatTypes.slice(0, count).includes('human')) return;
  gameId++;
  makeLayout();
  pos = Array(count).fill(0);
  turn = 0; busy = false; over = false;
  $('setup').style.display = 'none';
  $('game').style.display = '';
  renderBoard(); renderCards();
  nextTurn();
}

function nextTurn() {
  busy = false;
  renderCards();
  $('status').textContent = NAMES[turn] + "'s turn";
  const isBot = seatTypes[turn] === 'bot';
  $('roll').disabled = isBot;
  if (isBot) {
    const gid = gameId;
    setTimeout(() => { if (gid === gameId && !over && seatTypes[turn] === 'bot') doRoll(); }, 800);
  }
}

function humanRoll() {
  if (seatTypes[turn] === 'bot') return;
  doRoll();
}

async function doRoll() {
  if (busy || over) return;
  busy = true;
  const gid = gameId;
  const alive = async ms => { await sleep(ms); return gid === gameId; };
  $('roll').disabled = true;

  for (let i = 0; i < 6; i++) { $('dice').textContent = String.fromCharCode(9855 + 1 + Math.floor(Math.random() * 6)); if (!(await alive(70))) return; }
  const r = 1 + Math.floor(Math.random() * 6);
  $('dice').textContent = String.fromCharCode(9855 + r);
  const p = turn;
  const target = pos[p] + r;

  if (target > 100) {
    $('status').textContent = NAMES[p] + ' rolled ' + r + ' and needs an exact roll to reach 100';
    if (!(await alive(900))) return;
  } else {
    $('status').textContent = NAMES[p] + ' rolled ' + r;
    while (pos[p] < target) { pos[p]++; renderBoard(); if (!(await alive(170))) return; }

    if (SNAKES[pos[p]]) {
      $('status').textContent = '🐍 ' + NAMES[p] + ' got bitten!';
      if (!(await alive(500))) return; pos[p] = SNAKES[pos[p]]; renderBoard(); if (!(await alive(400))) return;
    } else if (LADDERS[pos[p]]) {
      $('status').textContent = '🪜 ' + NAMES[p] + ' climbs a ladder!';
      if (!(await alive(500))) return; pos[p] = LADDERS[pos[p]]; renderBoard(); if (!(await alive(400))) return;
    }
    if (pos[p] === 100) {
      over = true;
      renderCards();
      $('status').textContent = '🎉 ' + NAMES[p] + ' wins!';
      return;
    }
  }
  if (r !== 6) turn = (turn + 1) % count;
  else $('status').textContent = NAMES[p] + ' rolled a 6: roll again!';
  if (!(await alive(r === 6 ? 600 : 100))) return;
  nextTurn();
}

// ---------- CONTROLS ----------
$('start').onclick = startGame;
$('roll').onclick = humanRoll;
$('dice').onclick = () => { if (!$('roll').disabled) humanRoll(); };
$('again').onclick = startGame;
$('change').onclick = () => { gameId++; over = true; $('game').style.display = 'none'; $('setup').style.display = ''; };
renderSetup();