// =====================================================================
//  CARROM: 2-Player Physics, Rules, AI Engine, and Canvas Controls
// =====================================================================

// ---------- CONSTANTS ----------
const SIZE = 600, FRAME = 10;                 // 600x600 board with 10px frame boundary
const CR = 13, SR = 17;                       // coin radius, striker radius
const MC = 1, MS = 1.5;                       // coin mass, striker mass
const FRICTION = 0.975;                       // linear velocity decay per frame
const WALL_E = 0.75, COIN_E = 0.95;           // restitution factors
const SUB = 4;                                // physics substeps per update cycle
const MAXV = 26;                              // maximum strike impulse
const POCKETS = [[24, 24], [576, 24], [24, 576], [576, 576]], POCKET_R = 26;
const T_MIN = 100, T_MAX = 500;               // horizontal striker slider bounds
const LINE_NEAR = 506, LINE_FAR = 94;         // baselines for bottom and top players

// ---------- ONLINE STATE ----------
let isOnline = false;
let onlineManager = null;
let myRole = 0; // 0 = Player 1 (White, Bottom), 1 = Player 2 (Black, Top)

// ---------- STATE ----------
let nSeats = 2;
let seatSide = [0, 2];                        // 0 = bottom, 2 = top
let seatColor = ['w', 'b'];                   // white for bottom, black for top
let coins = [];                               // active coins array
let striker = { x: 300, y: LINE_NEAR, vx: 0, vy: 0, r: SR, m: MS, in: false };
let cur = 0;                                  // active player seat index
let potted = { w: 0, b: 0 };
let queenState = 'board';                     // 'board', 'pending', or 'covered'
let queenOwner = -1;                          // seat index attempting cover
let shotCoins = [];                           // coins sunk in the current shot
let winnerColor = null;

function strikerSpot(side, t) {
  return side === 0 ? [t, LINE_NEAR] : [t, LINE_FAR];
}

// ---------- BOARD GENERATION ----------
function newBoard() {
  const list = [];
  const add = (x, y, type) => list.push({ x, y, vx: 0, vy: 0, r: CR, m: MC, type, in: false });
  const c = SIZE / 2;
  add(c, c, 'q');
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3 - Math.PI / 2;
    add(c + 27 * Math.cos(a), c + 27 * Math.sin(a), k % 2 === 0 ? 'w' : 'b');
  }
  for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6 - Math.PI / 2;
    const r = k % 2 === 0 ? 54 : 46;
    add(c + r * Math.cos(a), c + r * Math.sin(a), k % 2 === 0 ? 'w' : 'b');
  }
  return list;
}

// ---------- PHYSICS ENGINE ----------
function collide(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
  if (d >= min || d === 0) return;
  const nx = dx / d, ny = dy / d;
  const overlap = min - d, tm = a.m + b.m;
  a.x -= nx * overlap * (b.m / tm); a.y -= ny * overlap * (b.m / tm);
  b.x += nx * overlap * (a.m / tm); b.y += ny * overlap * (a.m / tm);
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel >= 0) return;
  const j = -(1 + COIN_E) * rel / (1 / a.m + 1 / b.m);
  a.vx -= j / a.m * nx; a.vy -= j / a.m * ny;
  b.vx += j / b.m * nx; b.vy += j / b.m * ny;
}

function stepPhysics() {
  const bodies = [striker, ...coins.filter(c => !c.in)];
  for (let s = 0; s < SUB; s++) {
    for (const b of bodies) {
      if (b.in) continue;
      b.x += b.vx / SUB; b.y += b.vy / SUB;
      const lo = FRAME + b.r, hi = SIZE - FRAME - b.r;
      if (b.x < lo) { b.x = lo; b.vx = -b.vx * WALL_E; }
      if (b.x > hi) { b.x = hi; b.vx = -b.vx * WALL_E; }
      if (b.y < lo) { b.y = lo; b.vy = -b.vy * WALL_E; }
      if (b.y > hi) { b.y = hi; b.vy = -b.vy * WALL_E; }
    }
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        if (!bodies[i].in && !bodies[j].in) collide(bodies[i], bodies[j]);
      }
    }
    for (const b of bodies) {
      if (b.in) continue;
      for (const [px, py] of POCKETS) {
        if (Math.hypot(b.x - px, b.y - py) < POCKET_R) {
          b.in = true; b.vx = b.vy = 0;
          if (b !== striker) shotCoins.push(b);
          break;
        }
      }
    }
  }
  let moving = false;
  for (const b of bodies) {
    if (b.in) continue;
    b.vx *= FRICTION; b.vy *= FRICTION;
    if (Math.hypot(b.vx, b.vy) < 0.08) b.vx = b.vy = 0; else moving = true;
  }
  return moving;
}

