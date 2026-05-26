/* Rayners Lane FC - Squad Page */
document.addEventListener('DOMContentLoaded', loadSquad);

var SHEET = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR1-egjqN8gi8QpgL5-oGC_hMSzH5MzC5fFYL0ZxoTxT9dyb4YAGOPx9m9KT3pUtI2oCBUJ4ptRX9qz/pub?output=csv';
var POS_ORDER = ['Goalkeeper','Defender','Midfielder','Forward'];
var POS_COLOUR = {Goalkeeper:'#1A5C32',Defender:'#1A3A6E',Midfielder:'#6B3A1F',Forward:'#8B0000'};
var POS_IMG = {
  Goalkeeper:'img/players/player-gk-1.svg',
  Defender:'img/players/player-def-1.svg',
  Midfielder:'img/players/player-mid-1.svg',
  Forward:'img/players/player-forward-1.svg'
};
var FALLBACK_IMG = 'img/players/player-forward-1.svg';

async function loadSquad() {
  // 1. Try admin data/squad.json
  try {
    var r = await fetch('data/squad.json?t=' + Date.now());
    if (r.ok) {
      var d = await r.json();
      if (d.players && d.players.length) { renderSquad(d.players); return; }
    }
  } catch(e) {}
  // 2. Try Google Sheet
  try {
    var res = await fetch(SHEET);
    if (res.ok) {
      var csv = await res.text();
      var players = csvToPlayers(csv);
      if (players.length) { renderSquad(players); return; }
    }
  } catch(e) {}
  // 3. Show placeholder
  renderSquad([
    {number:1,  name:'TBC', position:'Goalkeeper'},
    {number:2,  name:'TBC', position:'Defender'},
    {number:6,  name:'TBC', position:'Midfielder'},
    {number:9,  name:'TBC', position:'Forward'},
  ]);
}

function csvToPlayers(csv) {
  var lines = csv.trim().split('\n');
  var out = [];
  for (var i = 1; i < lines.length; i++) {
    var c = lines[i].split(',');
    if (!c[1]) continue;
    out.push({
      number: parseInt(c[0])||0,
      name: c[1].trim().replace(/"/g,''),
      position: c[2].trim().replace(/"/g,''),
      apps: parseInt(c[3])||0,
      goals: parseInt(c[4])||0,
      bio: (c[6]||'').trim().replace(/"/g,''),
    });
  }
  return out;
}

function renderSquad(players) {
  var grid = document.getElementById('squad-grid');
  if (!grid) return;
  grid.innerHTML = '';

  var byPos = {};
  POS_ORDER.forEach(function(p) { byPos[p] = []; });
  players.forEach(function(p) {
    var pos = p.position || p.pos || 'Forward';
    if (!byPos[pos]) byPos[pos] = [];
    byPos[p.position || p.pos || 'Forward'].push(p);
  });

  POS_ORDER.forEach(function(pos) {
    var group = byPos[pos];
    if (!group || !group.length) return;

    var section = document.createElement('div');
    section.className = 'squad-group';

    var label = document.createElement('div');
    label.className = 'squad-group-label';
    label.style.background = POS_COLOUR[pos];
    label.textContent = pos + 's';
    section.appendChild(label);

    var row = document.createElement('div');
    row.className = 'squad-row';

    group.forEach(function(p) {
      var name = p.name || 'TBC';
      var num  = p.number || p.no || '';
      var img  = p.photo || POS_IMG[pos] || FALLBACK_IMG;
      var id   = 'player-' + name.toLowerCase().replace(/\s+/g, '-');

      var card = document.createElement('a');
      card.href = 'player.html?id=' + id;
      card.className = 'player-card';
      card.style.textDecoration = 'none';

      var imgWrap = document.createElement('div');
      imgWrap.className = 'player-card__img';
      var imgEl = document.createElement('img');
      imgEl.src = img;
      imgEl.alt = name;
      imgEl.addEventListener('error', function() { this.src = FALLBACK_IMG; });
      imgWrap.appendChild(imgEl);

      var numEl = document.createElement('div');
      numEl.className = 'player-card__num';
      numEl.style.background = POS_COLOUR[pos];
      numEl.textContent = num;

      var nameEl = document.createElement('div');
      nameEl.className = 'player-card__name';
      nameEl.textContent = name;

      var posEl = document.createElement('div');
      posEl.className = 'player-card__pos';
      posEl.textContent = pos;

      card.appendChild(imgWrap);
      card.appendChild(numEl);
      card.appendChild(nameEl);
      card.appendChild(posEl);
      row.appendChild(card);
    });

    section.appendChild(row);
    grid.appendChild(section);
  });
}
