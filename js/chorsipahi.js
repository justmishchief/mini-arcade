// =====================================================================
//  KING & THIEF: 4-Player Toss Physics, Scattered Chits, and Guessing
// =====================================================================

// ---------- CONSTANTS & ROLES ----------
const ROLES = {
  KING:     { name: 'King',     pts: 1000, emoji: '👑', color: '#ffb300' },
  MINISTER: { name: 'Minister', pts: 800,  emoji: '⚖️', color: '#1e88e5' },
  SOLDIER:  { name: 'Soldier',  pts: 500,  emoji: '⚔️', color: '#43a047' },
  THIEF:    { name: 'Thief',    pts: 0,    emoji: '🎭', color: '#e53935' }
};

const DEFAULT_SEATS = ['human', 'bot', 'bot', 'bot'];
const PLAYER_NAMES = ['You', 'Alex (Bot)', 'Sam (Bot)', 'Leo (Bot)'];

// ---------- ONLINE STATE ----------
let isOnline = false;
let onlineManager = null;
let myRole = 0; // 0 = Player 1 (Host), 1 = Player 2, etc.

// ---------- STATE ----------
let totalRounds = 5;
let currentRound = 1;
let seatTypes = [...DEFAULT_SEATS];
let scores = [0, 0, 0, 0];
let currentAssignment = []; // Shuffled roles assigned to chit indices [0..3]
let chitPickedBy = [-1, -1, -1, -1]; // Stores which player took which chit index
let activePicker = 0;       // Index of player whose turn it is to pick
let animatingToss = false;

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

document.querySelectorAll('[data-rounds]').forEach(b => b.addEventListener('click', () => {
  totalRounds = +b.dataset.rounds;
  document.querySelectorAll('[data-rounds]').forEach(x => x.classList.toggle('on', x === b));
}));

// ---------- FIXED SCATTER DESTINATIONS ----------
function getChitPositions() {
  const table = $('table');
  const w = table.clientWidth || 540;
  const h = table.clientHeight || 360;

  return [
    { left: Math.round(w * 0.18), top: Math.round(h * 0.20), rot: -12 },
    { left: Math.round(w * 0.62), top: Math.round(h * 0.18), rot: 15 },
    { left: Math.round(w * 0.22), top: Math.round(h * 0.60), rot: 18 },
    { left: Math.round(w * 0.65), top: Math.round(h * 0.62), rot: -10 }
  ];
}

// ---------- ROUND WORKFLOW & TOSS ANIMATION ----------
async function startRound(syncedAssignment = null) {
  $('next-btn').style.display = 'none';
  $('round-bar').textContent = 'Round ' + currentRound + ' of ' + totalRounds;

  if (syncedAssignment) {
    currentAssignment = syncedAssignment;
  } else {
    // Shuffle roles among the 4 chits
    const roleKeys = ['KING', 'MINISTER', 'SOLDIER', 'THIEF'];
    for (let i = roleKeys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roleKeys[i], roleKeys[j]] = [roleKeys[j], roleKeys[i]];
    }
    currentAssignment = roleKeys;
    if (isOnline) {
      onlineManager.sendMove({ type: 'sync_round', round: currentRound, assignment: currentAssignment });
    }
  }

  chitPickedBy = [-1, -1, -1, -1];
  activePicker = 0;

  renderScoreboard();
  await executeTossAnimation();
  promptNextPicker();
}

async function executeTossAnimation() {
  animatingToss = true;
  $('status').textContent = '🎲 Shuffling and tossing chits...';

  const table = $('table');
  table.innerHTML = '';
  const positions = getChitPositions();
  const tableW = table.clientWidth || 540;
  const tableH = table.clientHeight || 360;
  const centerX = Math.round(tableW / 2 - 48);
  const centerY = Math.round(tableH / 2 - 34);

  const chitElements = [];
  for (let i = 0; i < 4; i++) {
    const chit = document.createElement('div');
    chit.className = 'chit';
    chit.id = 'chit-' + i;
    chit.style.left = centerX + 'px';
    chit.style.top = centerY + 'px';
    chit.style.transform = 'scale(0.7) rotate(' + (i * 12 - 18) + 'deg)';
    chit.innerHTML = '<div>📜 Chit ' + (i + 1) + '</div>';
    table.appendChild(chit);
    chitElements.push(chit);
  }

  await sleep(250);

  chitElements.forEach((chit, i) => {
    const pos = positions[i];
    chit.style.left = pos.left + 'px';
    chit.style.top = pos.top + 'px';
    chit.style.transform = 'scale(1) rotate(' + pos.rot + 'deg)';
    chit.onclick = () => handleChitClick(i);
  });

  await sleep(650);
  animatingToss = false;
}

