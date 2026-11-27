import questions from './questions.js?v=11';
import { closest, leaders, award, validSpecial } from './rules.js';

const $ = id => document.getElementById(id);
const names = [
  ['Окружающий мир 4 класс','Течение времени','Наш любимый СЭТ','Правда или ложь','Город на Неве'],
  ['Числа и множества','Наша планета Земля','Зумеры','Ох уж эти женщины','Сильный пол'],
  []
];
const special = {'1-1-400':'Точный ответ','1-4-200':'Кот в мешке','2-0-400':'Аукцион','1-0-500':'Аукцион','2-4-300':'Кот в мешке','3-1-200':'Кот в мешке','3-2-500':'Аукцион'};
const addedSpecials=['1-0-500','2-4-300','3-1-200','3-2-500'];
function questionType(q) {
  return addedSpecials.includes(q.id) && Object.keys(state.results[q.id] ?? {}).length && !state.details[q.id] ? undefined : special[q.id];
}
const bank = new Map(questions.map(q => [q.id,q]));
const storageKey = 'svoya-igra-set-v1';
const blank = old => ({
  version:1, round:1, played:[], results:{}, details:{},
  teams:Array.from({length:4}, (_,i) => ({name:old?.teams[i].name ?? ('Команда '+(i+1)), score:0}))
});
const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const validTeam = index => Number.isInteger(index) && index >= 0 && index < 4;
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
function parse(raw) {
  const value = JSON.parse(raw);
  if (!isObject(value) || value.version !== 1 || ![1,2,3].includes(value.round) ||
      !Array.isArray(value.teams) || value.teams.length !== 4 ||
      value.teams.some(team => !isObject(team) || typeof team.name !== 'string' || !team.name.trim() || team.name.length > 40 || !Number.isSafeInteger(team.score)) ||
      !Array.isArray(value.played) || value.played.some(id => !bank.has(id)) ||
      !isObject(value.results) || !isObject(value.details)) throw Error();
  for (const [id, result] of Object.entries(value.results)) {
    if (!bank.has(id) || !isObject(result) || Object.entries(result).some(([i, delta]) => !/^[0-3]$/.test(i) || !Number.isSafeInteger(delta))) throw Error();
  }
  for (const [id, d] of Object.entries(value.details)) {
    if (!Object.hasOwn(special,id) || !isObject(d) || (d.winners !== undefined && !Array.isArray(d.years)) || (d.tied !== undefined && !Array.isArray(d.bids)) ||
        (d.source !== undefined && !validTeam(d.source)) ||
        (d.target !== undefined && !validTeam(d.target)) ||
        (d.bid !== undefined && (!Number.isSafeInteger(d.bid) || d.bid <= 0 || !validTeam(d.target))) ||
        ['years','bids'].some(field => d[field] !== undefined &&
          (!Array.isArray(d[field]) || d[field].length !== 4 || d[field].some(item => typeof item !== 'string' || !/^\d{0,16}$/.test(item)))) ||
        ['winners','tied'].some(field => d[field] !== undefined &&
          (!Array.isArray(d[field]) || d[field].length > 4 || d[field].some(i => !validTeam(i)))) || !validSpecial(special[id],d,value.results[id])) throw Error();
  }
  return value;
}
let state = blank();
let host = false;
let active;
let revealed = false;
const status = message => { $('status').textContent = message; };
try {
  const raw = localStorage.getItem(storageKey);
  if (raw) state = parse(raw);
} catch {
  status('Не удалось загрузить сохранение. Можно восстановить игру из JSON.');
}
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); }
  catch { status('Сохранение в браузере недоступно. Экспортируйте игру в JSON.'); }
}
function renderTeams() {
  $('teams').innerHTML = state.teams.map((team,i) => `
    <div class="team"><input aria-label="Название команды ${i+1}" data-name="${i}" maxlength="40" value="${esc(team.name)}">
      <span class="score">${team.score}</span>
      ${host ? `<button data-adjust="${i},-100">−100</button><button data-adjust="${i},100">+100</button>` : ''}
    </div>`).join('');
}
function render() {
  renderTeams();
  $('host').setAttribute('aria-pressed',host);
  $('hostTools').hidden = !host;
  $('rounds').innerHTML = [1,2,3].map(round => `<button data-round="${round}" aria-pressed="${round === state.round}">Раунд ${round}</button>`).join('');
  const topics = names[state.round-1];
  $('roundTitle').textContent = state.round === 3 ? 'Песни 90-х' : 'Раунд '+state.round;
  $('board').style.setProperty('--columns',topics.length || 4);
  const cells = questions.filter(q => q.round === state.round).sort((a,b) => a.value-b.value || a.column-b.column);
  $('board').innerHTML = topics.map(topic => `<div class="topic">${topic}</div>`).join('') +
    cells.map(q => {
      const played = state.played.includes(q.id);
      return `<button class="cell ${played?'played':''}" data-cell="${q.id}" ${played&&!host?'disabled':''}
       aria-label="${topics[q.column] ?? ('Песня '+(q.column+1))}, ${q.value} баллов${played?', сыгран': ''}">${q.value}</button>`;
    }).join('');
}
const options = (chosen, excluded) => '<option value="">Выберите команду</option>' +
  state.teams.map((team,i) => i === excluded ? '' : `<option value="${i}" ${i===chosen?'selected':''}>${esc(team.name)}</option>`).join('');
