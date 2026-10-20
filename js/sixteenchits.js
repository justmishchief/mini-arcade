// =====================================================================
//  16 SLIPS (PASS & MATCH) ENGINE (Bots Instant Win + Online Multi-Rankings)
// =====================================================================

(function() {
  const setupEl = document.getElementById('setup');
  const gameEl = document.getElementById('game');
  const statusEl = document.getElementById('status');
  const levelNote = document.getElementById('level-note');
  const startBtn = document.getElementById('start');
  const resetBtn = document.getElementById('reset');
  const changeBtn = document.getElementById('change');
  const passBtn = document.getElementById('btn-pass');

  const handCardsEl = document.getElementById('hand-cards');
  const badgeP1 = document.getElementById('badge-p1');
  const badgeBot1 = document.getElementById('badge-bot1');
  const badgeBot2 = document.getElementById('badge-bot2');
  const badgeBot3 = document.getElementById('badge-bot3');

  const slipInp1 = document.getElementById('slip-name-1');
  const slipInp2 = document.getElementById('slip-name-2');
  const slipInp3 = document.getElementById('slip-name-3');
  const slipInp4 = document.getElementById('slip-name-4');

  const modeBot = document.getElementById('mode-bot');
  const modeOnline = document.getElementById('mode-online');
  const localOpts = document.getElementById('local-opts');
  const onlineOpts = document.getElementById('online-opts');
  const btnCreateRoom = document.getElementById('btn-create-room');
  const btnJoinRoom = document.getElementById('btn-join-room');
  const joinCodeInput = document.getElementById('join-code-input');
  const onlineWaitMsg = document.getElementById('online-wait-msg');
  const dispRoomCode = document.getElementById('disp-room-code');

  let botLevel = 'medium';
  let isGameOver = false;
  let selectedIndex = null;
  let roundCounter = 0;

  // ONLINE ENGINE STATE
  let isOnline = false;
  let onlineManager = null;
  let myRole = 0; // 0 = Host, 1 = Guest
  let pendingMoves = { 0: null, 1: null };

  // Standings / Active Players
  let finishedRankings = []; // [playerIndex, ...]
  let activeInCycle = [0, 1, 2, 3]; // Active seats taking part in pass

  let hands = [[], [], [], []];
  let slipTypes = [];
  const icons = ['🍎', '🚗', '👑', '⭐'];

  const levelNotes = {
    easy: "Easy: Bots quickly recognize what you need and feed you the winning slip.",
    medium: "Medium: Bots play like regular players, discarding their odd slips.",
    hard: "Hard: Bots calculate cards, block your slips, and race to 4-of-a-kind."
  };

  // Bot Level Selector
  setupEl.querySelectorAll('[data-level]').forEach(btn => {
    btn.onclick = () => {
      setupEl.querySelectorAll('[data-level]').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      botLevel = btn.dataset.level;
      levelNote.textContent = levelNotes[botLevel];
    };
  });

  // Mode Selection
  modeBot.onclick = () => {
    isOnline = false;
    modeBot.classList.add('on');
    modeOnline.classList.remove('on');
    localOpts.style.display = 'block';
    onlineOpts.style.display = 'none';
  };

  modeOnline.onclick = () => {
    isOnline = true;
    modeOnline.classList.add('on');
    modeBot.classList.remove('on');
    localOpts.style.display = 'none';
    onlineOpts.style.display = 'block';
  };

  startBtn.onclick = () => {
    if (window.ArcadeAuth && !window.ArcadeAuth.canPlay()) return;
    initMatch();
  };

  resetBtn.onclick = () => {
    if (isOnline) {
      if (myRole === 0 && onlineManager) {
        onlineManager.sendMove({ type: 'restart' });
        initMatch();
      }
    } else {
      initMatch();
    }
  };

  changeBtn.onclick = () => {
    if (isOnline && onlineManager) onlineManager.disconnect();
    gameEl.style.display = 'none';
    setupEl.style.display = 'block';
    onlineWaitMsg.style.display = 'none';
    btnCreateRoom.disabled = false;
    btnCreateRoom.textContent = "Create Room";
    btnJoinRoom.disabled = false;
    btnJoinRoom.textContent = "Join";
  };

  function getPlayerTitle(p) {
    if (isOnline) {
      if (p === 0) return "Host (P1)";
      if (p === 1) return "Guest (P2)";
      if (p === 2) return "Leo (Bot)";
      return "Sam (Bot)";
    }
    if (p === 0) return "You";
    if (p === 1) return "Alex (Bot)";
    if (p === 2) return "Leo (Bot)";
    return "Sam (Bot)";
  }

  function initMatch(syncedDeck = null, syncedTypes = null) {
    setupEl.style.display = 'none';
    gameEl.style.display = 'block';
    pendingMoves = { 0: null, 1: null };
    finishedRankings = [];
    activeInCycle = [0, 1, 2, 3];

    if (syncedTypes) {
      slipTypes = syncedTypes;
    } else {
      const s1 = slipInp1.value.trim() || "Slip 1";
      const s2 = slipInp2.value.trim() || "Slip 2";
      const s3 = slipInp3.value.trim() || "Slip 3";
      const s4 = slipInp4.value.trim() || "Slip 4";

      slipTypes = [
        { id: 's1', icon: icons[0], label: s1 },
        { id: 's2', icon: icons[1], label: s2 },
        { id: 's3', icon: icons[2], label: s3 },
        { id: 's4', icon: icons[3], label: s4 }
      ];
    }

    let deck = [];
    if (syncedDeck) {
      deck = syncedDeck;
    } else {
      slipTypes.forEach(item => {
        for (let i = 0; i < 4; i++) {
          deck.push({ ...item });
        }
      });
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }

      if (isOnline && myRole === 0 && onlineManager) {
        onlineManager.sendMove({ type: 'sync_deck', deck: deck, types: slipTypes });
      }
    }

    hands = [[], [], [], []];
    for (let p = 0; p < 4; p++) {
      hands[p] = deck.splice(0, 4);
    }

    updateBadges();

    isGameOver = false;
    selectedIndex = null;
    roundCounter = 0;
    passBtn.disabled = true;
    passBtn.textContent = "Pass Selected Slip →";
    statusEl.textContent = "Select a slip to pass clockwise →";

    renderMyHand();
    checkWins();
  }

  function updateBadges() {
    const badges = [badgeP1, badgeBot1, badgeBot3, badgeBot2];
    // 0: You/Host, 1: Guest/Alex, 2: Leo, 3: Sam
    for (let p = 0; p < 4; p++) {
      let bEl = p === 0 ? badgeP1 : (p === 1 ? badgeBot1 : (p === 2 ? badgeBot3 : badgeBot2));
      let title = getPlayerTitle(p);

      const rankIdx = finishedRankings.indexOf(p);
      if (rankIdx !== -1) {
        const placeWord = rankIdx === 0 ? '🥇 1st' : (rankIdx === 1 ? '🥈 2nd' : '🥉 3rd');
        bEl.textContent = `${title} (${placeWord})`;
        bEl.style.background = '#30d158';
        bEl.style.borderColor = '#28cd41';
      } else {
        bEl.textContent = title;
        bEl.style.background = 'rgba(255, 255, 255, 0.1)';
        bEl.style.borderColor = 'rgba(255, 255, 255, 0.15)';
      }
    }
  }

  function renderMyHand() {
    handCardsEl.innerHTML = '';
    const myCurrentHand = hands[isOnline ? myRole : 0];
    const mySeat = isOnline ? myRole : 0;
    const isDone = finishedRankings.includes(mySeat);

    myCurrentHand.forEach((chit, idx) => {
      const card = document.createElement('div');
      card.className = `chit-card ${selectedIndex === idx ? 'selected' : ''}`;
      if (isDone) card.style.opacity = '0.7';
      card.innerHTML = `
        <div class="ic">${chit.icon}</div>
        <div class="lbl">${chit.label}</div>
      `;
      card.onclick = () => {
        if (isGameOver || isDone) return;
        selectedIndex = idx;
        renderMyHand();
        passBtn.disabled = false;
      };
      handCardsEl.appendChild(card);
    });
  }

  passBtn.onclick = () => {
    const mySeat = isOnline ? myRole : 0;
    if (finishedRankings.includes(mySeat) || isGameOver) return;

    if (selectedIndex === null) return;

    if (isOnline) {
      passBtn.disabled = true;
      statusEl.textContent = "Slip locked! Waiting for others...";
      onlineManager.sendMove({ type: 'pass_slip', role: myRole, slipIdx: selectedIndex });
      handleOnlinePass(myRole, selectedIndex);
      selectedIndex = null;
      return;
    }

    executeTurn(selectedIndex);
  };

  function chooseBotDiscard(botIndex) {
    const hand = hands[botIndex];
    if (!hand || hand.length === 0) return 0;
    const counts = {};
    hand.forEach(c => counts[c.id] = (counts[c.id] || 0) + 1);

    let maxCount = 0;
    let keepType = null;
    for (const id in counts) {
      if (counts[id] > maxCount) {
        maxCount = counts[id];
        keepType = id;
      }
    }

    if (botLevel === 'easy' && botIndex === 2 && roundCounter >= 2) {
      const humanCounts = {};
      hands[0].forEach(c => humanCounts[c.id] = (humanCounts[c.id] || 0) + 1);
      let humanTarget = Object.keys(humanCounts).reduce((a, b) => humanCounts[a] > humanCounts[b] ? a : b);
      const feedIdx = hand.findIndex(c => c.id === humanTarget);
      if (feedIdx !== -1) return feedIdx;
    }

    let discardIdx = hand.findIndex(c => c.id !== keepType);
    return discardIdx !== -1 ? discardIdx : 0;
  }

  function handleOnlinePass(fromRole, slipIdx) {
    pendingMoves[fromRole] = slipIdx;

    const hostNeeded = activeInCycle.includes(0);
    const guestNeeded = activeInCycle.includes(1);

    const hostReady = !hostNeeded || pendingMoves[0] !== null;
    const guestReady = !guestNeeded || pendingMoves[1] !== null;

    if (hostReady && guestReady) {
      executeTurn(pendingMoves[0], pendingMoves[1]);
      pendingMoves = { 0: null, 1: null };
    }
  }

  function executeTurn(hostSlipIdx, guestSlipIdx = null) {
    roundCounter++;
    passBtn.disabled = true;

    // Pick chits from each active player in cycle
    const slipsToPass = {};

    activeInCycle.forEach(p => {
      if (p === 0) {
        const idx = (hostSlipIdx !== null && hostSlipIdx !== undefined) ? hostSlipIdx : 0;
        slipsToPass[0] = hands[0].splice(idx, 1)[0];
      } else if (p === 1) {
        const idx = (isOnline && guestSlipIdx !== null) ? guestSlipIdx : chooseBotDiscard(1);
        slipsToPass[1] = hands[1].splice(idx, 1)[0];
      } else {
        const bIdx = chooseBotDiscard(p);
        slipsToPass[p] = hands[p].splice(bIdx, 1)[0];
      }
    });

    // Pass clockwise to next active in cycle:
    // Clockwise order reference: 0 -> 2 -> 1 -> 3 -> 0
    const fullOrder = [0, 2, 1, 3];
    const cycleParticipants = fullOrder.filter(p => activeInCycle.includes(p));

    for (let i = 0; i < cycleParticipants.length; i++) {
      const fromP = cycleParticipants[i];
      const toP = cycleParticipants[(i + 1) % cycleParticipants.length];
      hands[toP].push(slipsToPass[fromP]);
    }

    selectedIndex = null;
    renderMyHand();

    const mySeat = isOnline ? myRole : 0;
    if (finishedRankings.includes(mySeat)) {
      statusEl.textContent = "You finished! Spectating remaining players...";
    } else {
      statusEl.textContent = "Slips passed clockwise! Check your hand.";
    }

    checkWins();
  }

  function checkWins() {
    // 1. VS BOTS MODE: FIRST TO WIN ENDS MATCH INSTANTLY
    if (!isOnline) {
      for (let p = 0; p < 4; p++) {
        const hand = hands[p];
        if (hand.length === 4 && hand.every(c => c.id === hand[0].id)) {
          isGameOver = true;
          const winningLabel = hand[0].label;
          if (p === 0) {
            statusEl.innerHTML = `🎉 <b>SLIPS COMPLETE!</b> You won with 4x ${winningLabel}!`;
            if (window.ArcadeAuth?.recordGamePlay) window.ArcadeAuth.recordGamePlay(true);
          } else {
            statusEl.innerHTML = `💀 <b>SLIPS COMPLETE!</b> ${getPlayerTitle(p)} won with 4x ${winningLabel}!`;
            if (window.ArcadeAuth?.recordGamePlay) window.ArcadeAuth.recordGamePlay(false);
          }
          passBtn.disabled = true;
          return;
        }
      }
      return;
    }

    // 2. ONLINE MODE: MULTI-STAGE RANKING (1st, 2nd, 3rd, and Final Looser)
    let newlyFinished = false;

    activeInCycle.forEach(p => {
      const hand = hands[p];
      if (hand.length === 4 && hand.every(c => c.id === hand[0].id)) {
        finishedRankings.push(p);
        newlyFinished = true;
      }
    });

    if (newlyFinished) {
      // Remove finished players from passing cycle
      activeInCycle = activeInCycle.filter(p => !finishedRankings.includes(p));
      updateBadges();

      // If only 1 player remains, they are the 4th Place (Looser)!
      if (activeInCycle.length <= 1) {
        if (activeInCycle.length === 1) {
          finishedRankings.push(activeInCycle[0]);
          activeInCycle = [];
        }
        isGameOver = true;
        showFinalRankingsModal();
        return;
      }
    }

    // Check if current user is finished
    const mySeat = isOnline ? myRole : 0;
    if (finishedRankings.includes(mySeat)) {
      passBtn.disabled = true;
      const rankNumber = finishedRankings.indexOf(mySeat) + 1;
      statusEl.innerHTML = `🎉 <b>You secured Rank #${rankNumber}!</b> Remaining players still battling...`;
    }
  }

  function showFinalRankingsModal() {
    passBtn.disabled = true;
    const r1 = getPlayerTitle(finishedRankings[0]);
    const r2 = getPlayerTitle(finishedRankings[1]);
    const r3 = getPlayerTitle(finishedRankings[2]);
    const r4 = getPlayerTitle(finishedRankings[3]);

    const mySeat = isOnline ? myRole : 0;
    const isWinner = finishedRankings[0] === mySeat;
    if (window.ArcadeAuth?.recordGamePlay) {
      window.ArcadeAuth.recordGamePlay(isWinner);
    }

    statusEl.innerHTML = `🏆 <b>GAME OVER!</b> 1st: ${r1} | 4th (Looser): ${r4}`;

    const existingModal = document.getElementById('slips-rank-modal');
    if (existingModal) existingModal.remove();

    const overlay = document.createElement('div');
    overlay.id = 'slips-rank-modal';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 10000;
      background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(12px);
      display: flex; align-items: center; justify-content: center; padding: 16px;
    `;

    overlay.innerHTML = `
      <div style="background: rgba(255,255,255,0.96); backdrop-filter: blur(25px); border-radius: 24px; padding: 26px 22px; max-width: 360px; width: 100%; box-shadow: 0 20px 45px rgba(0,0,0,0.35); text-align: center; border: 1px solid rgba(255,255,255,0.4); font-family: 'Inter', sans-serif; color: #1c1c1e;">
        <div style="font-size: 42px; margin-bottom: 6px;">📜</div>
        <h3 style="margin: 0 0 6px; font-size: 22px; font-weight: 800;">Final Standings</h3>
        <p style="font-size: 13px; color: #636366; margin: 0 0 16px;">All 4 sets of slips have been settled!</p>

        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; text-align: left;">
          <div style="background: rgba(48,209,88,0.12); padding: 10px 14px; border-radius: 12px; font-weight: 700; color: #28cd41; display:flex; justify-content:space-between;">
            <span>🥇 1st Place</span> <span>${r1}</span>
          </div>
          <div style="background: rgba(0,122,255,0.1); padding: 10px 14px; border-radius: 12px; font-weight: 600; color: #007aff; display:flex; justify-content:space-between;">
            <span>🥈 2nd Place</span> <span>${r2}</span>
          </div>
          <div style="background: rgba(255,149,0,0.1); padding: 10px 14px; border-radius: 12px; font-weight: 600; color: #ff9500; display:flex; justify-content:space-between;">
            <span>🥉 3rd Place</span> <span>${r3}</span>
          </div>
          <div style="background: rgba(255,59,48,0.1); padding: 10px 14px; border-radius: 12px; font-weight: 700; color: #ff3b30; display:flex; justify-content:space-between;">
            <span>💀 4th (Looser)</span> <span>${r4}</span>
          </div>
        </div>

        <button id="close-rank-btn" class="cta" style="width: 100%; padding: 12px; font-size: 14px;">Play Another Match</button>
      </div>
    `;

    document.body.appendChild(overlay);
    document.getElementById('close-rank-btn').onclick = () => {
      overlay.remove();
      initMatch();
    };
  }

  // =====================================================================
  //  ONLINE PROTOCOL
  // =====================================================================
  function setupOnline() {
    if (!window.OnlineManager) {
      setTimeout(setupOnline, 300);
      return;
    }

    onlineManager = new OnlineManager('chorsipahi', {
      onPlayerJoined: () => {
        onlineWaitMsg.style.display = 'none';
        initMatch();
      },
      onMoveReceived: (data) => {
        if (data.type === 'sync_deck') {
          initMatch(data.deck, data.types);
        } else if (data.type === 'pass_slip') {
          handleOnlinePass(data.role, data.slipIdx);
        } else if (data.type === 'restart') {
          initMatch();
        }
      },
      onRoomReady: (playerNum) => {
        myRole = playerNum; // 0 = Host, 1 = Guest
      }
    });

    btnCreateRoom.onclick = async () => {
      if (window.ArcadeAuth && !window.ArcadeAuth.canPlay()) return;
      btnCreateRoom.disabled = true;
      btnCreateRoom.textContent = "Creating...";

      const code = await onlineManager.createRoom();
      if (code) {
        dispRoomCode.textContent = code;
        onlineWaitMsg.style.display = 'block';
      } else {
        btnCreateRoom.disabled = false;
        btnCreateRoom.textContent = "Create Room";
      }
    };

    btnJoinRoom.onclick = async () => {
      if (window.ArcadeAuth && !window.ArcadeAuth.canPlay()) return;
      const code = joinCodeInput.value.trim().toUpperCase();
      if (code.length !== 4) return alert("Please enter 4-character code!");

      btnJoinRoom.disabled = true;
      btnJoinRoom.textContent = "...";

      const ok = await onlineManager.joinRoom(code);
      if (!ok) {
        btnJoinRoom.disabled = false;
        btnJoinRoom.textContent = "Join";
      }
    };
  }

  setupOnline();
})();