// =====================================================================
//  PEN FOOTBALL FIGHT: Heavy Weight Mechanics, Walled Arena & Goal Posts
// =====================================================================

// ---------- CONSTANTS & GEOMETRY ----------
const DESK_W = 600;
const DESK_H = 380;
const WALL_THICK = 16;
const GOAL_H = 130;
const GOAL_TOP = (DESK_H - GOAL_H) / 2;
const GOAL_BOTTOM = GOAL_TOP + GOAL_H;

// Heavy pen properties
const PEN_LENGTH = 68;
const PEN_WIDTH = 14;
const PEN_MASS = 2.4;
const FRICTION = 0.945;        // Heavier friction so pens feel solid and weighted
const ANGULAR_FRICTION = 0.91;
const MAX_IMPULSE = 19;
const SUB_STEPS = 8;

// ---------- ONLINE STATE ----------
let isOnline = false;
let onlineManager = null;
let myRole = 0; // 0 = Player 1 (Blue, defending Left Net), 1 = Player 2 (Red, defending Right Net)

// ---------- STATE ----------
let vsBot = true;
let botLevel = 'medium';
let scores = [0, 0];
let targetScore = 3;
let turn = 0; // 0 = Player 1 (Blue, defending Left Net), 1 = Player 2 (Red, defending Right Net)
let isMoving = false;
let isAiming = false;
let aimPos = null;
let gameOver = false;
let pens = [];

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- INITIALIZE PENS ----------
function resetPens() {
  pens = [
    {
      id: 0,
      x: 170,
      y: DESK_H / 2,
      vx: 0,
      vy: 0,
      angle: 0,
      vAngle: 0,
      color: '#007aff',
      capColor: '#004080',
      mass: PEN_MASS
    },
    {
      id: 1,
      x: DESK_W - 170,
      y: DESK_H / 2,
      vx: 0,
      vy: 0,
      angle: Math.PI,
      vAngle: 0,
      color: '#ff3b30',
      capColor: '#990000',
      mass: PEN_MASS
    }
  ];
  isMoving = false;
  isAiming = false;
  aimPos = null;
}

// ---------- COLLISION & WALL BOUNCE ----------
function checkPenCollision(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.hypot(dx, dy);
  const minDist = PEN_LENGTH * 0.72;

  if (dist < minDist && dist > 0) {
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;

    // Displace pens based on equal heavy mass
    p1.x -= nx * overlap * 0.5;
    p1.y -= ny * overlap * 0.5;
    p2.x += nx * overlap * 0.5;
    p2.y += ny * overlap * 0.5;

    // Relative velocity along collision normal
    const kx = p1.vx - p2.vx;
    const ky = p1.vy - p2.vy;
    const p = (2 * (nx * kx + ny * ky)) / (p1.mass + p2.mass);

    p1.vx -= p * p2.mass * nx * 0.88;
    p1.vy -= p * p2.mass * nx * 0.88;
    p2.vx += p * p1.mass * nx * 0.88;
    p2.vy += p * p1.mass * ny * 0.88;

    // Impart rotational wobble on collision
    p1.vAngle += (Math.random() - 0.5) * 0.35;
    p2.vAngle += (Math.random() - 0.5) * 0.35;
  }
}

function handleWallReflections(p) {
  const halfLen = PEN_LENGTH * 0.35;
  const restitution = 0.65; // Wooden board bounce damping

  // Top Wall
  if (p.y - halfLen < WALL_THICK) {
    p.y = WALL_THICK + halfLen;
    p.vy = -p.vy * restitution;
  }
  // Bottom Wall
  if (p.y + halfLen > DESK_H - WALL_THICK) {
    p.y = DESK_H - WALL_THICK - halfLen;
    p.vy = -p.vy * restitution;
  }

  // Left Wall (has goal opening in the middle)
  if (p.x - halfLen < WALL_THICK) {
    const inGoalY = (p.y > GOAL_TOP && p.y < GOAL_BOTTOM);
    if (!inGoalY) {
      p.x = WALL_THICK + halfLen;
      p.vx = -p.vx * restitution;
    }
  }

  // Right Wall (has goal opening in the middle)
  if (p.x + halfLen > DESK_W - WALL_THICK) {
    const inGoalY = (p.y > GOAL_TOP && p.y < GOAL_BOTTOM);
    if (!inGoalY) {
      p.x = DESK_W - WALL_THICK - halfLen;
      p.vx = -p.vx * restitution;
    }
  }
}

