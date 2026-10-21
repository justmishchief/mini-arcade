// =====================================================================
//  ATLAS (WORD BATTLE) GAME ENGINE WITH OFFLINE GEOGRAPHY DICTIONARY
// =====================================================================

(function() {
  const ATLAS_DICT = [
    // A
    "afghanistan", "albania", "algeria", "andorra", "angola", "argentina", "armenia", "australia", "austria", "azerbaijan",
    "amsterdam", "athens", "ankara", "abu dhabi", "auckland", "almaty", "agesta", "ahmedabad", "agra", "amritsar", "astana",
    // B
    "bahamas", "bahrain", "bangladesh", "barbados", "belarus", "belgium", "belize", "benin", "bhutan", "bolivia", "bosnia",
    "brazil", "bulgaria", "berlin", "bangkok", "beijing", "brussels", "budapest", "buenos aires", "bengaluru", "bhopal", "baghdad", "beirut",
    // C
    "cambodia", "cameroon", "canada", "chile", "china", "colombia", "cuba", "cyprus", "croatia",
    "cairo", "canberra", "cape town", "copenhagen", "chicago", "chennai", "chandigarh", "colombo", "calgary",
    // D
    "denmark", "djibouti", "dominica", "delhi", "dhaka", "dubai", "doha", "dublin", "damascus", "durban", "dallas", "dehradun",
    // E
    "ecuador", "egypt", "estonia", "ethiopia", "edinburgh", "eindhoven", "erbil", "erawan", "erfurt",
    // F
    "fiji", "finland", "france", "frankfurt", "fukuoka", "florence", "freetown", "faisalabad",
    // G
    "gabon", "gambia", "georgia", "germany", "ghana", "greece", "grenada", "guatemala", "guyana",
    "geneva", "guangzhou", "glasgow", "goa", "guwahati", "gaza", "gdansk",
    // H
    "haiti", "honduras", "hungary", "helsinki", "havana", "hanoi", "hong kong", "hyderabad", "houston", "hamburg",
    // I
    "iceland", "india", "indonesia", "iran", "iraq", "ireland", "israel", "italy",
    "islamabad", "istanbul", "incheon", "indore", "imphal", "innsbruck",
    // J
    "jamaica", "japan", "jordan", "jakarta", "jerusalem", "johannesburg", "jaipur", "jodhpur", "jabalpur", "jeddah",
    // K
    "kazakhstan", "kenya", "kuwait", "kyrgyzstan", "kabul", "kyiv", "kuala lumpur", "kathmandu", "kolkata", "kochi", "kanpur", "karachi", "krakow",
    // L
    "laos", "latvia", "lebanon", "liberia", "libya", "lithuania", "luxembourg",
    "london", "lisbon", "lima", "los angeles", "lucknow", "lahore", "lyon", "leipzig",
    // M
    "madagascar", "malaysia", "maldives", "mali", "malta", "mexico", "monaco", "mongolia", "morocco", "myanmar",
    "madrid", "manila", "moscow", "mumbai", "munich", "milan", "melbourne", "montreal", "muscat", "manchester",
    // N
    "namibia", "nepal", "netherlands", "new zealand", "nicaragua", "nigeria", "norway",
    "nairobi", "new york", "nagpur", "noida", "naples", "nice", "nassau",
    // O
    "oman", "oslo", "ottawa", "osaka", "orlando", "oxford", "omsk",
    // P
    "pakistan", "palau", "panama", "paraguay", "peru", "philippines", "poland", "portugal",
    "paris", "prague", "pyongyang", "pune", "patna", "perth", "porto", "phuket",
    // Q
    "qatar", "quito", "quebec", "qingdao", "quetta",
    // R
    "romania", "russia", "rwanda", "rome", "riyadh", "reykjavik", "rio de janeiro", "ranchi", "rotterdam", "riga",
    // S
    "saudi arabia", "senegal", "serbia", "singapore", "slovakia", "slovenia", "somalia", "south africa", "south korea", "spain", "sri lanka", "sudan", "sweden", "switzerland", "syria",
    "seoul", "stockholm", "sydney", "shanghai", "srinagar", "surat", "san francisco", "seattle",
    // T
    "taiwan", "tajikistan", "tanzania", "thailand", "togo", "tunisia", "turkey",
    "tokyo", "taipei", "tehran", "tashkent", "toronto", "thiruvananthapuram", "tbilisi",
    // U
    "uganda", "ukraine", "united arab emirates", "united kingdom", "united states", "uruguay", "uzbekistan", "ulaanbaatar", "utrecht", "udaipur",
    // V
    "vanuatu", "vatican city", "venezuela", "vietnam", "vienna", "vientiane", "vancouver", "venice", "valencia", "varanasi",
    // W
    "warsaw", "washington", "wellington", "wuhan", "windhoek", "wroclaw",
    // Y
    "yemen", "yaounde", "yerevan", "yokohama", "yangon",
    // Z
    "zambia", "zimbabwe", "zagreb", "zurich", "zaragoza"
  ];

  const AudioEngine = {
    ctx: null,
    init() {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
      }
    },
    playTone(freq, duration = 0.1, type = 'sine') {
      try {
        this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
      } catch(e) {}
    },
    playSuccess() { this.playTone(587.33, 0.12); setTimeout(() => this.playTone(880, 0.15), 100); },
    playFail() { this.playTone(220, 0.25, 'triangle'); if (navigator.vibrate) navigator.vibrate(60); }
  };

  let turnTime = 15;
  let isBot = true;
  let isOnline = false;
  let onlineManager = null;
  let myRole = 0; // 0 = Host (P1), 1 = Guest (P2)
  let botLevel = 'easy';
  let turn = 1; // 1 = P1, 2 = P2 / Bot
  let p1Lives = 3;
  let p2Lives = 3;
  let currentLetter = 'A';
  let usedWords = new Set();
  let timer = null;
  let timeLeft = turnTime;
  let isGameOver = false;

  const validSet = new Set(ATLAS_DICT.map(w => w.toLowerCase().trim()));

  function initGame(startingLetter = null) {
    p1Lives = 3;
    p2Lives = 3;
    turn = 1;
    isGameOver = false;
    usedWords.clear();
    document.getElementById('history-box').innerHTML = '';
    document.getElementById('feedback-msg').textContent = '';
    
    if (isOnline) {
      document.getElementById('p2-label').textContent = 'Opponent';
    } else {
      document.getElementById('p2-label').textContent = isBot ? 'Bot' : 'Player 2';
    }

    if (startingLetter) {
      currentLetter = startingLetter;
    } else {
      const starters = ['A', 'B', 'C', 'D', 'E', 'I', 'M', 'N', 'P', 'R', 'S', 'T'];
      currentLetter = starters[Math.floor(Math.random() * starters.length)];
      if (isOnline && myRole === 0 && onlineManager) {
        onlineManager.sendMove({ type: 'sync_start', letter: currentLetter });
      }
    }
    
    updateHUD();
    startTurn();
  }

  function updateHUD() {
    document.getElementById('p1-hearts').textContent = '❤️'.repeat(Math.max(0, p1Lives));
    document.getElementById('p2-hearts').textContent = '❤️'.repeat(Math.max(0, p2Lives));
    document.getElementById('target-letter').textContent = currentLetter;
    
    let pName = "";
    if (isOnline) {
      const isMyTurn = (turn === 1 && myRole === 0) || (turn === 2 && myRole === 1);
      pName = isMyTurn ? "Your Turn" : "Opponent is Thinking...";
    } else {
      pName = (turn === 1) ? "P1's Turn" : (isBot ? "Bot is Thinking..." : "P2's Turn");
    }

    document.getElementById('status-turn').textContent = pName;
    document.getElementById('status-turn').style.color = (turn === 1) ? "var(--ink)" : "var(--accent2)";
  }

  function startTurn() {
    clearInterval(timer);
    if (isGameOver) return;
    
    timeLeft = turnTime;
    renderTimer();
    updateHUD();

    const input = document.getElementById('word-input');
    const submitBtn = document.getElementById('btn-submit');
    
    const isMyTurn = isOnline
      ? ((turn === 1 && myRole === 0) || (turn === 2 && myRole === 1))
      : (turn === 1 || !isBot);

    if (!isMyTurn) {
      input.disabled = true;
      submitBtn.disabled = true;
      input.placeholder = isOnline ? "Opponent is typing..." : "Bot is typing...";
      if (!isOnline && turn === 2 && isBot) {
        setTimeout(botPlay, 1200 + Math.random() * 1500);
      }
    } else {
      input.disabled = false;
      submitBtn.disabled = false;
      input.placeholder = `Enter a place starting with '${currentLetter}'...`;
      input.value = '';
      input.focus();
    }

    timer = setInterval(() => {
      timeLeft--;
      renderTimer();
      if (timeLeft <= 0) {
        clearInterval(timer);
        handleTimeout();
      }
    }, 1000);
  }

  function renderTimer() {
    const bar = document.getElementById('timer-bar');
    const pct = Math.max(0, (timeLeft / turnTime) * 100);
    bar.style.width = pct + '%';
    bar.style.backgroundColor = (pct < 30) ? '#ff3b30' : (pct < 60 ? '#ff9f0a' : '#34c759');
  }

  function handleTimeout() {
    AudioEngine.playFail();
    const fb = document.getElementById('feedback-msg');
    
    let who = "";
    if (isOnline) {
      const isMyTurn = (turn === 1 && myRole === 0) || (turn === 2 && myRole === 1);
      who = isMyTurn ? "You" : "Opponent";
    } else {
      who = (turn === 1) ? "Player 1" : (isBot ? "Bot" : "Player 2");
    }

    fb.textContent = `⏰ Time's up! ${who} lost a heart.`;
    fb.style.color = '#ff3b30';

    if (turn === 1) p1Lives--;
    else p2Lives--;

    if (p1Lives <= 0 || p2Lives <= 0) {
      endMatch(p1Lives > 0 ? 1 : 2);
    } else {
      turn = (turn === 1) ? 2 : 1;
      startTurn();
    }
  }

  function validateAndSubmit(word, fromRemote = false) {
    const fb = document.getElementById('feedback-msg');
    const cleaned = word.toLowerCase().trim();

    if (!cleaned) return;

    if (!cleaned.startsWith(currentLetter.toLowerCase())) {
      AudioEngine.playFail();
      fb.textContent = `❌ Must start with '${currentLetter}'!`;
      fb.style.color = '#ff3b30';
      return;
    }

    if (usedWords.has(cleaned)) {
      AudioEngine.playFail();
      fb.textContent = `❌ '${word}' has already been used!`;
      fb.style.color = '#ff3b30';
      return;
    }

    if (!validSet.has(cleaned)) {
      AudioEngine.playFail();
      fb.textContent = `❌ '${word}' not recognized as a valid country/city!`;
      fb.style.color = '#ff3b30';
      return;
    }

    AudioEngine.playSuccess();
    fb.textContent = `✅ Great! '${word}' accepted.`;
    fb.style.color = '#34c759';

    usedWords.add(cleaned);
    addHistoryChip(word);

    const lastChar = cleaned.charAt(cleaned.length - 1).toUpperCase();
    currentLetter = lastChar;

    if (isOnline && !fromRemote && onlineManager) {
      onlineManager.sendMove({ type: 'word_played', word: cleaned });
    }

    document.getElementById('word-input').value = '';
    turn = (turn === 1) ? 2 : 1;
    startTurn();
  }

  function botPlay() {
    if (isGameOver || turn !== 2) return;

    const prefix = currentLetter.toLowerCase();
    const available = ATLAS_DICT.filter(w => w.startsWith(prefix) && !usedWords.has(w));

    let failChance = 0.35;
    if (botLevel === 'med') failChance = 0.15;
    if (botLevel === 'hard') failChance = 0.02;

    if (!available.length || Math.random() < failChance) {
      return;
    }

    const choice = available[Math.floor(Math.random() * available.length)];
    validateAndSubmit(choice);
  }

  function addHistoryChip(word) {
    const box = document.getElementById('history-box');
    const chip = document.createElement('span');
    chip.className = 'word-chip';
    const first = word.charAt(0).toUpperCase();
    const last = word.charAt(word.length - 1).toUpperCase();
    chip.innerHTML = `<b>${first}</b>${word.slice(1, -1)}<b>${last}</b>`;
    box.appendChild(chip);
    box.scrollTop = box.scrollHeight;
  }

  function endMatch(winner) {
    isGameOver = true;
    clearInterval(timer);
    updateHUD();

    const fb = document.getElementById('feedback-msg');
    let msg = "";
    if (isOnline) {
      const iWon = (winner === 1 && myRole === 0) || (winner === 2 && myRole === 1);
      msg = iWon ? "🎉 You Won the Word Battle!" : "💀 Opponent Won the Word Battle!";
    } else {
      msg = (winner === 1) ? "🎉 Player 1 Won the Word Battle!" : (isBot ? "🤖 Bot Won!" : "🎉 Player 2 Won!");
    }

    fb.textContent = msg;
    fb.style.color = 'var(--accent2)';

    document.getElementById('word-input').disabled = true;
    document.getElementById('btn-submit').disabled = true;

    if (window.ArcadeAuth && typeof window.ArcadeAuth.recordGamePlay === 'function') {
      window.ArcadeAuth.recordGamePlay(winner === 1);
    }
  }

  // Turn Timer Selection Listeners
  document.querySelectorAll('#timer-row button').forEach(btn => {
    btn.onclick = function() {
      document.querySelectorAll('#timer-row button').forEach(b => b.classList.remove('on'));
      this.classList.add('on');
      turnTime = parseInt(this.getAttribute('data-time'), 10) || 15;
    };
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

    onlineManager = new OnlineManager('atlas', {
      onPlayerJoined: () => {
        document.getElementById('online-wait-msg').style.display = 'none';
        myRole = 0;
        document.getElementById('setup').style.display = 'none';
        document.getElementById('game').style.display = 'block';
        initGame();
      },
      onMoveReceived: (data) => {
        if (data.type === 'word_played') {
          validateAndSubmit(data.word, true);
        } else if (data.type === 'sync_start') {
          initGame(data.letter);
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

  document.getElementById('btn-submit').onclick = () => {
    validateAndSubmit(document.getElementById('word-input').value);
  };

  document.getElementById('word-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      validateAndSubmit(e.target.value);
    }
  });

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
    clearInterval(timer);
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