const field = (kind,i,value) => `<input inputmode="numeric" maxlength="${kind==='years'?4:16}" placeholder="${kind==='years'?'Год':'Введите ставку'}" data-entry="${kind},${i}" aria-label="${kind==='years'?'Год':'Ставка'} команды ${i+1}" value="${esc(value??'')}">`;
const scoring = (allowed, points) => `<div class="controls">${state.teams.map((team,i) => {
  const recorded = state.results[active.id]?.[i];
  const disabled = !allowed.includes(i) || recorded !== undefined;
  return `<div class="control"><b>${esc(team.name)} · ${team.score}</b>
   ${recorded !== undefined ? (recorded > 0?'+':'')+recorded : `
    <button data-score="${i},${points}" ${disabled?'disabled':''} aria-label="Начислить ${points}">+${points}</button>
    <button data-score="${i},-${points}" ${disabled?'disabled':''} aria-label="Списать ${points}">−${points}</button>`}</div>`;
}).join('')}</div>`;
const selector = (label,id,value,excluded) => `<label>${label} <select id="${id}">${options(value,excluded)}</select></label>`;
function specialControls(type, d) {
  if (type === 'Точный ответ') {
    if (d.winners) return `<p>Годы команд: ${d.years.map(esc).join(' · ')}</p><p>+400 · ${d.winners.map(i => esc(state.teams[i].name)).join(', ')}</p>`;
    return selector('Команда, выбравшая вопрос','source',d.source) +
      '<div class="controls">'+state.teams.map((team,i)=>`<label class="control"><b>${esc(team.name)}</b>${field('years',i,d.years?.[i])}</label>`).join('') +
      '</div><button id="closest">Определить победителя</button>';
  }
  if (type === 'Кот в мешке') {
    const decided = Object.keys(state.results[active.id] ?? {}).length > 0;
    if (decided) return scoring([d.target],active.value);
    return selector('Кто выбрал вопрос','source',d.source) + ' ' +
      (validTeam(d.source) ? selector('Кому передали вопрос','target',d.target,d.source) : '') +
      scoring(validTeam(d.target)?[d.target]:[],active.value);
  }
  if (type === 'Аукцион') {
    if (d.bid) return `<p>Отвечает ${esc(state.teams[d.target].name)} · ставка ${d.bid}</p>` + scoring([d.target],d.bid);
    if (d.tied) return '<p>Одинаковые максимальные ставки</p>' +
      d.tied.map(i => `<button data-winner="${i}">${esc(state.teams[i].name)}</button>`).join(' ') +
      ' <button id="rebid">Повторные торги</button>';
    return '<p>Введите ставку под названием команды. Пустое поле означает пропуск.</p><div class="controls">'+state.teams.map((team,i)=>`<label class="control"><b>${esc(team.name)} · ${team.score}</b>${field('bids',i,d.bids?.[i])}</label>`).join('')+
      '</div><button id="auction">Определить наибольшую ставку</button>';
  }
  return scoring([0,1,2,3],active.value);
}
let timerRemaining=30000, timerDeadline=0, timerInterval;
function timerValue() {
  return timerDeadline ? Math.max(0,timerDeadline-performance.now()) : timerRemaining;
}
function stopTimer() {
  timerRemaining=timerValue();
  timerDeadline=0;
  clearInterval(timerInterval);
}
function paintTimer() {
  const output=$('countdown');
  if(!output) return;
  const seconds=Math.ceil(timerValue()/1000);
  output.textContent=seconds ? '00:'+String(seconds).padStart(2,'0') : 'Время вышло';
  output.classList.toggle('expired',seconds===0);
  if(!seconds && timerDeadline) stopTimer();
  const button=$('timerPause');
  if(button) {
    button.textContent=timerDeadline ? 'Пауза' : timerRemaining===30000 ? 'Запустить таймер' : 'Продолжить';
    button.disabled=timerRemaining<=0;
  }
}
function startTimer() {
  if(timerDeadline || timerRemaining<=0) return;
  timerDeadline=performance.now()+timerRemaining;
  timerInterval=setInterval(paintTimer,100);
}

