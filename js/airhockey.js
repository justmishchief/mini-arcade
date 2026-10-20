// =====================================================================
//  AIR HOCKEY ENGINE (Bulletproof Corner Physics & Unstuck Bot)
// =====================================================================

(function() {
  const setupEl = document.getElementById('setup');
  const gameEl = document.getElementById('game');
  const statusEl = document.getElementById('status');
  const levelRow = document.getElementById('level-row');
  const levelNote = document.getElementById('level-note');
  const startRow = document.getElementById('start-row');
  const startBtn = document.getElementById('start');
  const resetBtn = document.getElementById('reset');
  const changeBtn = document.getElementById('change');

  const sx = document.getElementById('sx');
  const so = document.getElementById('so');

  const onlineOpts = document.getElementById('online-opts');
  const btnCreateRoom = document.getElementById('btn-create-room');
  const btnJoinRoom = document.getElementById('btn-join-room');
  const joinCodeInput = document.getElementById('join-code-input');
  const onlineWaitMsg = document.getElementById('online-wait-msg');
  const dispRoomCode = document.getElementById('disp-room-code');

  const canvas = document.getElementById('hockeyCanvas');
  const ctx = canvas.getContext('2d');

  const W = canvas.width;
  const H = canvas.height;
  const GOAL_WIDTH = 110;
  const GOAL_X1 = (W - GOAL_WIDTH) / 2;
  const GOAL_X2 = GOAL_X1 + GOAL_WIDTH;
  const CORNER_RADIUS = 28;

  let mode = 'bot'; // 'bot' | 'local' | 'online'
  let level = 'medium'; // 'easy' | 'medium' | 'hard'
  let isHost = true;
  let activeCode = null;

  let scoreRed = 0;
  let scoreBlue = 0;
  const WIN_SCORE = 5;
  let gameOver = false;
  let isRunning = false;
  let lowSpeedCounter = 0;

  // Bot AI Reaction Tracking variables
  let botReactionTimer = 0;
  let botTargetX = W / 2;
  let botTargetY = 70;

  const notes = {
    easy: "Easy: relaxed bot with delayed reactions.",
    medium: "Medium: the bot matches your level (it thinks you play at 50%).",
    hard: "Hard: fast aggressive bot with tactical rebound shots."
  };

  // Puck entity
  const puck = {
    x: W / 2,
    y: H / 2,
    vx: 0,
    vy: 0,
    r: 13,
    friction: 0.99,
    maxSpd: 19
  };

  // Red (Player 1 - Bottom)
  const p1 = {
    x: W / 2,
    y: H - 70,
    r: 22,
    color: '#ff3b30',
    glow: 'rgba(255, 59, 48, 0.5)'
  };

  // Blue (Player 2 / Bot - Top)
  const p2 = {
    x: W / 2,
    y: 70,
    r: 22,
    color: '#007aff',
    glow: 'rgba(0, 122, 255, 0.5)'
  };

  // Setup Controls
  setupEl.querySelectorAll('[data-mode]').forEach(btn => {
    btn.onclick = () => {
      setupEl.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      mode = btn.dataset.mode;

      if (mode === 'bot') {
        levelRow.style.display = 'flex';
        levelNote.style.display = 'block';
        startRow.style.display = 'block';
        onlineOpts.style.display = 'none';
      } else if (mode === 'local') {
        levelRow.style.display = 'none';
        levelNote.style.display = 'none';
        startRow.style.display = 'block';
        onlineOpts.style.display = 'none';
      } else if (mode === 'online') {
        levelRow.style.display = 'none';
        levelNote.style.display = 'none';
        startRow.style.display = 'none';
        onlineOpts.style.display = 'block';
      }
    };
  });

  setupEl.querySelectorAll('[data-level]').forEach(btn => {
    btn.onclick = () => {
      setupEl.querySelectorAll('[data-level]').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      level = btn.dataset.level;
      levelNote.textContent = notes[level];
    };
  });

  startBtn.onclick = () => {
    if (window.ArcadeAuth && !window.ArcadeAuth.canPlay()) return;
    startGame();
  };

  changeBtn.onclick = () => {
    isRunning = false;
    gameEl.style.display = 'none';
    setupEl.style.display = 'block';
  };

  resetBtn.onclick = () => resetGame();

  function startGame() {
    setupEl.style.display = 'none';
    gameEl.style.display = 'block';
    resetGame();
    isRunning = true;
  }

  function updateScores() {
    sx.textContent = `Red: ${scoreRed}`;
    so.textContent = `Blue: ${scoreBlue}`;
  }

  function resetPuck(towardsRed = true) {
    puck.x = W / 2;
    puck.y = H / 2;
    puck.vx = (Math.random() - 0.5) * 4;
    puck.vy = towardsRed ? 4.5 : -4.5;
    lowSpeedCounter = 0;
    botTargetX = W / 2;
    botTargetY = 70;
  }

  function resetGame() {
    scoreRed = 0;
    scoreBlue = 0;
    gameOver = false;
    statusEl.textContent = "First to 5 points wins!";
    updateScores();
    p1.x = W / 2;
    p1.y = H - 70;
    p2.x = W / 2;
    p2.y = 70;
    resetPuck(true);
  }

  // Pointer Handling
  let p1Drag = false;
  let p2Drag = false;

  function getCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (cx - rect.left) * (W / rect.width),
      y: (cy - rect.top) * (H / rect.height)
    };
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!isRunning || gameOver) return;
    const pos = getCoords(e);
    if (mode === 'online' && !isHost) {
      p2Drag = true;
      p2.x = pos.x;
      p2.y = Math.min(H / 2 - p2.r - 2, Math.max(p2.r + 6, pos.y));
      return;
    }

    if (pos.y > H / 2) {
      p1Drag = true;
      p1.x = Math.max(p1.r + 4, Math.min(W - p1.r - 4, pos.x));
      p1.y = Math.max(H / 2 + p1.r + 2, Math.min(H - p1.r - 6, pos.y));
    } else if (mode === 'local' && pos.y <= H / 2) {
      p2Drag = true;
      p2.x = Math.max(p2.r + 4, Math.min(W - p2.r - 4, pos.x));
      p2.y = Math.min(H / 2 - p2.r - 2, Math.max(p2.r + 6, pos.y));
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (!isRunning || gameOver) return;
    const pos = getCoords(e);
    if (p1Drag) {
      p1.x = Math.max(p1.r + 4, Math.min(W - p1.r - 4, pos.x));
      p1.y = Math.max(H / 2 + p1.r + 2, Math.min(H - p1.r - 6, pos.y));
    }
    if (p2Drag) {
      p2.x = Math.max(p2.r + 4, Math.min(W - p2.r - 4, pos.x));
      p2.y = Math.min(H / 2 - p2.r - 2, Math.max(p2.r + 6, pos.y));
    }
  });

  window.addEventListener('pointerup', () => {
    p1Drag = false;
    p2Drag = false;
  });

  // Bot Logic with Progressive Difficulties & Anti-Trap Protection
  function updateBot() {
    if (mode !== 'bot' || !isRunning || gameOver) return;

    botReactionTimer++;

    let spd = 0.08;
    let reactionInterval = 1;
    let aimOffset = 0;

    if (level === 'easy') {
      spd = 0.038;              // Slow lazy movement
      reactionInterval = 12;     // Deliberate ~0.2s reaction lag
      aimOffset = (Math.random() - 0.5) * 44; // Noticeable aiming mistakes
    } else if (level === 'medium') {
      spd = 0.075;              // Human speed
      reactionInterval = 4;      // Normal reflex
      aimOffset = (Math.random() - 0.5) * 14;
    } else if (level === 'hard') {
      spd = 0.16;               // Immediate sharp reflexes
      reactionInterval = 1;
      aimOffset = 0;
    }

    if (botReactionTimer >= reactionInterval) {
      botReactionTimer = 0;

      if (level === 'easy') {
        // Easy bot stays calm in its goal, only lunges when puck crosses deeply
        if (puck.y < H / 2 + 10) {
          botTargetX = puck.x + aimOffset;
          botTargetY = Math.min(H / 2 - p2.r - 20, Math.max(55, puck.y - 12));
        } else {
          botTargetX = W / 2 + (Math.random() - 0.5) * 30;
          botTargetY = 70;
        }
      } else if (level === 'medium') {
        if (puck.y < H / 2 + 40) {
          botTargetX = puck.x + aimOffset;
          botTargetY = Math.min(H / 2 - p2.r - 10, puck.y - 10);
        } else {
          botTargetX = puck.x * 0.4 + (W / 2) * 0.6;
          botTargetY = 75;
        }
      } else {
        // Hard: aggressive intercept & deflection
        botTargetX = puck.x;
        botTargetY = puck.y < H / 2 + 60 ? Math.min(H / 2 - p2.r - 4, puck.y - 6) : 80;
      }
    }

    // Never let bot wedge into corner pockets
    if (puck.y < 90 && (puck.x < 55 || puck.x > W - 55)) {
      botTargetX = W / 2;
      botTargetY = 85;
    }

    p2.x += (botTargetX - p2.x) * spd;
    p2.y += (botTargetY - p2.y) * spd;

    // Strictly clamp bot away from corners and goal boundaries
    p2.x = Math.max(p2.r + 14, Math.min(W - p2.r - 14, p2.x));
    p2.y = Math.min(H / 2 - p2.r - 4, Math.max(p2.r + 12, p2.y));
  }

  // Paddle Collision with Anti-Pinning Physics
  function checkPaddle(paddle) {
    const dx = puck.x - paddle.x;
    const dy = puck.y - paddle.y;
    const dist = Math.hypot(dx, dy);
    const minDist = puck.r + paddle.r;

    if (dist < minDist) {
      const nx = dist === 0 ? 0 : dx / dist;
      const ny = dist === 0 ? (paddle === p2 ? 1 : -1) : dy / dist;

      // Pop puck out completely
      puck.x = paddle.x + nx * (minDist + 2);
      puck.y = paddle.y + ny * (minDist + 2);

      const curSpd = Math.hypot(puck.vx, puck.vy);
      const impulse = Math.max(12, Math.min(puck.maxSpd, curSpd * 0.95 + 8));
      puck.vx = nx * impulse;
      puck.vy = ny * impulse;
    }
  }

  // Anti-Stuck Rounded Corner Checks
  function applyCornerBounce(cx, cy) {
    const dx = puck.x - cx;
    const dy = puck.y - cy;
    const dist = Math.hypot(dx, dy);

    if (dist < CORNER_RADIUS) {
      const nx = dx / (dist || 1);
      const ny = dy / (dist || 1);
      puck.x = cx + nx * (CORNER_RADIUS + 1);
      puck.y = cy + ny * (CORNER_RADIUS + 1);
      
      const dot = puck.vx * nx + puck.vy * ny;
      if (dot < 0) {
        puck.vx = (puck.vx - 2 * dot * nx) * 1.05;
        puck.vy = (puck.vy - 2 * dot * ny) * 1.05;
      }
    }
  }

  function updatePhysics() {
    if (!isRunning || gameOver) return;

    puck.x += puck.vx;
    puck.y += puck.vy;
    puck.vx *= puck.friction;
    puck.vy *= puck.friction;

    // Emergency Anti-Stuck Watchdog
    const currentSpeed = Math.hypot(puck.vx, puck.vy);
    if (currentSpeed < 0.6) {
      lowSpeedCounter++;
      if (lowSpeedCounter > 12) {
        const toCenterX = (W / 2) - puck.x;
        const toCenterY = (H / 2) - puck.y;
        const centerDist = Math.hypot(toCenterX, toCenterY) || 1;
        puck.vx = (toCenterX / centerDist) * 6;
        puck.vy = (toCenterY / centerDist) * 6;
        lowSpeedCounter = 0;
      }
    } else {
      lowSpeedCounter = 0;
    }

    // Side Walls Bounce
    if (puck.x - puck.r <= 6) {
      puck.x = puck.r + 6;
      puck.vx = Math.abs(puck.vx) * 0.95 + 2;
    } else if (puck.x + puck.r >= W - 6) {
      puck.x = W - puck.r - 6;
      puck.vx = -Math.abs(puck.vx) * 0.95 - 2;
    }

    // Top Wall & Goal
    if (puck.y - puck.r <= 6) {
      if (puck.x >= GOAL_X1 && puck.x <= GOAL_X2) {
        scoreRed++;
        updateScores();
        checkWinner();
        resetPuck(false);
        return;
      } else {
        puck.y = puck.r + 6;
        puck.vy = Math.abs(puck.vy) * 0.95 + 2;
      }
    }

    // Bottom Wall & Goal
    if (puck.y + puck.r >= H - 6) {
      if (puck.x >= GOAL_X1 && puck.x <= GOAL_X2) {
        scoreBlue++;
        updateScores();
        checkWinner();
        resetPuck(true);
        return;
      } else {
        puck.y = H - puck.r - 6;
        puck.vy = -Math.abs(puck.vy) * 0.95 - 2;
      }
    }

    // Deflect puck away from dead corners
    applyCornerBounce(CORNER_RADIUS, CORNER_RADIUS);
    applyCornerBounce(W - CORNER_RADIUS, CORNER_RADIUS);
    applyCornerBounce(CORNER_RADIUS, H - CORNER_RADIUS);
    applyCornerBounce(W - CORNER_RADIUS, H - CORNER_RADIUS);

    checkPaddle(p1);
    checkPaddle(p2);
    updateBot();
  }

  function checkWinner() {
    if (scoreRed >= WIN_SCORE) {
      gameOver = true;
      statusEl.textContent = "🎉 Red wins the match!";
      if (window.ArcadeAuth?.recordGamePlay) window.ArcadeAuth.recordGamePlay(true);
    } else if (scoreBlue >= WIN_SCORE) {
      gameOver = true;
      statusEl.textContent = "💀 Blue wins the match!";
      if (window.ArcadeAuth?.recordGamePlay) window.ArcadeAuth.recordGamePlay(false);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Rounded Corner Visual Bumper Curves
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(CORNER_RADIUS, CORNER_RADIUS, CORNER_RADIUS - 6, Math.PI, 1.5 * Math.PI);
    ctx.arc(W - CORNER_RADIUS, CORNER_RADIUS, CORNER_RADIUS - 6, 1.5 * Math.PI, 2 * Math.PI);
    ctx.arc(W - CORNER_RADIUS, H - CORNER_RADIUS, CORNER_RADIUS - 6, 0, 0.5 * Math.PI);
    ctx.arc(CORNER_RADIUS, H - CORNER_RADIUS, CORNER_RADIUS - 6, 0.5 * Math.PI, Math.PI);
    ctx.stroke();

    // Center Rink Line & Circle
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(8, H / 2);
    ctx.lineTo(W - 8, H / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 44, 0, Math.PI * 2);
    ctx.stroke();

    // Goals
    ctx.fillStyle = 'rgba(255, 59, 48, 0.5)';
    ctx.fillRect(GOAL_X1, H - 6, GOAL_WIDTH, 6);
    ctx.fillStyle = 'rgba(0, 122, 255, 0.5)';
    ctx.fillRect(GOAL_X1, 0, GOAL_WIDTH, 6);

    // Puck
    ctx.save();
    ctx.shadowColor = '#00f2fe';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(puck.x, puck.y, puck.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#00c6ff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    // Mallets
    function drawMallet(p) {
      ctx.save();
      ctx.shadowColor = p.glow;
      ctx.shadowBlur = 15;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawMallet(p1);
    drawMallet(p2);
  }

  function loop() {
    updatePhysics();
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Online Room Handlers
  btnCreateRoom.onclick = async () => {
    const sb = window.supabaseClient;
    if (!sb) return alert("Supabase connecting...");

    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    const hostId = window.ArcadeAuth?.currentUser?.id || 'host_' + Math.random().toString(36).substr(2, 4);

    dispRoomCode.textContent = code;
    onlineWaitMsg.style.display = 'block';

    const { error } = await sb.from('rooms').insert([{
      code: code,
      game: 'airhockey',
      host_id: hostId,
      status: 'waiting'
    }]);

    if (!error) {
      activeCode = code;
      isHost = true;
      listenRoom(code);
    }
  };

  btnJoinRoom.onclick = async () => {
    const code = joinCodeInput.value.trim().toUpperCase();
    if (code.length !== 4) return alert("Enter 4-letter code");

    const sb = window.supabaseClient;
    if (!sb) return;

    const { data, error } = await sb.from('rooms').select('*').eq('code', code).eq('game', 'airhockey').single();
    if (data) {
      activeCode = code;
      isHost = false;
      await sb.from('rooms').update({ status: 'playing' }).eq('code', code);
      startGame();
    } else {
      alert("Room not found!");
    }
  };

  function listenRoom(code) {
    const sb = window.supabaseClient;
    if (!sb) return;

    sb.channel('hockey_' + code)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `code=eq.${code}` }, (payload) => {
        if (payload.new && payload.new.status === 'playing') {
          startGame();
        }
      })
      .subscribe();
  }
})();