function shoot(vx, vy) {
  striker.vx = vx; striker.vy = vy;
  shotCoins = [];
}

function respot(coin) {
  const free = (x, y) => Math.hypot(x - striker.x, y - striker.y) > SR + CR + 2 &&
    coins.every(o => o === coin || o.in || Math.hypot(o.x - x, o.y - y) > 2 * CR + 1);
  for (let r = 0; r < 260; r += 6) {
    for (let a = 0; a < 6.28; a += 0.5) {
      const x = SIZE / 2 + r * Math.cos(a), y = SIZE / 2 + r * Math.sin(a);
      if (free(x, y)) { coin.x = x; coin.y = y; coin.vx = coin.vy = 0; coin.in = false; return; }
    }
  }
  coin.x = SIZE / 2; coin.y = SIZE / 2; coin.in = false;
}

function resolveShot() {
  const mine = seatColor[cur], other = mine === 'w' ? 'b' : 'w';
  const queen = coins.find(c => c.type === 'q');
  const types = shotCoins.map(c => c.type);
  const ownPots = types.filter(t => t === mine).length;
  const othPots = types.filter(t => t === other).length;
  const queenPot = types.includes('q');
  let msg = '', extra = false;

  if (striker.in) {
    msg = 'Foul! Striker pocketed.';
    shotCoins.forEach(respot);
    if (potted[mine] > 0) {
      const back = coins.find(c => c.in && c.type === mine);
      if (back) { respot(back); potted[mine]--; msg += ' One coin returned as penalty.'; }
    }
    if (queenState === 'pending' && queenOwner === cur) { respot(queen); queenState = 'board'; }
  } else {
    if (queenState === 'pending' && queenOwner === cur) {
      if (ownPots > 0) { queenState = 'covered'; msg += 'Queen covered! '; }
      else { respot(queen); queenState = 'board'; msg += 'Queen not covered, returned to center. '; }
    }
    if (queenPot) {
      queenOwner = cur;
      if (ownPots > 0) { queenState = 'covered'; msg += 'Queen and coin pocketed: Queen secured! '; }
      else { queenState = 'pending'; msg += 'Queen pocketed! Cover it on your next shot. '; }
      extra = true;
    }
    if (ownPots > 0) extra = true;
    potted[mine] += ownPots; potted[other] += othPots;
    if (othPots > 0) msg += 'Pocketed opponent coin. ';

    for (const col of [mine, other]) {
      if (potted[col] === 9) {
        if (queenState === 'covered') winnerColor = col;
        else {
          const back = coins.find(c => c.in && c.type === col);
          if (back) { respot(back); potted[col]--; msg += 'Need Queen covered to win! '; }
        }
      }
    }
  }
  if (!winnerColor && !extra) cur = (cur + 1) % nSeats;
  return { msg: msg.trim(), extra, winner: winnerColor };
}