function promptNextPicker() {
  if (activePicker >= 4) {
    revealKingMinisterPhase();
    return;
  }

  const pName = PLAYER_NAMES[activePicker];
  const isBot = seatTypes[activePicker] === 'bot';

  if (isOnline) {
    if (activePicker === myRole) {
      $('status').textContent = '👉 Your turn! Tap any remaining chit on the table.';
    } else {
      $('status').textContent = '⏳ ' + pName + ' is choosing a chit...';
    }
    return;
  }

  if (!isBot) {
    $('status').textContent = '👉 Your turn! Tap any of the 4 chits on the table.';
  } else {
    $('status').textContent = pName + ' is choosing a chit...';
    setTimeout(() => {
      const available = [];
      chitPickedBy.forEach((takenBy, idx) => {
        if (takenBy === -1) available.push(idx);
      });
      if (available.length) {
        const chosen = available[Math.floor(Math.random() * available.length)];
        executeChitPick(chosen, activePicker);
      }
    }, 750);
  }
}

function handleChitClick(chitIndex) {
  if (animatingToss) return;
  if (chitPickedBy[chitIndex] !== -1) return;

  if (isOnline) {
    if (activePicker !== myRole) return;
    executeChitPick(chitIndex, myRole);
    onlineManager.sendMove({ type: 'pick_chit', chitIndex, playerIndex: myRole });
    return;
  }

  if (seatTypes[activePicker] === 'bot') return;
  executeChitPick(chitIndex, activePicker);
}

function executeChitPick(chitIndex, playerIndex) {
  chitPickedBy[chitIndex] = playerIndex;
  const roleKey = currentAssignment[chitIndex];

  const chitEl = $('chit-' + chitIndex);
  if (chitEl) {
    chitEl.classList.add('picked');
    chitEl.innerHTML = '<div>📜 Chit ' + (chitIndex + 1) + '</div><span class="chit-tag">' + PLAYER_NAMES[playerIndex] + '</span>';
  }

  const showModal = isOnline ? (playerIndex === myRole) : (seatTypes[playerIndex] === 'human');
  if (showModal) {
    showRoleRevealModal(playerIndex, roleKey, () => {
      activePicker++;
      promptNextPicker();
    });
  } else {
    activePicker++;
    promptNextPicker();
  }
}

function showRoleRevealModal(playerIdx, roleKey, onDismiss) {
  const table = $('table');
  const role = ROLES[roleKey];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
    '<div class="chit-revealed">' +
      '<small style="color:var(--ink2);font-weight:600">' + PLAYER_NAMES[playerIdx] + '</small>' +
      '<div style="font-size:46px;margin:8px 0">' + role.emoji + '</div>' +
      '<div class="role-title" style="color:' + role.color + '">' + role.name + '</div>' +
      '<div class="role-pts">' + role.pts + ' Points</div>' +
      '<p style="font-size:13px;color:var(--ink2);margin:10px 0 16px">Keep your role secret from other players!</p>' +
      '<button class="cta" id="dismiss-chit-btn">Got it</button>' +
    '</div>';

  table.appendChild(overlay);
  $('dismiss-chit-btn').onclick = () => {
    overlay.remove();
    onDismiss();
  };
}

