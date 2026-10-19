// ---------- SETTINGS AND STATE ----------
const HAND = ['', '☝️', '✌️', '🤟', '🖖', '🖐️', '👍'];       // hand emoji for the numbers 1 to 6
const cfg = { mode: 'bot', level: 'medium', wk: 1, balls: 0 };   // balls: 0 = unlimited
const tally = { p0: 0, p1: 0, tie: 0 };                          // wins across matches in this visit
let S = null;                                                    // the current match

const $ = id => document.getElementById(id);
const nm = p => cfg.mode === 'bot' ? ['You', 'Bot'][p] : ['Player 1', 'Player 2'][p];
const freshPick = () => ({ stage: 0, vals: [null, null], cover: false });
const rnd = () => 1 + Math.floor(Math.random() * 6);

// ---------- SETUP SCREEN ----------
function pickOption(attr, onChange) {
  document.querySelectorAll('[data-' + attr + ']').forEach(b => b.addEventListener('click', () => {
    if (b.disabled) return;
    document.querySelectorAll('[data-' + attr + ']').forEach(x => x.classList.toggle('on', x === b));
    onChange(b.dataset[attr]);
  }));
}
pickOption('mode', v => { cfg.mode = v; $('level-row').style.display = v === 'bot' ? '' : 'none'; });
pickOption('level', v => cfg.level = v);
pickOption('wk', v => cfg.wk = +v);
pickOption('balls', v => cfg.balls = +v);

$('start').onclick = () => {
  S = {
    phase: 'tosscall', call: null, winner: 0, botChoice: null,
    innings: 1, batter: 0, runs: [0, 0], outs: [0, 0], balls: [0, 0],
    log: [], last: null, pick: freshPick(), result: '',
    humanBat: [], humanBowl: []                                  // what the human played (the bot studies this)
  };
  $('setup').style.display = 'none';
  $('game').style.display = '';
  render();
};
$('quit').onclick = () => { S = null; $('game').style.display = 'none'; $('setup').style.display = ''; };

// ---------- BOT BRAIN ----------
// Guess how likely the human is to play each number (recent moves count more; Hard also learns "after X comes Y")
function predict(arr, useChains, other) {
  const w = [0, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05];
  arr.forEach((x, i) => { w[x] += Math.pow(0.88, arr.length - 1 - i); });
  (other || []).forEach(x => { w[x] += 0.4; });   // a person's favourite numbers show up in both roles
  if (useChains && arr.length > 1) {
    const last = arr[arr.length - 1];
    for (let i = 0; i < arr.length - 1; i++) if (arr[i] === last) w[arr[i + 1]] += 1.5;
  }
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map(x => x / sum);
}
function sample(p) {
  let r = Math.random(), acc = 0;
  for (let n = 1; n <= 6; n++) { acc += p[n]; if (r <= acc) return n; }
  return 6;
}

// The bot's number for this ball
function botNumber() {
  if (S.phase !== 'play') return rnd();                          // the toss is pure luck
  const lvl = cfg.level, botBats = S.batter === 1;
  if (!botBats) {
    // Bot bowls: it wins by matching the human's batting number, so it tries to guess it
    const p = predict(S.humanBat, lvl === 'hard', lvl === 'easy' ? [] : S.humanBowl);
    const q = lvl === 'easy' ? 0.12 : lvl === 'medium' ? 0.45 : 0.85;
    if (Math.random() > q) return rnd();
    let best = 1; for (let n = 2; n <= 6; n++) if (p[n] > p[best]) best = n;
    return lvl === 'hard' && Math.random() < 0.3 ? sample(p) : best;
  }
  // Bot bats: it wants big numbers that the human is unlikely to bowl
  if (lvl === 'easy') return rnd();
  const p = predict(S.humanBowl, lvl === 'hard', S.humanBat);
  if (lvl === 'medium' && Math.random() < 0.5) return rnd();
  if (lvl === 'hard' && Math.random() < 0.12) return rnd();
  const need = S.innings === 2 ? S.runs[0] + 1 - S.runs[1] : 99;   // runs the bot still needs to win
  if (lvl === 'hard' && need >= 1 && need <= 6 && p[need] < 0.3) return need;   // finish the chase
  let best = 1, bestVal = -1;
  for (let n = 1; n <= 6; n++) { const v = n * (1 - p[n]); if (v > bestVal) { bestVal = v; best = n; } }
  return best;
}

// ---------- MATCH LOGIC ----------
function onPick(n) {
  const pk = S.pick;
  if (cfg.mode === 'bot') { pk.vals[0] = n; pk.vals[1] = botNumber(); }
  else if (pk.stage === 0) { pk.vals[0] = n; pk.stage = 1; pk.cover = true; render(); return; }   // hide the choice, pass the device
  else pk.vals[1] = n;

  if (S.phase === 'tosspick') return resolveToss();
  resolveBall(pk.vals[S.batter], pk.vals[1 - S.batter]);
}