// Check if any pen was forced into either goal net
function checkGoalScored() {
  for (const p of pens) {
    // Left Goal (Player 1's goal: if penetrated, Player 2 scores)
    if (p.x < WALL_THICK + 5 && p.y > GOAL_TOP && p.y < GOAL_BOTTOM) {
      return { scored: true, winner: 1, reason: (p.id === 0 ? "Player 1 knocked own pen into net!" : "Player 2 scored a Goal!") };
    }
    // Right Goal (Player 2's goal: if penetrated, Player 1 scores)
    if (p.x > DESK_W - WALL_THICK - 5 && p.y > GOAL_TOP && p.y < GOAL_BOTTOM) {
      return { scored: true, winner: 0, reason: (p.id === 1 ? "Player 2 knocked own pen into net!" : "Player 1 scored a Goal!") };
    }
  }
  return { scored: false };
}

function stepPhysics() {
  let stillMoving = false;

  for (let s = 0; s < SUB_STEPS; s++) {
    pens.forEach(p => {
      p.x += p.vx / SUB_STEPS;
      p.y += p.vy / SUB_STEPS;
      p.angle += p.vAngle / SUB_STEPS;
      handleWallReflections(p);
    });

    checkPenCollision(pens[0], pens[1]);
  }

  pens.forEach(p => {
    p.vx *= FRICTION;
    p.vy *= FRICTION;
    p.vAngle *= ANGULAR_FRICTION;

    if (Math.hypot(p.vx, p.vy) < 0.09) {
      p.vx = 0;
      p.vy = 0;
    } else {
      stillMoving = true;
    }

    if (Math.abs(p.vAngle) < 0.005) {
      p.vAngle = 0;
    } else {
      stillMoving = true;
    }
  });

  return stillMoving;
}

// ---------- BOT AI ENGINE ----------
function botPlayTurn() {
  const botPen = pens[1];
  const targetPen = pens[0];

  // The bot wants to hit Player 1's pen toward the Left Goal (x = 0, y = DESK_H / 2)
  const goalX = 10;
  const goalY = DESK_H / 2;

  // Vector from player 1 to goal
  const toGoalX = goalX - targetPen.x;
  const toGoalY = goalY - targetPen.y;
  const toGoalDist = Math.hypot(toGoalX, toGoalY);

  // Aim directly behind target pen
  const ghostX = targetPen.x - (toGoalX / toGoalDist) * 35;
  const ghostY = targetPen.y - (toGoalY / toGoalDist) * 35;

  let aimX = ghostX - botPen.x;
  let aimY = ghostY - botPen.y;
  let dist = Math.hypot(aimX, aimY);
  let angle = Math.atan2(aimY, aimX);

  let power = Math.min(dist / 220, 1) * MAX_IMPULSE;

  if (botLevel === 'easy') {
    angle += (Math.random() - 0.5) * 0.45;
    power *= 0.7;
  } else if (botLevel === 'medium') {
    angle += (Math.random() - 0.5) * 0.16;
    power *= 0.95;
  } else {
    // Hard bot applies full precision impulse
    angle += (Math.random() - 0.5) * 0.04;
    power = Math.min(MAX_IMPULSE, power * 1.15 + 3);
  }

  const impulseX = Math.cos(angle) * power;
  const impulseY = Math.sin(angle) * power;

  setTimeout(() => {
    flickPen(1, impulseX, impulseY);
  }, 750);
}

// ---------- FLICK ACTION & RESOLUTION ----------
function flickPen(playerIdx, fx, fy) {
  const p = pens[playerIdx];
  p.vx = fx;
  p.vy = fy;
  p.vAngle = (Math.random() - 0.5) * 0.3;
  isMoving = true;
  isAiming = false;
  aimPos = null;
}

async function handleTurnEnd() {
  const goalResult = checkGoalScored();

  if (goalResult.scored) {
    const scorer = goalResult.winner;
    scores[scorer]++;
    updateScores();

    $('status').textContent = '⚽ GOAL! ' + goalResult.reason;

    if (scores[0] >= targetScore || scores[1] >= targetScore) {
      endGame();
    } else {
      await sleep(1500);
      resetPens();
      turn = (scorer === 0) ? 1 : 0; // Conceding player gets kickoff
      promptTurn();
    }
  } else {
    turn = 1 - turn;
    promptTurn();
  }
}

function promptTurn() {
  if (gameOver) return;

  if (isOnline) {
    if (turn === myRole) {
      $('status').textContent = myRole === 0 ? '👉 Your turn (Blue): Flick pen toward Right Goal!' : '👉 Your turn (Red): Flick pen toward Left Goal!';
    } else {
      $('status').textContent = '⏳ Opponent is aiming and flicking...';
    }
    return;
  }

  if (turn === 0) {
    $('status').textContent = '👉 Player 1 (Blue): Flick pen toward the Right Goal!';
  } else if (vsBot) {
    $('status').textContent = 'Bot (Red) 🤖 is aiming at the Left Goal...';
    botPlayTurn();
  } else {
    $('status').textContent = '👉 Player 2 (Red): Flick pen toward the Left Goal!';
  }
}

