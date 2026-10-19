// =====================================================================
//  MINI ARCADE HOME ENGINE: Tabs (Games/Rules/About) + Hero Cards + Rules Modal
// =====================================================================

const GAME_DATA = [
  {
    id: "penfight",
    title: "Pen Fight",
    icon: "🖊️",
    href: "penfight.html",
    desc: "Heavy pen football fight arena. Strike & score goals!",
    meta: "Online · Bots · 2 Players",
    g1: "#007aff",
    g2: "#5856d6",
    rules: {
      desc: "A heavy-weight desk arena football clash using school pens.",
      points: [
        "Drag back from your pen to aim and adjust flicking force.",
        "Release to strike your pen towards the opponent's pen.",
        "Knock the opponent's pen into their goal net to score a goal.",
        "First player to score 3 goals wins the match."
      ]
    }
  },
  {
    id: "chorsipahi",
    title: "King & Thief",
    icon: "📜",
    href: "chorsipahi.html",
    desc: "Secret chits: find who the thief is.",
    meta: "4 Players · Bots",
    g1: "#d48806",
    g2: "#5b8c00",
    rules: {
      desc: "The timeless 4-chit game: Raja, Mantri, Chor, Sipahi.",
      points: [
        "4 chits are tossed on the table: King (1000 pts), Minister (800 pts), Soldier (500 pts), and Thief (0 pts).",
        "Each player secretly picks one chit to reveal their role.",
        "King announces himself and commands the Minister to identify who the Thief is.",
        "If Minister guesses correctly, Minister gets 800 pts. If wrong, the Thief steals the 800 pts!"
      ]
    }
  },
  {
    id: "tictactoe",
    title: "Tic Tac Toe",
    icon: "❌",
    href: "tictactoe.html",
    desc: "The classic 3x3 grid match with online room codes.",
    meta: "Online rooms · Bot",
    g1: "#48484a",
    g2: "#98989d",
    rules: {
      desc: "Classic 3x3 row and column alignment match.",
      points: [
        "Player 1 plays as X and Player 2/Bot plays as O.",
        "Take turns placing your mark in any empty cell on the 3x3 board.",
        "The first player to align 3 marks horizontally, vertically, or diagonally wins.",
        "If all 9 cells fill without 3-in-a-row, it ends in a Draw."
      ]
    }
  },
  {
    id: "snakeladder",
    title: "Snake & Ladder",
    icon: "🐍",
    href: "snakeladder.html",
    desc: "Climb up ladders, slide down snakes to block 100.",
    meta: "2 to 6 players · Bots",
    g1: "#30d158",
    g2: "#0a8f6a",
    rules: {
      desc: "Classic race to the top of the 100-cell board.",
      points: [
        "Roll the dice to move your token forward block-by-block.",
        "Landing on the base of a ladder climbs you up to its top.",
        "Landing on a snake's head bites and slides you down to its tail.",
        "Rolling a 6 earns you a bonus turn. First to hit block 100 wins!"
      ]
    }
  },
  {
    id: "ludo",
    title: "Ludo",
    icon: "🎲",
    href: "ludo.html",
    desc: "Roll a 6, navigate the track, and race home.",
    meta: "Bots · 2-6 players",
    g1: "#ff9f0a",
    g2: "#ff375f",
    rules: {
      desc: "Traditional Indian board race for 2 to 6 players.",
      points: [
        "Roll a 6 to bring a token out of your starting yard onto the track.",
        "Navigate clockwise around the perimeter towards your home column.",
        "Land on an opponent's token on normal squares to capture it and send it back to their yard.",
        "Star squares and starting positions are safe zones.",
        "Get all 4 tokens into the central home triangle to win."
      ]
    }
  },
  {
    id: "chess",
    title: "Chess",
    icon: "♞",
    href: "chess.html",
    desc: "Full standard chess rules with 3 tactical AI bot levels.",
    meta: "Bot · 2 Players · Online",
    g1: "#1c1c1e",
    g2: "#58585c",
    rules: {
      desc: "The classic game of strategic warfare and checkmate.",
      points: [
        "White always moves first. Tap any piece to see valid legal moves highlighted.",
        "Protect your King while placing the opponent's King under an inescapable attack (Checkmate).",
        "Includes standard castling, en passant, and pawn promotion to Queen.",
        "Play against 3 minimax bot difficulties or 1v1 with a friend."
      ]
    }
  },
  {
    id: "carrom",
    title: "Carrom",
    icon: "🔴",
    href: "carrom.html",
    desc: "Flick the striker, pocket coins, and cover the queen.",
    meta: "2 players · Bot · Online",
    g1: "#ffb340",
    g2: "#ff6b35",
    rules: {
      desc: "Smooth board striking physics with carrommen and the Queen.",
      points: [
        "Slide the striker along your baseline, drag backward to set power and release to strike.",
        "Player 1 pockets White coins; Player 2 pockets Black coins.",
        "Pocketing the Red Queen requires you to pocket another of your coins on the next shot (Covering).",
        "Pocketing the striker is a foul, returning one of your coins as a penalty."
      ]
    }
  },
  {
    id: "cricket",
    title: "Hand Cricket",
    icon: "🏏",
    href: "cricket.html",
    desc: "Show a number, don't get matched. Classic school fun.",
    meta: "2 players · Bot · Online",
    g1: "#34c759",
    g2: "#0f9d9a",
    rules: {
      desc: "Simultaneous finger-number guessing cricket clash.",
      points: [
        "Toss with odd or even to choose Batting or Bowling first.",
        "Both players simultaneously choose a number between 1 and 6.",
        "If numbers match: Batsman is OUT!",
        "If numbers differ: Batsman scores the runs of their chosen number.",
        "Switch innings after overs/wickets end to chase down the target."
      ]
    }
  }
];