function resolveToss() {
  const [a, b] = S.pick.vals, sum = a + b, odd = sum % 2 === 1;
  S.winner = (odd === (S.call === 'odd')) ? 0 : 1;
  S.last = { a, b, text: 'Total ' + sum + ' (' + (odd ? 'odd' : 'even') + '). ' + nm(S.winner) + (nm(S.winner) === 'You' ? ' win' : ' wins') + ' the toss!', out: false };
  S.botChoice = Math.random() < 0.65 ? 'bat' : 'bowl';
  S.phase = 'tosschoice';
  S.pick = freshPick();
  render();
}

function resolveBall(b, w) {
  const bt = S.batter;
  if (cfg.mode === 'bot') (bt === 0 ? S.humanBat : S.humanBowl).push(S.pick.vals[0]);   // remember what the human played
  S.balls[bt]++;
  let text, out = false;
  if (b === w) { S.outs[bt]++; out = true; S.log.push('W'); text = 'OUT! Both showed ' + b; }
  else { S.runs[bt] += b; S.log.push(b); text = '+' + b + (b > 1 ? ' runs' : ' run'); }
  S.last = { a: S.pick.vals[0], b: S.pick.vals[1], text, out };
  S.pick = freshPick();

  const over = S.outs[bt] >= cfg.wk || (cfg.balls && S.balls[bt] >= cfg.balls) || (S.innings === 2 && S.runs[bt] > S.runs[1 - bt]);
  if (over) { if (S.innings === 1) S.phase = 'innbreak'; else finish(); }
  render();
}

function finish() {
  const c = S.batter, f = 1 - c;                                 // c = chasing side, f = side that batted first
  if (S.runs[c] > S.runs[f]) {
    const left = cfg.wk - S.outs[c];
    S.result = nm(c) + (nm(c) === 'You' ? ' win' : ' wins') + ' by ' + left + ' wicket' + (left > 1 ? 's' : '') + '!';
    tally['p' + c]++;
  } else if (S.runs[c] < S.runs[f]) {
    const d = S.runs[f] - S.runs[c];
    S.result = nm(f) + (nm(f) === 'You' ? ' win' : ' wins') + ' by ' + d + ' run' + (d > 1 ? 's' : '') + '!';
    tally['p' + f]++;
  } else { S.result = "It's a tie!"; tally.tie++; }
  S.phase = 'done';
}

// ---------- DRAWING ----------
function scoreboard() {
  if (S.phase === 'tosscall' || S.phase === 'tosspick' || S.phase === 'tosschoice') return '';
  const b = S.batter, ovs = n => Math.floor(n / 6) + '.' + (n % 6);
  let h = '<div class="pcards"><div class="pcard active">🏏 ' + nm(b) + ': <b>' + S.runs[b] + '/' + S.outs[b] + '</b> (' + ovs(S.balls[b]) + ' ov)</div>';
  if (S.innings === 2 && S.phase !== 'done') {
    const need = S.runs[1 - b] + 1 - S.runs[b];
    const left = cfg.balls ? ' from ' + (cfg.balls - S.balls[b]) + ' balls' : '';
    h += '<div class="pcard">🎯 ' + nm(b) + (nm(b) === 'You' ? ' need ' : ' needs ') + need + ' run' + (need > 1 ? 's' : '') + left + '</div>';
  } else if (S.innings === 1 && S.phase === 'play') {
    h += '<div class="pcard">⚾ ' + nm(1 - b) + ' bowling</div>';
  }
  if (S.phase === 'done') h += '<div class="pcard">' + nm(1 - b) + ': ' + S.runs[1 - b] + '/' + S.outs[1 - b] + '</div>';
  h += '</div>';
  if (S.log.length) h += '<div class="chips">' + S.log.slice(-12).map(x => '<span class="chip' + (x === 'W' ? ' w' : '') + '">' + x + '</span>').join('') + '</div>';
  return h;
}

function lastHTML() {
  if (!S.last) return '';
  const L = S.last, bt = S.phase.startsWith('toss') ? -1 : S.batter;
  const role = p => bt < 0 ? '' : (p === bt ? ' 🏏' : ' ⚾');
  return '<div class="hands"><div class="hand"><small>' + nm(0) + role(0) + '</small><span class="big">' + HAND[L.a] + '</span><b>' + L.a + '</b></div>' +
    '<div class="vs">vs</div><div class="hand"><small>' + nm(1) + role(1) + '</small><span class="big">' + HAND[L.b] + '</span><b>' + L.b + '</b></div></div>' +
    '<div class="res' + (L.out ? ' out' : '') + '">' + L.text + '</div>';
}

