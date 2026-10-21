// =====================================================================
//  KANCHI (MARBLES) - RING CLASH WEIGHTED 2D CLAY PHYSICS ENGINE
// =====================================================================

(function() {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  const AudioEngine = {
    ctx: null,
    init() {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
      }
    },
    playClack(intensity = 1) {
      try {
        this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const now = this.ctx.currentTime;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(2000, now);
        osc.frequency.exponentialRampToValueAtTime(260, now + 0.05);

        const vol = Math.min(1, Math.max(0.1, intensity));
        gain.gain.setValueAtTime(vol * 0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.06);

        if (navigator.vibrate) navigator.vibrate(Math.min(30, Math.floor(intensity * 25)));
      } catch (e) {}
    }
  };

  // Heavy Glass Physics on Clay Ground
  const MARBLE_RADIUS = 13.5;
  const MARBLE_MASS = 2.4;
  const CLAY_FRICTION = 0.966;
  const RESTITUTION = 0.65;
  const MAX_SPEED = 21.0;
  const LAUNCH_SENSITIVITY = 0.11;
  const ARENA_RADIUS = 155;
  const TARGET_COUNT = 7;
  const WIN_SCORE = 4;

  let isBot = true;
  let isOnline = false;
  let onlineManager = null;
  let myRole = 0; // 0 = Host (P1), 1 = Guest (P2)
  let botLevel = 'easy';
  let turn = 1; // 1 = P1, 2 = P2 / Bot
  let p1Score = 0;
  let p2Score = 0;

  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let dragCurrent = { x: 0, y: 0 };
  let isSimulating = false;
  let gameOver = false;

  let striker = null;
  let targets = [];

  class Marble {
    constructor(x, y, color = '#20c997', isStriker = false) {
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.radius = MARBLE_RADIUS;
      this.mass = MARBLE_MASS;
      this.color = color;
      this.isStriker = isStriker;
      this.out = false;
    }

    update() {
      if (this.out) return;
      this.x += this.vx;
      this.y += this.vy;
      this.vx *= CLAY_FRICTION;
      this.vy *= CLAY_FRICTION;

      if (Math.hypot(this.vx, this.vy) < 0.08) {
        this.vx = 0;
        this.vy = 0;
      }
    }

    draw() {
      if (this.out) return;
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.x + 3.5, this.y + 4.5, this.radius + 0.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.48)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(
        this.x - 4, this.y - 4, 1.2,
        this.x, this.y, this.radius
      );
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, this.color);
      grad.addColorStop(0.85, '#12241b');
      grad.addColorStop(1, '#050c09');
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(this.x - 4, this.y - 4, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fill();
      ctx.restore();
    }
  }

  function initGame(seededTargets = null) {
    p1Score = 0;
    p2Score = 0;
    turn = 1;
    gameOver = false;
    isSimulating = false;

    document.getElementById('p1-score').textContent = '0';
    document.getElementById('p2-score').textContent = '0';
    
    if (isOnline) {
      document.getElementById('status-turn').textContent = (myRole === 0) ? "Your Strike (P1)" : "Opponent's Strike (P2)";
      document.getElementById('p2-label').textContent = 'Opponent';
    } else {
      document.getElementById('status-turn').textContent = "P1's Strike";
      document.getElementById('p2-label').textContent = isBot ? 'Bot' : 'Player 2';
    }

    resetStriker();
    spawnTargets(seededTargets);
    requestAnimationFrame(renderLoop);
  }

  function resetStriker() {
    striker = new Marble(250, 420, '#ff9f0a', true);
  }

  function spawnTargets(seeded = null) {
    targets = [];
    const colors = ['#007aff', '#ff3b30', '#34c759', '#af52de', '#ffcc00', '#5ac8fa', '#ff2d55'];

    if (seeded && seeded.length) {
      seeded.forEach((s, i) => {
        targets.push(new Marble(s.x, s.y, colors[i % colors.length], false));
      });
      return;
    }

    const seeds = [];
    for (let i = 0; i < TARGET_COUNT; i++) {
      const ang = (i / TARGET_COUNT) * Math.PI * 2;
      const dist = Math.random() * (ARENA_RADIUS * 0.55);
      const x = 250 + Math.cos(ang) * dist;
      const y = 250 + Math.sin(ang) * dist;
      seeds.push({ x, y });
      targets.push(new Marble(x, y, colors[i % colors.length], false));
    }

    if (isOnline && myRole === 0 && onlineManager) {
      onlineManager.sendMove({ type: 'sync_board', seeds });
    }
  }

  function resolveCollisions() {
    const all = [striker, ...targets.filter(t => !t.out)];

    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const m1 = all[i];
        const m2 = all[j];
        const dx = m2.x - m1.x;
        const dy = m2.y - m1.y;
        const dist = Math.hypot(dx, dy);

        if (dist < m1.radius + m2.radius) {
          const nx = dx / dist;
          const ny = dy / dist;

          const kx = m1.vx - m2.vx;
          const ky = m1.vy - m2.vy;
          const p = 2 * (nx * kx + ny * ky) / (m1.mass + m2.mass);

          m1.vx -= p * m2.mass * nx * RESTITUTION;
          m1.vy -= p * m2.mass * ny * RESTITUTION;
          m2.vx += p * m1.mass * nx * RESTITUTION;
          m2.vy += p * m1.mass * ny * RESTITUTION;

          const speed = Math.hypot(p * nx, p * ny);
          if (speed > 0.3) AudioEngine.playClack(speed / 5.5);

          const overlap = (m1.radius + m2.radius - dist) / 2;
          m1.x -= nx * overlap;
          m1.y -= ny * overlap;
          m2.x += nx * overlap;
          m2.y += ny * overlap;
        }
      }
    }
  }

  function checkTurnOutcomes() {
    let knocked = 0;
    targets.forEach(t => {
      if (!t.out && Math.hypot(t.x - 250, t.y - 250) > ARENA_RADIUS + MARBLE_RADIUS) {
        t.out = true;
        knocked++;
      }
    });

    if (knocked > 0) {
      if (turn === 1) p1Score += knocked;
      else p2Score += knocked;
      document.getElementById('p1-score').textContent = p1Score;
      document.getElementById('p2-score').textContent = p2Score;
    }

    if (p1Score >= WIN_SCORE || p2Score >= WIN_SCORE) {
      endMatch(p1Score >= WIN_SCORE ? 1 : 2);
      return;
    }

    turn = (turn === 1) ? 2 : 1;
    
    if (isOnline) {
      const isMyTurn = (turn === 1 && myRole === 0) || (turn === 2 && myRole === 1);
      document.getElementById('status-turn').textContent = isMyTurn ? "Your Strike!" : "Opponent is Aiming...";
    } else {
      document.getElementById('status-turn').textContent = turn === 1
        ? "P1's Strike"
        : (isBot ? "Bot is Aiming..." : "P2's Strike");
    }

    resetStriker();
    isSimulating = false;

    if (turn === 2 && isBot && !gameOver && !isOnline) {
      setTimeout(triggerBotShot, 850);
    }
  }

  function triggerBotShot() {
    if (gameOver) return;
    const active = targets.filter(t => !t.out);
    if (!active.length) return;

    let target = active[0];
    let minDist = Infinity;
    active.forEach(t => {
      const d = Math.hypot(t.x - striker.x, t.y - striker.y);
      if (d < minDist) { minDist = d; target = t; }
    });

    let error = (Math.random() - 0.5) * 0.3;
    if (botLevel === 'med') error = (Math.random() - 0.5) * 0.14;
    if (botLevel === 'hard') error = (Math.random() - 0.5) * 0.03;

    const angle = Math.atan2(target.y - striker.y, target.x - striker.x) + error;
    const power = (botLevel === 'easy' ? 12.0 : (botLevel === 'med' ? 15.5 : 18.5));

    striker.vx = Math.cos(angle) * power;
    striker.vy = Math.sin(angle) * power;
    isSimulating = true;
    AudioEngine.playClack(0.8);
  }

  function endMatch(winner) {
    gameOver = true;
    isSimulating = false;
    let msg = "";
    if (isOnline) {
      const iWon = (winner === 1 && myRole === 0) || (winner === 2 && myRole === 1);
      msg = iWon ? "🎉 You Won the Clash!" : "💀 Opponent Won the Clash!";
    } else {
      msg = (winner === 1) ? "🎉 Player 1 Won the Clash!" : (isBot ? "🤖 Bot Won!" : "🎉 Player 2 Won!");
    }
    document.getElementById('status-turn').textContent = msg;

    if (window.ArcadeAuth && typeof window.ArcadeAuth.recordGamePlay === 'function') {
      window.ArcadeAuth.recordGamePlay(winner === 1);
    }
  }

  function renderLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.beginPath();
    ctx.arc(250, 250, ARENA_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([8, 6]);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(100, 420);
    ctx.lineTo(400, 420);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    if (isSimulating) {
      striker.update();
      targets.forEach(t => t.update());
      resolveCollisions();

      const totalV = Math.hypot(striker.vx, striker.vy) +
        targets.reduce((acc, t) => acc + Math.hypot(t.vx, t.vy), 0);

      if (totalV === 0) checkTurnOutcomes();
    }

    const canAim = isOnline 
      ? ((turn === 1 && myRole === 0) || (turn === 2 && myRole === 1))
      : (turn === 1 || !isBot);

    if (isDragging && !isSimulating && canAim) {
      ctx.save();
      const aimDx = dragStart.x - dragCurrent.x;
      const aimDy = dragStart.y - dragCurrent.y;

      ctx.beginPath();
      ctx.moveTo(striker.x, striker.y);
      ctx.lineTo(striker.x + aimDx, striker.y + aimDy);
      ctx.strokeStyle = '#ff9f0a';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(striker.x + aimDx, striker.y + aimDy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff9f0a';
      ctx.fill();
      ctx.restore();
    }

    targets.forEach(t => t.draw());
    if (striker) striker.draw();

    requestAnimationFrame(renderLoop);
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (isSimulating || gameOver) return;
    if (isOnline) {
      const isMyTurn = (turn === 1 && myRole === 0) || (turn === 2 && myRole === 1);
      if (!isMyTurn) return;
    } else {
      if (turn === 2 && isBot) return;
    }

    const pos = getPos(e);
    if (Math.hypot(pos.x - striker.x, pos.y - striker.y) < 44) {
      isDragging = true;
      dragStart = pos;
      dragCurrent = pos;
      AudioEngine.init();
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    dragCurrent = getPos(e);
  });

  window.addEventListener('pointerup', () => {
    if (!isDragging) return;
    isDragging = false;
    const dx = dragStart.x - dragCurrent.x;
    const dy = dragStart.y - dragCurrent.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 10) {
      const speed = Math.min(dist * LAUNCH_SENSITIVITY, MAX_SPEED);
      const angle = Math.atan2(dy, dx);
      striker.vx = Math.cos(angle) * speed;
      striker.vy = Math.sin(angle) * speed;
      isSimulating = true;
      AudioEngine.playClack(Math.min(1, speed / 10));

      if (isOnline && onlineManager) {
        onlineManager.sendMove({
          type: 'strike',
          vx: striker.vx,
          vy: striker.vy
        });
      }
    }
  });

  // Single Clean Mode Switchers
  const modeBot = document.getElementById('mode-bot');
  const modeLocal = document.getElementById('mode-local');
  const modeOnline = document.getElementById('mode-online');
  const localOpts = document.getElementById('local-opts');
  const onlineOpts = document.getElementById('online-opts');
  const botDiffRow = document.getElementById('bot-diff-row');

  modeBot.onclick = () => {
    isBot = true;
    isOnline = false;
    modeBot.classList.add('on');
    modeLocal.classList.remove('on');
    modeOnline.classList.remove('on');
    localOpts.style.display = '';
    onlineOpts.style.display = 'none';
    botDiffRow.style.display = 'flex';
  };

  modeLocal.onclick = () => {
    isBot = false;
    isOnline = false;
    modeLocal.classList.add('on');
    modeBot.classList.remove('on');
    modeOnline.classList.remove('on');
    localOpts.style.display = '';
    onlineOpts.style.display = 'none';
    botDiffRow.style.display = 'none';
  };

  modeOnline.onclick = () => {
    isOnline = true;
    modeOnline.classList.add('on');
    modeBot.classList.remove('on');
    modeLocal.classList.remove('on');
    localOpts.style.display = 'none';
    onlineOpts.style.display = '';
  };

  document.querySelectorAll('#bot-diff-row button').forEach(btn => {
    btn.onclick = function() {
      document.querySelectorAll('#bot-diff-row button').forEach(b => b.classList.remove('on'));
      this.classList.add('on');
      botLevel = this.getAttribute('data-diff');
    };
  });

  // Online Manager Setup
  function setupOnline() {
    if (typeof OnlineManager === 'undefined') return;

    onlineManager = new OnlineManager('kanche', {
      onPlayerJoined: () => {
        document.getElementById('online-wait-msg').style.display = 'none';
        myRole = 0;
        document.getElementById('setup').style.display = 'none';
        document.getElementById('game').style.display = 'block';
        initGame();
      },
      onMoveReceived: (data) => {
        if (data.type === 'strike') {
          striker.vx = data.vx;
          striker.vy = data.vy;
          isSimulating = true;
          AudioEngine.playClack(Math.min(1, Math.hypot(data.vx, data.vy) / 10));
        } else if (data.type === 'sync_board') {
          spawnTargets(data.seeds);
        } else if (data.type === 'restart') {
          initGame();
        }
      },
      onRoomReady: (playerNum) => {
        myRole = playerNum;
        if (!onlineManager.isHost) {
          document.getElementById('setup').style.display = 'none';
          document.getElementById('game').style.display = 'block';
          initGame();
        }
      }
    });

    document.getElementById('btn-create-room').onclick = async () => {
      if (window.ArcadeAuth && !ArcadeAuth.canPlay()) return;
      document.getElementById('btn-create-room').disabled = true;
      document.getElementById('btn-create-room').textContent = "Creating...";
      const code = await onlineManager.createRoom();
      if (code) {
        document.getElementById('disp-room-code').textContent = code;
        document.getElementById('online-wait-msg').style.display = 'block';
      } else {
        document.getElementById('btn-create-room').disabled = false;
        document.getElementById('btn-create-room').textContent = "Create Room";
      }
    };

    document.getElementById('btn-join-room').onclick = async () => {
      if (window.ArcadeAuth && !ArcadeAuth.canPlay()) return;
      const code = document.getElementById('join-code-input').value.trim();
      if (code.length !== 4) return alert("Please enter a 4-character code!");
      document.getElementById('btn-join-room').disabled = true;
      document.getElementById('btn-join-room').textContent = "...";
      const ok = await onlineManager.joinRoom(code);
      if (!ok) {
        document.getElementById('btn-join-room').disabled = false;
        document.getElementById('btn-join-room').textContent = "Join";
      }
    };
  }

  document.getElementById('start-btn').onclick = function() {
    if (window.ArcadeAuth && !window.ArcadeAuth.canPlay()) return;
    document.getElementById('setup').style.display = 'none';
    document.getElementById('game').style.display = 'block';
    initGame();
  };

  document.getElementById('btn-reset').onclick = () => {
    initGame();
    if (isOnline && onlineManager) {
      onlineManager.sendMove({ type: 'restart' });
    }
  };

  document.getElementById('btn-menu').onclick = () => {
    if (isOnline && onlineManager) onlineManager.disconnect();
    document.getElementById('game').style.display = 'none';
    document.getElementById('setup').style.display = 'block';
    document.getElementById('online-wait-msg').style.display = 'none';
    document.getElementById('btn-create-room').disabled = false;
    document.getElementById('btn-create-room').textContent = "Create Room";
    document.getElementById('btn-join-room').disabled = false;
    document.getElementById('btn-join-room').textContent = "Join";
  };

  setupOnline();
})();