// ---------- BOT AI ENGINE ----------
function pointSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function planShot(seat, lvl) {
  const side = seatSide[seat], color = seatColor[seat];
  const live = coins.filter(c => !c.in);
  const own = live.filter(c => c.type === color);
  const targets = own.concat(live.filter(c => c.type === 'q'));
  const spots = [];

  for (let t = T_MIN; t <= T_MAX; t += 20) {
    const [sx, sy] = strikerSpot(side, t);
    if (!live.some(o => Math.hypot(o.x - sx, o.y - sy) < SR + CR + 2)) spots.push([t, sx, sy]);
  }
  let best = null;

  for (const [t, sx, sy] of spots) {
    for (const c of targets) {
      for (const [px, py] of POCKETS) {
        let ux = px - c.x, uy = py - c.y;
        const dc = Math.hypot(ux, uy);
        if (dc < 1) continue;
        ux /= dc; uy /= dc;
        const gx = c.x - ux * (CR + SR), gy = c.y - uy * (CR + SR);
        if (gx < FRAME + SR || gx > SIZE - FRAME - SR || gy < FRAME + SR || gy > SIZE - FRAME - SR) continue;
        const dx = gx - sx, dy = gy - sy, dg = Math.hypot(dx, dy);
        if (dg < 1) continue;
        const cos = (dx / dg) * ux + (dy / dg) * uy;
        if (cos < 0.45) continue;

        let blocked = false;
        for (const o of live) {
          if (o === c) continue;
          if (pointSegDist(o.x, o.y, sx, sy, gx, gy) < CR + SR) { blocked = true; break; }
          if (pointSegDist(o.x, o.y, c.x, c.y, px, py) < 2 * CR) { blocked = true; break; }
        }
        if (blocked) continue;
        const score = cos * 60 - (dg + dc) * 0.12 + (c.type === 'q' ? 6 : 0);
        if (!best || score > best.score) best = { score, t, sx, sy, gx, gy, dg, dc, cos };
      }
    }
  }

  const noise = { easy: [0.2, 0.3], medium: [0.05, 0.12], hard: [0.02, 0.07] }[lvl];
  let t, sx, sy, angle, speed;
  if (best && !(lvl === 'easy' && Math.random() < 0.35)) {
    ({ t, sx, sy } = best);
    angle = Math.atan2(best.gy - sy, best.gx - sx);
    const vHit = (0.025 * best.dc + 1.3) / (1.14 * best.cos);
    speed = Math.min(MAXV, (vHit + 0.025 * best.dg) * 1.1 + 1);
  } else {
    const spot = spots.length ? spots[Math.floor(Math.random() * spots.length)] : [300, ...strikerSpot(side, 300)];
    [t, sx, sy] = spot;
    const pool = own.length ? own : live;
    const target = pool[Math.floor(Math.random() * pool.length)];
    angle = Math.atan2(target.y - sy, target.x - sx);
    speed = 10 + Math.random() * 8;
  }
  angle += (Math.random() * 2 - 1) * noise[0];
  speed *= 1 + (Math.random() * 2 - 1) * noise[1];
  speed = Math.max(4, Math.min(MAXV, speed));
  return { t, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
}

function resetGame() {
  nSeats = 2;
  seatSide = [0, 2];
  seatColor = ['w', 'b'];
  coins = newBoard();
  potted = { w: 0, b: 0 };
  queenState = 'board'; queenOwner = -1;
  cur = 0; winnerColor = null;
}

function placeStriker(t = SIZE / 2) {
  striker.in = false; striker.vx = striker.vy = 0;
  [striker.x, striker.y] = strikerSpot(seatSide[cur], t);
}

// ---------- UI AND EVENT LOOP ----------
if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  const canvas = $('canvas'), ctx = canvas.getContext('2d');
  const statusEl = $('status'), msgEl = $('msg'), scoreEl = $('scorebar'), slider = $('slider');
  canvas.width = 900; canvas.height = 900;
  const K = canvas.width / SIZE;

  let vsBot = true;
  let level = 'medium';
  let moving = false, over = false, aiming = false, aimPt = null, gameId = 0;

  const isBot = s => (!isOnline && s === 1 && vsBot);
  const colorName = c => c === 'w' ? 'White' : 'Black';
  const seatName = s => {
    if (isOnline) return s === myRole ? 'You (' + colorName(seatColor[s]) + ')' : 'Opponent (' + colorName(seatColor[s]) + ')';
    return isBot(s) ? 'Bot 🤖' : 'Player ' + (s + 1) + ' (' + colorName(seatColor[s]) + ')';
  };

  function renderSetup() {
    $('opp-bot').classList.toggle('on', vsBot);
    $('opp-human').classList.toggle('on', !vsBot);
    $('bot-row').style.display = vsBot ? '' : 'none';
  }

  $('opp-bot').onclick = () => { vsBot = true; renderSetup(); };
  $('opp-human').onclick = () => { vsBot = false; renderSetup(); };

  document.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => {
    level = b.dataset.level;
    document.querySelectorAll('[data-level]').forEach(x => x.classList.toggle('on', x === b));
  }));

  function circle(x, y, r, fill, stroke, lw) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw || 1; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function draw() {
    ctx.setTransform(K, 0, 0, K, 0, 0);
    ctx.fillStyle = '#8a5a2b'; ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#f3dfb5'; ctx.fillRect(FRAME, FRAME, SIZE - 2 * FRAME, SIZE - 2 * FRAME);
    ctx.strokeStyle = 'rgba(120,80,30,.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(SIZE / 2, SIZE / 2, 62, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(SIZE / 2, SIZE / 2, 20, 0, 7); ctx.stroke();

    for (const side of seatSide) {
      const [x1, y1] = strikerSpot(side, T_MIN), [x2, y2] = strikerSpot(side, T_MAX);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      circle(x1, y1, 9, null, 'rgba(120,80,30,.55)', 1.5); circle(x2, y2, 9, null, 'rgba(120,80,30,.55)', 1.5);
    }
    for (const [px, py] of POCKETS) circle(px, py, 24, '#1b1b1b');
    for (const c of coins) {
      if (c.in) continue;
      if (c.type === 'q') circle(c.x, c.y, CR, '#e63946', '#8c1c24', 1.5);
      else if (c.type === 'w') circle(c.x, c.y, CR, '#fff8ec', '#8a6a3a', 1.5);
      else circle(c.x, c.y, CR, '#2b2b2b', '#000', 1.5);
      circle(c.x, c.y, CR * 0.55, null, c.type === 'b' ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.18)', 1);
    }
    if (!striker.in) {
      circle(striker.x, striker.y, SR, '#f5f5f7', '#1d1d1f', 2.5);
      circle(striker.x, striker.y, SR * 0.55, null, '#1d1d1f', 1.5);
    }
    if (aiming && aimPt && !moving) {
      const dx = striker.x - aimPt.x, dy = striker.y - aimPt.y, d = Math.hypot(dx, dy);
      if (d > 14) {
        const p = Math.min(d, 130) / 130, ux = dx / d, uy = dy / d;
        ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(29,29,31,.85)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(striker.x, striker.y); ctx.lineTo(striker.x + ux * (70 + p * 180), striker.y + uy * (70 + p * 180)); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255,70,70,.9)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(striker.x, striker.y); ctx.lineTo(striker.x - ux * p * 60, striker.y - uy * p * 60); ctx.stroke();
      }
    }
  }

  function updateScores() {
    const q = queenState === 'board' ? 'on board' : queenState === 'pending' ? 'pocketed, needs cover' : 'covered';
    scoreEl.textContent = 'White ' + potted.w + '/9  ·  Black ' + potted.b + '/9  ·  Queen: ' + q;
  }

  function updateStatus() {
    if (over) {
      statusEl.textContent = '🎉 ' + colorName(winnerColor) + ' wins!';
      if (window.ArcadeAuth) ArcadeAuth.recordGamePlay();
    } else if (isOnline) {
      statusEl.textContent = cur === myRole ? '👉 Your turn (' + colorName(seatColor[cur]) + '): Slide & shoot!' : '⏳ Opponent (' + colorName(seatColor[cur]) + ') is taking aim...';
    } else if (isBot(cur)) {
      statusEl.textContent = 'Bot is aiming...';
    } else {
      statusEl.textContent = seatName(cur) + ': slide striker, drag back and release to shoot';
    }
  }

  function startTurn() {
    moving = false; aiming = false;
    slider.value = SIZE / 2;
    placeStriker();
    slider.disabled = isOnline ? (cur !== myRole || over) : (isBot(cur) || over);
    updateScores(); updateStatus();
    if (isBot(cur) && !over) botPlay();
  }

  function botPlay() {
    const gid = gameId;
    setTimeout(() => {
      if (gid !== gameId || over) return;
      const plan = planShot(cur, level);
      placeStriker(plan.t);
      setTimeout(() => { if (gid === gameId && !over) fire(plan.vx, plan.vy); }, 600);
    }, 700);
  }

  function fire(vx, vy, fromRemote = false) {
    moving = true; aiming = false; slider.disabled = true;
    msgEl.textContent = '';
    shoot(vx, vy);

    if (isOnline && !fromRemote && onlineManager) {
      onlineManager.sendMove({ type: 'shot', vx, vy, t: +slider.value });
    }
  }

  function afterShot() {
    const res = resolveShot();
    if (res.msg) msgEl.textContent = res.msg;
    if (res.winner) {
      over = true;
      updateScores();
      updateStatus();
    } else {
      startTurn();
    }
  }

  function loop() {
    if (moving) {
      const stillMoving = stepPhysics();
      if (!stillMoving) {
        moving = false;
        afterShot();
      }
    }
    draw();
    requestAnimationFrame(loop);
  }

  slider.oninput = () => {
    if (moving || over) return;
    if (isOnline && cur !== myRole) return;
    if (!isOnline && isBot(cur)) return;
    placeStriker(+slider.value);

    if (isOnline && onlineManager) {
      onlineManager.sendMove({ type: 'slider', t: +slider.value });
    }
  };

  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (SIZE / rect.width),
      y: (clientY - rect.top) * (SIZE / rect.height)
    };
  }

  function onPointerDown(e) {
    if (moving || over) return;
    if (isOnline && cur !== myRole) return;
    if (!isOnline && isBot(cur)) return;

    const pos = getCanvasPos(e);
    if (Math.hypot(pos.x - striker.x, pos.y - striker.y) < SR * 2.2) {
      aiming = true;
      aimPt = pos;
    }
  }

  function onPointerMove(e) {
    if (!aiming) return;
    aimPt = getCanvasPos(e);
  }

  function onPointerUp() {
    if (!aiming) return;
    aiming = false;
    const dx = striker.x - aimPt.x, dy = striker.y - aimPt.y, d = Math.hypot(dx, dy);
    if (d > 14) {
      const p = Math.min(d, 130) / 130;
      const power = p * MAXV;
      fire((dx / d) * power, (dy / d) * power);
    }
  }

  canvas.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('touchstart', onPointerDown, { passive: true });
  window.addEventListener('touchmove', onPointerMove, { passive: true });
  window.addEventListener('touchend', onPointerUp);

  // ---------- ONLINE PROTOCOL ----------
  function setupOnline() {
    onlineManager = new OnlineManager('carrom', {
      onPlayerJoined: () => {
        $('online-wait-msg').style.display = 'none';
        myRole = 0;
        gameId++; over = false;
        resetGame();
        $('setup').style.display = 'none';
        $('game').style.display = '';
        startTurn();
        statusEl.textContent = "🎮 Opponent Joined! You are White (Bottom).";
      },
      onMoveReceived: (data) => {
        if (data.type === 'slider') {
          placeStriker(data.t);
        } else if (data.type === 'shot') {
          placeStriker(data.t);
          fire(data.vx, data.vy, true);
        } else if (data.type === 'new') {
          gameId++; over = false;
          resetGame();
          startTurn();
        }
      },
      onRoomReady: (playerNum) => {
        myRole = playerNum; // 0 = White (Host/Bottom), 1 = Black (Guest/Top)
        if (!onlineManager.isHost) {
          $('online-wait-msg').style.display = 'none';
          gameId++; over = false;
          resetGame();
          $('setup').style.display = 'none';
          $('game').style.display = '';
          startTurn();
          statusEl.textContent = "🎮 Connected to Host! You are Black (Top).";
        }
      }
    });

    $('btn-create-room').onclick = async () => {
      if (window.ArcadeAuth && !ArcadeAuth.canPlay()) return;
      $('btn-create-room').disabled = true;
      $('btn-create-room').textContent = "Creating...";
      const code = await onlineManager.createRoom();
      if (code) {
        $('disp-room-code').textContent = code;
        $('online-wait-msg').style.display = 'block';
      } else {
        $('btn-create-room').disabled = false;
        $('btn-create-room').textContent = "Create Room";
      }
    };

    $('btn-join-room').onclick = async () => {
      if (window.ArcadeAuth && !ArcadeAuth.canPlay()) return;
      const code = $('join-code-input').value.trim();
      if (code.length !== 4) return alert("Please enter a 4-character code!");
      $('btn-join-room').disabled = true;
      $('btn-join-room').textContent = "...";
      const ok = await onlineManager.joinRoom(code);
      if (!ok) {
        $('btn-join-room').disabled = false;
        $('btn-join-room').textContent = "Join";
      }
    };
  }

  $('mode-local').onclick = () => {
    isOnline = false;
    $('mode-local').classList.add('on');
    $('mode-online').classList.remove('on');
    $('local-opts').style.display = '';
    $('online-opts').style.display = 'none';
  };

  $('mode-online').onclick = () => {
    isOnline = true;
    $('mode-online').classList.add('on');
    $('mode-local').classList.remove('on');
    $('local-opts').style.display = 'none';
    $('online-opts').style.display = '';
  };

  $('start').onclick = () => {
    if (window.ArcadeAuth && !ArcadeAuth.canPlay()) return;
    gameId++; over = false;
    resetGame();
    $('setup').style.display = 'none';
    $('game').style.display = '';
    startTurn();
  };

  $('new').onclick = () => {
    if (window.ArcadeAuth && !ArcadeAuth.canPlay()) return;
    gameId++; over = false;
    resetGame();
    if (isOnline && onlineManager) {
      onlineManager.sendMove({ type: 'new' });
    }
    startTurn();
  };

  $('change').onclick = () => {
    gameId++; over = true;
    if (isOnline && onlineManager) onlineManager.disconnect();
    $('game').style.display = 'none';
    $('setup').style.display = '';
    $('online-wait-msg').style.display = 'none';
    $('btn-create-room').disabled = false;
    $('btn-create-room').textContent = "Create Room";
    $('btn-join-room').disabled = false;
    $('btn-join-room').textContent = "Join";
    renderSetup();
  };

  renderSetup();
  setupOnline();
  requestAnimationFrame(loop);
}