function padHTML(title) {
  let h = '<div class="note" style="font-size:16px;opacity:1;margin:10px 0">' + title + '</div><div class="pad">';
  for (let n = 1; n <= 6; n++) h += '<button class="num" data-act="num" data-v="' + n + '"><span>' + HAND[n] + '</span><b>' + n + '</b></button>';
  return h + '</div>';
}

function render() {
  let h = scoreboard() + lastHTML();
  const pk = S.pick;
  if (S.phase === 'tosscall') {
    h += '<div id="status">🪙 Toss time!</div><div class="note" style="font-size:16px;opacity:1">' + nm(0) + (nm(0) === 'You' ? ', call' : ' calls') + ' Odd or Even. We add both numbers.</div>' +
      '<div class="actions"><button class="cta" data-act="call" data-v="odd">Odd</button><button class="cta" data-act="call" data-v="even">Even</button></div>';
  } else if (S.phase === 'tosspick' || S.phase === 'play') {
    if (cfg.mode === 'local' && pk.cover) {
      h += '<div class="cover">🙈 ' + nm(0) + ' has chosen.<br>Pass the device to ' + nm(1) + '.<div class="actions"><button class="cta" data-act="ready">I am ' + nm(1) + ', ready</button></div></div>';
    } else {
      let title;
      if (S.phase === 'tosspick') title = cfg.mode === 'bot' ? 'Pick a number for the toss' : nm(pk.stage) + ': pick a number secretly';
      else if (cfg.mode === 'bot') title = S.batter === 0 ? '🏏 You are batting. Pick a number the bowler will not match!' : '⚾ You are bowling. Guess the bot\'s number!';
      else title = nm(pk.stage) + (pk.stage === S.batter ? ' (batting)' : ' (bowling)') + ': pick secretly';
      h += '<div id="status">' + (S.phase === 'play' ? 'Innings ' + S.innings : 'Toss') + '</div>' + padHTML(title);
    }
  } else if (S.phase === 'tosschoice') {
    const w = S.winner;
    if (cfg.mode === 'bot' && w === 1) {
      h += '<div class="note" style="font-size:16px;opacity:1">The bot chose to ' + S.botChoice + ' first.</div><div class="actions"><button class="cta" data-act="choose" data-v="' + S.botChoice + '">Start the match</button></div>';
    } else {
      h += '<div id="status">' + nm(w) + (nm(w) === 'You' ? ', choose' : ' chooses') + '</div><div class="actions"><button class="cta" data-act="choose" data-v="bat">🏏 Bat first</button><button class="cta" data-act="choose" data-v="bowl">⚾ Bowl first</button></div>';
    }
  } else if (S.phase === 'innbreak') {
    const b = S.batter;
    h += '<div id="status">Innings over!</div><div class="note" style="font-size:16px;opacity:1">' + nm(b) + ' scored ' + S.runs[b] + '/' + S.outs[b] + '. Target: <b>' + (S.runs[b] + 1) + '</b></div>' +
      '<div class="actions"><button class="cta" data-act="next">Start the chase</button></div>';
  } else if (S.phase === 'done') {
    h += '<div id="status">🎉 ' + S.result + '</div>' +
      '<div class="scores"><span>' + nm(0) + ': ' + tally.p0 + ' wins</span><span>Ties: ' + tally.tie + '</span><span>' + nm(1) + ': ' + tally.p1 + ' wins</span></div>' +
      '<div class="actions"><button class="cta" data-act="again">Play again</button></div>';
  }
  $('cstage').innerHTML = h;
}

// ---------- CLICKS ----------
$('cstage').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || !S) return;
  const a = b.dataset.act, v = b.dataset.v;
  if (a === 'call') { S.call = v; S.phase = 'tosspick'; S.pick = freshPick(); render(); }
  else if (a === 'num') onPick(+v);
  else if (a === 'ready') { S.pick.cover = false; render(); }
  else if (a === 'choose') {
    const first = v === 'bat' ? S.winner : 1 - S.winner;        // who bats first
    S.batter = first; S.last = null; S.log = []; S.phase = 'play'; S.pick = freshPick(); render();
  }
  else if (a === 'next') { S.innings = 2; S.batter = 1 - S.batter; S.log = []; S.last = null; S.phase = 'play'; S.pick = freshPick(); render(); }
  else if (a === 'again') {
    Object.assign(S, { phase: 'tosscall', call: null, innings: 1, batter: 0, runs: [0, 0], outs: [0, 0], balls: [0, 0], log: [], last: null, pick: freshPick(), result: '' });
    render();
  }
});