function updateScores() {
  const p2Name = isOnline ? 'Player 2 (Red)' : (vsBot ? 'Bot (Red) 🤖' : 'Player 2 (Red)');
  $('score-tally').textContent = 'Player 1 (Blue): ' + scores[0] + '  ·  ' + p2Name + ': ' + scores[1];
}

function endGame() {
  gameOver = true;
  const p2Name = isOnline ? 'Player 2 (Red)' : (vsBot ? 'Bot (Red) 🤖' : 'Player 2 (Red)');
  const winner = scores[0] >= targetScore ? 'Player 1 (Blue)' : p2Name;
  $('status').textContent = '🏆 MATCH OVER! ' + winner + ' wins the tournament!';
  if (window.ArcadeAuth) ArcadeAuth.recordGamePlay();
}

// ---------- CANVAS RENDERING ----------
function drawArena(ctx) {
  // Desk center line & circle
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(DESK_W / 2, WALL_THICK);
  ctx.lineTo(DESK_W / 2, DESK_H - WALL_THICK);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(DESK_W / 2, DESK_H / 2, 45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Wooden borders
  ctx.fillStyle = '#4a2810';
  ctx.fillRect(0, 0, DESK_W, WALL_THICK); // Top
  ctx.fillRect(0, DESK_H - WALL_THICK, DESK_W, WALL_THICK); // Bottom

  // Left wall segments (above & below goal)
  ctx.fillRect(0, 0, WALL_THICK, GOAL_TOP);
  ctx.fillRect(0, GOAL_BOTTOM, WALL_THICK, DESK_H - GOAL_BOTTOM);

  // Right wall segments (above & below goal)
  ctx.fillRect(DESK_W - WALL_THICK, 0, WALL_THICK, GOAL_TOP);
  ctx.fillRect(DESK_W - WALL_THICK, GOAL_BOTTOM, WALL_THICK, DESK_H - GOAL_BOTTOM);

  // Goal Nets
  drawGoalNet(ctx, 0, GOAL_TOP, WALL_THICK, GOAL_H, true);
  drawGoalNet(ctx, DESK_W - WALL_THICK, GOAL_TOP, WALL_THICK, GOAL_H, false);
}

function drawGoalNet(ctx, x, y, w, h, isLeft) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x, y, w, h);

  // Goal net cross stitches
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= h; i += 12) {
    ctx.moveTo(x, y + i);
    ctx.lineTo(x + w, y + i);
  }
  ctx.stroke();

  // Goal post line
  ctx.strokeStyle = isLeft ? '#007aff' : '#ff3b30';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
}

function drawPen(ctx, p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.roundRect(-PEN_LENGTH / 2 + 5, -PEN_WIDTH / 2 + 5, PEN_LENGTH, PEN_WIDTH, 5);
  ctx.fill();

  // Pen body
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.roundRect(-PEN_LENGTH / 2, -PEN_WIDTH / 2, PEN_LENGTH - 18, PEN_WIDTH, [5, 0, 0, 5]);
  ctx.fill();

  // White rubber grip
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(PEN_LENGTH / 2 - 26, -PEN_WIDTH / 2, 8, PEN_WIDTH);

  // Silver metal nib
  ctx.fillStyle = '#d1d1d6';
  ctx.beginPath();
  ctx.moveTo(PEN_LENGTH / 2 - 18, -PEN_WIDTH / 2);
  ctx.lineTo(PEN_LENGTH / 2, 0);
  ctx.lineTo(PEN_LENGTH / 2 - 18, PEN_WIDTH / 2);
  ctx.closePath();
  ctx.fill();

  // Pen pocket clip
  ctx.fillStyle = p.capColor;
  ctx.fillRect(-PEN_LENGTH / 2 + 6, -PEN_WIDTH / 2 - 2, 16, 3);

  ctx.restore();
}

function drawAimGuide(ctx) {
  if (!isAiming || !aimPos || isMoving) return;
  const currentPen = pens[turn];
  if (!currentPen) return;

  const dx = currentPen.x - aimPos.x;
  const dy = currentPen.y - aimPos.y;
  const dist = Math.hypot(dx, dy);

  if (dist > 8) {
    const powerNorm = Math.min(dist / 140, 1);
    const ux = dx / dist;
    const uy = dy / dist;

    // Dotted projection line
    ctx.beginPath();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 3;
    ctx.moveTo(currentPen.x, currentPen.y);
    ctx.lineTo(currentPen.x + ux * (60 + powerNorm * 130), currentPen.y + uy * (60 + powerNorm * 130));
    ctx.stroke();
    ctx.setLineDash([]);

    // Drag power pull indicator
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 69, 58, 0.95)';
    ctx.lineWidth = 4;
    ctx.moveTo(currentPen.x, currentPen.y);
    ctx.lineTo(currentPen.x - ux * powerNorm * 50, currentPen.y - uy * powerNorm * 50);
    ctx.stroke();
  }
}

