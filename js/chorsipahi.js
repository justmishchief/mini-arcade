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
const PLAYER_NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];

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

// ---------- SETUP LOGIC ----------
function renderSetup() {
  const seatsEl = $('seats');
  seatsEl.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const row = document.createElement('div');
    row.className = 'seat';
    row.innerHTML = '<span class="dot" style="background:#8d6e63"></span><span class="name">' + PLAYER_NAMES[i] + '</span>';
    ['human', 'bot'].forEach(t => {
      const b = document.createElement('button');
      b.textContent = t === 'human' ? 'Human' : 'Bot 🤖';
      if (seatTypes[i] === t) b.className = 'on';
      b.onclick = () => {
        seatTypes[i] = t;
        renderSetup();
      };
      row.appendChild(b);
    });
    seatsEl.appendChild(row);
  }
}

document.querySelectorAll('[data-rounds]').forEach(b => b.addEventListener('click', () => {
  totalRounds = +b.dataset.rounds;
  document.querySelectorAll('[data-rounds]').forEach(x => x.classList.toggle('on', x === b));
}));

// ---------- FIXED SCATTER DESTINATIONS ----------
// Guarantees 4 chits are placed at 4 distinct quadrants without overlapping or corner cut-offs
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
async function startRound() {
  $('next-btn').style.display = 'none';
  $('round-bar').textContent = 'Round ' + currentRound + ' of ' + totalRounds;

  // Shuffle roles among the 4 chits
  const roleKeys = ['KING', 'MINISTER', 'SOLDIER', 'THIEF'];
  for (let i = roleKeys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roleKeys[i], roleKeys[j]] = [roleKeys[j], roleKeys[i]];
  }
  currentAssignment = roleKeys;
  chitPickedBy = [-1, -1, -1, -1];
  activePicker = 0;

  renderScoreboard();
  await executeTossAnimation();
  promptNextPicker();
}

// Animates chits flying from table center to their respective scattered spots
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

  // Initialize all 4 chits stacked together at the center
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

  // Animate outward scatter to the four corners
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

// Updates instructions and controls turn sequence
function promptNextPicker() {
  if (activePicker >= 4) {
    revealKingMinisterPhase();
    return;
  }

  const pName = PLAYER_NAMES[activePicker];
  const isBot = seatTypes[activePicker] === 'bot';

  if (!isBot) {
    $('status').textContent = '👉 ' + pName + ': Tap any of the 4 chits on the table!';
  } else {
    $('status').textContent = pName + ' 🤖 is choosing a chit...';
    setTimeout(() => {
      // Pick any unpicked chit
      const available = [];
      chitPickedBy.forEach((takenBy, idx) => {
        if (takenBy === -1) available.push(idx);
      });
      if (available.length) {
        const chosen = available[Math.floor(Math.random() * available.length)];
        executeChitPick(chosen, activePicker);
      }
    }, 800);
  }
}

function handleChitClick(chitIndex) {
  if (animatingToss) return;
  // If chit is already taken, ignore
  if (chitPickedBy[chitIndex] !== -1) return;
  // If active turn is bot, ignore click
  if (seatTypes[activePicker] === 'bot') return;

  executeChitPick(chitIndex, activePicker);
}

function executeChitPick(chitIndex, playerIndex) {
  chitPickedBy[chitIndex] = playerIndex;
  const roleKey = currentAssignment[chitIndex];

  // Mark chit visually on table
  const chitEl = $('chit-' + chitIndex);
  if (chitEl) {
    chitEl.classList.add('picked');
    chitEl.innerHTML = '<div>📜 Chit ' + (chitIndex + 1) + '</div><span class="chit-tag">' + PLAYER_NAMES[playerIndex] + '</span>';
  }

  const isHuman = seatTypes[playerIndex] === 'human';
  if (isHuman) {
    showRoleRevealModal(playerIndex, roleKey, () => {
      activePicker++;
      promptNextPicker();
    });
  } else {
    activePicker++;
    promptNextPicker();
  }
}

// Secret modal popup to reveal role to human player
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
  const isMinisterBot = seatTypes[ministerIdx] === 'bot';
  const suspects = [soldierIdx, thiefIdx].sort(() => Math.random() - 0.5);

  if (isMinisterBot) {
    $('status').textContent = 'Minister ' + PLAYER_NAMES[ministerIdx] + ' 🤖 is guessing who the Thief is...';
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
    $('next-btn').style.display = 'inline-block';
    $('next-btn').textContent = 'Next Round (' + (currentRound + 1) + '/' + totalRounds + ')';
  } else {
    finishGame();
  }
}

function showAllRolesOnTable() {
  const positions = getChitPositions();

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
    nm + (seatTypes[i] === 'bot' ? ' 🤖' : '') + ': <b>' + scores[i] + ' pts</b></div>'
  ).join('');
}

function finishGame() {
  let highest = -1, winner = 0;
  scores.forEach((s, i) => {
    if (s > highest) { highest = s; winner = i; }
  });
  $('status').textContent = '🏆 Game Over! ' + PLAYER_NAMES[winner] + ' wins with ' + highest + ' points!';
  $('next-btn').style.display = 'inline-block';
  $('next-btn').textContent = 'Play Again';
  $('next-btn').onclick = () => {
    scores = [0, 0, 0, 0];
    currentRound = 1;
    startRound();
  };
}

// ---------- BUTTON HANDLERS ----------
$('start').onclick = () => {
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
  $('game').style.display = 'none';
  $('setup').style.display = '';
  renderSetup();
};

renderSetup();