// ---------- MINISTER GUESSING PHASE ----------
function revealKingMinisterPhase() {
  const playerRoles = {};
  for (let chitIdx = 0; chitIdx < 4; chitIdx++) {
    const playerIdx = chitPickedBy[chitIdx];
    playerRoles[playerIdx] = currentAssignment[chitIdx];
  }

  const kingIdx = +Object.keys(playerRoles).find(p => playerRoles[p] === 'KING');
  const ministerIdx = +Object.keys(playerRoles).find(p => playerRoles[p] === 'MINISTER');
  const soldierIdx = +Object.keys(playerRoles).find(p => playerRoles[p] === 'SOLDIER');
  const thiefIdx = +Object.keys(playerRoles).find(p => playerRoles[p] === 'THIEF');

  $('status').textContent = '👑 ' + PLAYER_NAMES[kingIdx] + ' is the King! Calling Minister: ' + PLAYER_NAMES[ministerIdx] + ' reveals!';

  setTimeout(() => {
    promptMinisterGuess(ministerIdx, soldierIdx, thiefIdx);
  }, 1300);
}

function promptMinisterGuess(ministerIdx, soldierIdx, thiefIdx) {
  const isMinisterBot = isOnline ? false : (seatTypes[ministerIdx] === 'bot');
  const suspects = [soldierIdx, thiefIdx].sort(() => Math.random() - 0.5);

  if (isOnline && ministerIdx !== myRole) {
    $('status').textContent = 'Minister (' + PLAYER_NAMES[ministerIdx] + ') is identifying the Thief...';
    return;
  }

  if (isMinisterBot) {
    $('status').textContent = 'Minister ' + PLAYER_NAMES[ministerIdx] + ' is guessing who the Thief is...';
    setTimeout(() => {
      const guessed = suspects[Math.floor(Math.random() * suspects.length)];
      resolveRoundResult(ministerIdx, guessed, thiefIdx, soldierIdx);
    }, 1500);
  } else {
    const table = $('table');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    let buttonsHtml = suspects.map(sIdx =>
      '<button class="btn" style="padding:12px;font-size:16px" data-suspect="' + sIdx + '">' + PLAYER_NAMES[sIdx] + '</button>'
    ).join('');

    overlay.innerHTML =
      '<div class="chit-revealed">' +
        '<div style="font-size:40px">🕵️‍♂️</div>' +
        '<div class="role-title" style="font-size:24px">Find the Thief!</div>' +
        '<p style="font-size:14px;color:var(--ink2);margin-bottom:12px">Minister (' + PLAYER_NAMES[ministerIdx] + '), identify who is hiding as Thief:</p>' +
        '<div class="guess-box">' + buttonsHtml + '</div>' +
      '</div>';

    table.appendChild(overlay);
    overlay.querySelectorAll('[data-suspect]').forEach(btn => {
      btn.onclick = () => {
        const guessedIdx = +btn.dataset.suspect;
        overlay.remove();
        if (isOnline) {
          onlineManager.sendMove({ type: 'minister_guess', ministerIdx, guessedIdx, thiefIdx, soldierIdx });
        }
        resolveRoundResult(ministerIdx, guessedIdx, thiefIdx, soldierIdx);
      };
    });
  }
}

// ---------- SCORING & RESOLUTION ----------
function resolveRoundResult(ministerIdx, guessedIdx, actualThiefIdx, soldierIdx) {
  const correct = guessedIdx === actualThiefIdx;

  const kingIdx = [0, 1, 2, 3].find(p => !([ministerIdx, actualThiefIdx, soldierIdx].includes(p)));
  scores[kingIdx] += ROLES.KING.pts;
  scores[soldierIdx] += ROLES.SOLDIER.pts;

  let msg = '';
  if (correct) {
    scores[ministerIdx] += ROLES.MINISTER.pts;
    scores[actualThiefIdx] += ROLES.THIEF.pts;
    msg = '🎉 ' + PLAYER_NAMES[ministerIdx] + ' caught ' + PLAYER_NAMES[actualThiefIdx] + ' correctly! Minister gets 800 pts.';
  } else {
    scores[ministerIdx] += 0;
    scores[actualThiefIdx] += ROLES.MINISTER.pts;
    msg = '❌ Wrong guess! ' + PLAYER_NAMES[actualThiefIdx] + ' was the Thief and steals 800 pts!';
  }

  $('status').textContent = msg;
  renderScoreboard();
  showAllRolesOnTable();

  if (currentRound < totalRounds) {
    if (!isOnline || myRole === 0) {
      $('next-btn').style.display = 'inline-block';
      $('next-btn').textContent = 'Next Round (' + (currentRound + 1) + '/' + totalRounds + ')';
    } else {
      $('status').textContent += ' (Waiting for Host to start next round...)';
    }
  } else {
    finishGame();
  }
}