// ---------- GAME LOOP & INPUTS ----------
if (typeof document !== 'undefined') {
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    canvas.width = DESK_W;
    canvas.height = DESK_H;
  }
  resizeCanvas();

  function renderLoop() {
    ctx.clearRect(0, 0, DESK_W, DESK_H);

    drawArena(ctx);
    pens.forEach(p => drawPen(ctx, p));
    drawAimGuide(ctx);

    if (isMoving) {
      const active = stepPhysics();
      if (!active) {
        isMoving = false;
        handleTurnEnd();
      }
    }

    requestAnimationFrame(renderLoop);
  }

  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (DESK_W / rect.width),
      y: (clientY - rect.top) * (DESK_H / rect.height)
    };
  }

  function onPointerDown(e) {
    if (isMoving || gameOver) return;
    if (isOnline && turn !== myRole) return;
    if (!isOnline && vsBot && turn === 1) return;

    const currentPen = pens[turn];
    const pos = getCanvasPos(e);

    if (Math.hypot(pos.x - currentPen.x, pos.y - currentPen.y) < PEN_LENGTH * 0.8) {
      isAiming = true;
      aimPos = pos;
    }
  }

  function onPointerMove(e) {
    if (!isAiming) return;
    aimPos = getCanvasPos(e);
  }

  function onPointerUp() {
    if (!isAiming) return;
    isAiming = false;

    const currentPen = pens[turn];
    const dx = currentPen.x - aimPos.x;
    const dy = currentPen.y - aimPos.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 12) {
      const powerNorm = Math.min(dist / 140, 1);
      const impulse = powerNorm * MAX_IMPULSE;
      const ux = dx / dist;
      const uy = dy / dist;
      const fx = ux * impulse;
      const fy = uy * impulse;

      flickPen(turn, fx, fy);

      if (isOnline) {
        onlineManager.sendMove({ type: 'flick', player: turn, fx, fy });
      }
    }
    aimPos = null;
  }

  canvas.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('touchstart', onPointerDown, { passive: true });
  window.addEventListener('touchmove', onPointerMove, { passive: true });
  window.addEventListener('touchend', onPointerUp);

  // ---------- BUTTON WIRING ----------
  function renderSetup() {
    $('opp-bot').classList.toggle('on', vsBot);
    $('opp-human').classList.toggle('on', !vsBot);
    $('bot-row').style.display = vsBot ? '' : 'none';
  }

  $('opp-bot').onclick = () => { vsBot = true; renderSetup(); };
  $('opp-human').onclick = () => { vsBot = false; renderSetup(); };

  document.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => {
    botLevel = b.dataset.level;
    document.querySelectorAll('[data-level]').forEach(x => x.classList.toggle('on', x === b));
  }));

  function startLocalMatch() {
    if (window.ArcadeAuth && !ArcadeAuth.canPlay()) return;
    scores = [0, 0];
    gameOver = false;
    turn = 0;
    resetPens();
    updateScores();
    $('setup').style.display = 'none';
    $('game').style.display = '';
    promptTurn();
  }

  $('start').onclick = startLocalMatch;

  $('new-btn').onclick = () => {
    if (window.ArcadeAuth && !ArcadeAuth.canPlay()) return;
    scores = [0, 0];
    gameOver = false;
    turn = 0;
    resetPens();
    updateScores();
    if (isOnline) {
      onlineManager.sendMove({ type: 'restart' });
    }
    promptTurn();
  };

  $('change-btn').onclick = () => {
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

  // ---------- ONLINE SETUP ----------
  function setupOnline() {
    onlineManager = new OnlineManager('penfight', {
      onPlayerJoined: () => {
        $('online-wait-msg').style.display = 'none';
        myRole = 0;
        startLocalMatch();
        $('status').textContent = "🎮 Opponent Joined! You are Blue (Defend Left).";
      },
      onMoveReceived: (data) => {
        if (data.type === 'flick') {
          flickPen(data.player, data.fx, data.fy);
        } else if (data.type === 'restart') {
          scores = [0, 0];
          gameOver = false;
          turn = 0;
          resetPens();
          updateScores();
          promptTurn();
        }
      },
      onRoomReady: (playerNum) => {
        myRole = playerNum; // 0 = Blue, 1 = Red
        if (!onlineManager.isHost) {
          startLocalMatch();
          $('status').textContent = "🎮 Connected to Host! You are Red (Defend Right).";
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

  renderSetup();
  setupOnline();
  requestAnimationFrame(renderLoop);
}