let specialIntro=false;
function renderCard() {
  const q = active, type = questionType(q), played = state.played.includes(q.id);
  if(specialIntro) {
    $('card').innerHTML='<div class="special-intro"><h2 id="question">'+esc(type)+'</h2><button id="specialContinue" class="primary">Продолжить</button></div>';
    return;
  }
  if(type==='Кот в мешке' && !played && !validTeam(state.details[q.id]?.target) &&
      !Object.keys(state.results[q.id] ?? {}).length) {
    const d=state.details[q.id] ?? {};
    $('card').innerHTML='<h2 id="question">Кот в мешке</h2>'+
      selector('Кто выбрал вопрос','source',d.source)+' '+
      (validTeam(d.source) ? selector('Кому передали вопрос','target',d.target,d.source) : '')+
      '<p id="cardStatus" role="status"></p>';
    return;
  }
  if(type==='Аукцион' && !played && !state.details[q.id]?.bid) {
    $('card').innerHTML='<h2 id="question">Аукцион</h2>'+specialControls(type,state.details[q.id] ?? {})+'<p id="cardStatus" role="status"></p>';
    return;
  }
  const topic = names[q.round-1][q.column];
  $('card').innerHTML = `
    <div class="meta">Раунд ${q.round} · ${topic ?? 'Песни 90-х'} · ${q.value} баллов${type?' · '+type:''}</div>
    <div class="timerbar"><output id="countdown" aria-label="Осталось времени"></output><button id="timerPause">Запустить таймер</button><button id="timerReset">Заново 30 секунд</button></div>
    <h2 id="question">${esc(q.question)}</h2>
    ${topic==='Правда или ложь'?'<p class="meta">Правда / Ложь</p>':''}
    ${revealed?`<div class="answer"><strong>${esc(q.answer)}</strong><p>${esc(q.note)}</p></div>`:
     '<button id="reveal" class="primary">Показать ответ</button>'}
    ${played?'<p>Вопрос сыгран.</p>':specialControls(type,state.details[q.id] ?? {})}
    <p id="cardStatus" role="status"></p>
    <div class="actions">${played ? '<button id="restore">Восстановить клетку</button>' :
       '<button class="primary" id="finish">Завершить вопрос</button>'}</div>`;
  paintTimer();
}
function open(q) {
  stopTimer();timerRemaining=30000;
  active=q;
  specialIntro=['Кот в мешке','Аукцион'].includes(questionType(q)) && !state.played.includes(q.id);
  revealed=false;
  renderCard();
  const headerHeight = document.querySelector('header').getBoundingClientRect().height;
  $('card').style.setProperty('--header-height', headerHeight + 'px');
  $('card').showModal(); paintTimer();
}
function close() { stopTimer(); $('card').close(); active=undefined; render(); }
function updateCard() { save(); renderTeams(); renderCard(); paintTimer(); }
function chooseWinner(d,i) {
  d.target=i;
  d.bid=Number(d.bids[i]);
  delete d.tied;
}
document.addEventListener('change', event => {
  const input=event.target;
  if (input.dataset.name !== undefined) {
    const team=state.teams[Number(input.dataset.name)];
    team.name=input.value.trim() || team.name;
    input.value=team.name;
    save();
  }
  if (active && ['source','target'].includes(input.id)) {
    const d=state.details[active.id] ??= {};
    if (input.value === '') delete d[input.id]; else d[input.id]=+input.value;
    if (input.id === 'source') delete d.target;
    updateCard();
  }
});
$('card').addEventListener('input', event => {
  const input=event.target;
  if (!input.dataset.entry) return;
  const [kind,index]=input.dataset.entry.split(',');
  const d=state.details[active.id] ??= {};
  d[kind] ??= ['','','',''];
  d[kind][index]=input.value=input.value.replace(/[^0-9]/g,'');
  save();
});
$('card').addEventListener('cancel',event => { event.preventDefault(); close(); });
document.addEventListener('click', async event => {
  const button=event.target.closest('button');
  if (!button || button.disabled) return;
  const {round,cell,adjust,score,winner}=button.dataset;
  if (round) { state.round=+round; save(); render(); return; }
  if (cell) { open(bank.get(cell)); return; }
  if (adjust && host) {
    const [i,delta]=adjust.split(',').map(Number);
    if (Number.isSafeInteger(state.teams[i].score+delta)) state.teams[i].score+=delta;
    save();renderTeams();return;
  }
  switch (button.id) {
    case 'startGame':
      $('welcome').hidden=true;
      $('gameScreen').hidden=false;
      document.title='Своя игра · ООО «СЭТ»';
      $('rounds').querySelector('button')?.focus();
      return;
    case 'specialContinue': specialIntro=false;renderCard();return;
    case 'timerPause':
      if(timerDeadline) stopTimer(); else startTimer();
      paintTimer();return;
    case 'timerReset':
      stopTimer();timerRemaining=30000;paintTimer();return;
    case 'host': host=!host;render();return;
    case 'fullscreen':
      try {
        if(document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch {status('Полный экран недоступен. Попробуйте клавишу F11.');}
      return;
    case 'reset':
      if (confirm('Начать новую игру? Очки и сыгранные вопросы будут сброшены.')) {
        state=blank(confirm('Сохранить названия команд?') ? state : undefined);
        save();render();
      }
      return;
    case 'export': {
      const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));
      const a=document.createElement('a'); a.href=url; a.download='svoya-igra-backup.json'; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);return;
    }
    case 'import': $('file').click();return;
    case 'reveal': stopTimer();revealed=true;renderCard();$('finish')?.focus();return;
    case 'finish':
      state.played.push(active.id);save();close();return;
    case 'restore':
      state.played=state.played.filter(id=>id!==active.id);save();close();return;
  }
  if (!active || state.played.includes(active.id)) return;
  const d=state.details[active.id] ?? {};
  if (score) {
    const [i,delta]=score.split(',').map(Number);
    award(state,active.id,i,delta);updateCard();return;
  }
  if (button.id==='closest' && !d.winners) {
    if (!validTeam(d.source)) { $('cardStatus').textContent='Укажите команду, выбравшую вопрос.';return; }
    const winners=closest(d.years??[]);
    if (!winners.length) { $('cardStatus').textContent='Введите четыре корректных года.';return; }
    d.winners=winners;
    winners.forEach(i=>award(state,active.id,i,400));
    stopTimer();revealed=true;updateCard();
  }
  if (button.id==='auction') {
    const winning=leaders(d.bids??['','','',''],state.teams.map(team=>team.score));
    if (!winning?.length) { $('cardStatus').textContent='Введите хотя бы одну положительную ставку. Ставки не могут превышать счёт.';return; }
    d.limits=state.teams.map(team=>team.score);
    if (winning.length===1) chooseWinner(d,winning[0]); else d.tied=winning;
    updateCard();
  }
  if (winner!==undefined && d.tied?.includes(+winner)) { chooseWinner(d,+winner);updateCard(); }
  if (button.id==='rebid') { delete d.tied; delete d.bids; delete d.limits;updateCard(); }
});
$('file').addEventListener('change',async event=>{
  const file=event.target.files[0];
  event.target.value='';
  if (!file) return;
  try {
    if (file.size>1000000) throw Error();
    const imported=parse(await file.text());
    if (!confirm('Заменить текущую игру сохранением из файла?')) return;
    state=imported;status('Игра восстановлена.');save();render();
  } catch { status('Файл не подходит. Выберите JSON, экспортированный из игры.'); }
});
render();