// ---------- TAB NAVIGATION (All games / Rules / About) ----------
function setupTabs() {
  const tabs = document.querySelectorAll('#tabs button');
  const viewGames = document.getElementById('view-games');
  const viewRules = document.getElementById('view-rules');
  const viewAbout = document.getElementById('view-about');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('on'));
      tab.classList.add('on');

      const target = tab.dataset.tab;
      viewGames.style.display = target === 'games' ? '' : 'none';
      viewRules.style.display = target === 'rules' ? '' : 'none';
      viewAbout.style.display = target === 'about' ? '' : 'none';
    });
  });
}

// ---------- COMPACT RULES CARDS & MODAL ----------
function renderRulesGrid() {
  const container = document.getElementById('rules-container');
  if (!container) return;

  container.innerHTML = GAME_DATA.map(game => `
    <div class="rule-box" data-game="${game.id}">
      <span class="rb-icon">${game.icon}</span>
      <span class="rb-title">${game.title}</span>
    </div>
  `).join('');

  const modal = document.getElementById('rule-modal');
  const titleEl = document.getElementById('rm-title');
  const descEl = document.getElementById('rm-desc');
  const pointsEl = document.getElementById('rm-points');
  const closeBtn = document.getElementById('rm-close');

  container.querySelectorAll('.rule-box').forEach(box => {
    box.addEventListener('click', () => {
      const gId = box.dataset.game;
      const game = GAME_DATA.find(g => g.id === gId);
      if (!game) return;

      titleEl.innerHTML = `${game.icon} ${game.title} Rules`;
      descEl.textContent = game.rules.desc;
      pointsEl.innerHTML = game.rules.points.map(pt => `<li>${pt}</li>`).join('');
      modal.style.display = 'flex';
    });
  });

  closeBtn.onclick = () => { modal.style.display = 'none'; };
  modal.onclick = (e) => {
    if (e.target === modal) modal.style.display = 'none';
  };
}

// ---------- RANDOM HERO CARDS (Every reload 2 random games) ----------
function renderRandomHeroes() {
  const container = document.getElementById('hero-container');
  if (!container) return;

  const shuffled = [...GAME_DATA].sort(() => 0.5 - Math.random());
  const picks = shuffled.slice(0, 2);

  container.innerHTML = picks.map(game => `
    <a class="hero-card" href="${game.href}" style="--g1:${game.g1};--g2:${game.g2}">
      <span class="art">${game.icon}</span>
      <span class="badge">● Playable now</span>
      <div class="txt">
        <h2>${game.title}</h2>
        <p>${game.desc}</p>
      </div>
      <div class="hero-bar">
        <div class="ico">${game.icon}</div>
        <div class="meta">
          <b>${game.title}</b>
          <small>${game.meta}</small>
        </div>
        <span class="playbtn">Play</span>
      </div>
    </a>
  `).join('');
}

// ---------- INIT ----------
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  renderRandomHeroes();
  renderRulesGrid();
});