function showAllRolesOnTable() {
  for (let chitIdx = 0; chitIdx < 4; chitIdx++) {
    const playerIdx = chitPickedBy[chitIdx];
    const roleKey = currentAssignment[chitIdx];
    const role = ROLES[roleKey];
    const chitEl = $('chit-' + chitIdx);

    if (chitEl) {
      chitEl.className = 'chit picked';
      chitEl.style.borderColor = role.color;
      chitEl.innerHTML =
        '<div style="text-align:center;font-size:13px">' +
          '<b>' + role.emoji + ' ' + role.name + '</b><br>' +
          '<small style="color:var(--ink2)">' + PLAYER_NAMES[playerIdx] + '</small>' +
        '</div>';
    }
  }
}

function renderScoreboard() {
  $('score-cards').innerHTML = PLAYER_NAMES.map((nm, i) =>
    '<div class="pcard"><span class="dot" style="background:#8d6e63"></span>' +
    nm + ': <b>' + scores[i] + ' pts</b></div>'
  ).join('');
}

function finishGame() {
  let highest = -1, winner = 0;
  scores.forEach((s, i) => {
    if (s > highest) { highest = s; winner = i; }
  });
  $('status').textContent = '🏆 Game Over! ' + PLAYER_NAMES[winner] + ' wins with ' + highest + ' points!';
  if (window.ArcadeAuth) ArcadeAuth.recordGamePlay(winner === 0);

  if (!isOnline || myRole === 0) {
    $('next-btn').style.display = 'inline-block';
    $('next-btn').textContent = 'Play Again';
    $('next-btn').onclick = () => {
      scores = [0, 0, 0, 0];
      currentRound = 1;
      if (isOnline) onlineManager.sendMove({ type: 'restart' });
      startRound();
    };
  }
}

// ---------- ONLINE PROTOCOL ----------
function setupOnline() {
  onlineManager = new OnlineManager('chorsipahi', {
    onPlayerJoined: () => {
      $('online-wait-msg').style.display = 'none';
      seatTypes = ['human', 'human', 'bot', 'bot'];
      scores = [0, 0, 0, 0];
      currentRound = 1;
      $('setup').style.display = 'none';
      $('game').style.display = '';
      startRound();
    },
    onMoveReceived: (data) => {
      if (data.type === 'sync_round') {
        currentRound = data.round;
        seatTypes = ['human', 'human', 'bot', 'bot'];
        $('setup').style.display = 'none';
        $('game').style.display = '';
        startRound(data.assignment);
      } else if (data.type === 'pick_chit') {
        executeChitPick(data.chitIndex, data.playerIndex);
      } else if (data.type === 'minister_guess') {
        resolveRoundResult(data.ministerIdx, data.guessedIdx, data.thiefIdx, data.soldierIdx);
      } else if (data.type === 'restart') {
        scores = [0, 0, 0, 0];
        currentRound = 1;
        startRound();
      }
    },
    onRoomReady: (playerNum) => {
      myRole = playerNum;
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

// ---------- BUTTON HANDLERS ----------
$('start').onclick = () => {
  if (window.ArcadeAuth && !ArcadeAuth.canPlay()) return;
  seatTypes = ['human', 'bot', 'bot', 'bot'];
  scores = [0, 0, 0, 0];
  currentRound = 1;
  $('setup').style.display = 'none';
  $('game').style.display = '';
  startRound();
};

$('next-btn').onclick = () => {
  currentRound++;
  startRound();
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
};

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

setupOnline();