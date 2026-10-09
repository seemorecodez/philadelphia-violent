import './style.css';
import { locations } from './locations.js';
import { createCityExplorer } from './city-explorer.js';
import { vehicles } from './vehicles.js';
import { createPerformancePanel } from './performance-panel.js';
import { createRecorder } from './recorder.js';
import { createGameAudio } from './game-audio.js';

const $ = (id) => document.getElementById(id);
document.querySelector('#app').innerHTML = `
  <div id="world" aria-label="Philadelphia 3D environment"></div>
  <header class="topbar">
    <a class="brand" href="/" aria-label="Philadelphia Drive home"><span class="brand-icon">P<span>↗</span></span><span>PHILADELPHIA<span class="brand-sub">DRIVE THE CITY</span></span></a>
    <div class="connection"><span id="connection-dot" class="dot"></span><span id="connection-label">FREE · NO API KEY</span></div>
    <button id="disconnect" class="quiet" hidden>Disconnect</button>
  </header>
  <main id="setup" class="setup">
    <section class="intro">
      <div class="eyebrow"><span class="short-line"></span> PENNSYLVANIA / USA</div>
      <h1>Philadelphia.<br><span>At street level.</span></h1>
      <p class="lede">Take the wheel. Step outside. Explore Philadelphia at street level. Start in the Chinatown gameplay district, currently in development. No account or API key.</p>
      <div class="feature-row"><span>01 <strong>Choose a neighborhood</strong></span><span>02 <strong>Find your street</strong></span><span>03 <strong>Take the wheel</strong></span></div>
      <form id="connect-form" class="connect-panel">
        <div class="panel-heading"><h2>Explore Philadelphia</h2><span class="tag">FREE · NO API KEY</span></div>
        <p class="muted">Real streets, sidewalks and curbs stream around you with aerial imagery off. Chinatown starts on 10th Street; elsewhere, choose a clear street to place your car. City detail remains in development.</p>
        <div class="form-row"><div><label for="start-location">Starting neighborhood</label><select id="start-location">${locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}</select></div><div><label for="quality">3D detail</label><select id="quality"><option value="balanced">Balanced</option><option value="high">High · live shadows</option><option value="low">Low bandwidth</option></select></div></div>
        <button id="connect" class="primary" type="submit" disabled>Preparing graphics… <span>↗</span></button>
        <p id="setup-status" class="form-status" role="status">Starting the 3D renderer.</p>
        <details><summary>About the free city data</summary><p>Center City uses public 2015 textured and 2010 untextured 3D building models. Outside that coverage, buildings use Philadelphia’s actual footprint outlines and height measurements. Ordinary houses now have individual interpreted facades, guided by locally retained neighborhood images; these are not exact copies of unseen walls. Named landmarks retain their source geometry.</p><p>Philadelphia’s 2023 aerial imagery preserves photographed ground detail over Mapzen / USGS terrain. Cars, trees and shadows baked into those photos still need selective reconstruction and cleanup. Plain map colors are not a finished replacement. Internet access is required; source availability and detail vary. Data credits remain on screen.</p><p><a href="https://www.pasda.psu.edu/uci/FullMetadataDisplay.aspx?file=Philadelphia_Building_3DModels.xml" target="_blank" rel="noopener noreferrer">Philadelphia 3D model source</a> · <a href="https://opendataphilly.org/datasets/aerial-photography/" target="_blank" rel="noopener noreferrer">City imagery</a> · <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener noreferrer">Open terrain</a></p></details>
      </form>
      <p class="limit-note">The city data is real; its age and detail vary. Driving contact is experimental. Bridges, tunnels and building gaps need extra care.</p>
    </section>
    <aside class="city-preview" aria-label="Available Philadelphia viewing areas">
      <div class="preview-top"><span class="eyebrow">THE CITY IS YOURS TO EXPLORE</span><span class="cross">+</span></div>
      <div class="coordinates"><span>39.95° N</span><span>75.16° W</span></div>
      <div class="preview-note"><span class="outlined-dot"></span><p>Philadelphia, in three dimensions<br><span>Public city models. No sign-up. No key.</span></p></div>
      <div class="neighborhoods">${locations.slice(0, 4).map((l, i) => `<button type="button" class="neighborhood" data-location="${l.id}"><span class="neighborhood-number">0${i + 1}</span><span><strong>${l.name}</strong><small>${l.street}</small></span><span class="arrow">↗</span></button>`).join('')}</div>
      <div class="preview-footer"><span>REAL PLACES. OPEN EXPLORATION.</span><span>PHL / 01</span></div>
    </aside>
  </main>
  <section id="drive-ui" hidden>
    <div class="drive-top">
      <div class="navigation-panel">
        <div class="drive-toolbar"><div><label for="destination">EXPLORE PHILADELPHIA</label><select id="destination">${locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}</select></div><button id="place" class="quiet">Place car</button><button id="camera" class="quiet">Camera · chase</button><button id="pause" class="quiet">Pause</button><button id="help-toggle" class="quiet" aria-expanded="false" aria-controls="controls-help">Controls</button><button id="touch-toggle" class="quiet" aria-pressed="false" aria-controls="touch-controls">On-screen keys</button></div>
        <div id="drive-status" class="drive-status" role="status">Loading Philadelphia…</div>
      </div>
      <aside class="actions-panel" aria-label="Character and vehicle actions">
        <div class="actions-heading"><strong id="mode-label">Driving</strong><span id="vehicle-name"></span></div>
        <label class="vehicle-label" for="vehicle-select">Vehicle</label><select id="vehicle-select" aria-label="Choose vehicle"></select>
        <div class="action-buttons"><button id="vehicle-action" class="quiet"><span id="vehicle-action-label">Leave car</span><kbd>F</kbd></button><button id="building-action" class="quiet" disabled><span id="building-action-label">Enter building</span><kbd>E</kbd></button><button id="damage-action" class="quiet" disabled><span>Break nearby</span><kbd>X</kbd></button></div>
        <p id="action-hint">Stop the car to step outside.</p>
        <div id="interior-info" hidden><strong id="interior-name"></strong><span id="interior-building"></span><small>Authored interior layout</small></div>
      </aside>
    </div>
    <aside id="controls-help" class="controls-help" hidden><h2>Explore on wheels or on foot</h2><p><kbd>W</kbd> <kbd>↑</kbd> Drive / walk forward<br><kbd>S</kbd> <kbd>↓</kbd> Brake and reverse / walk back<br><kbd>A</kbd> <kbd>D</kbd> <kbd>←</kbd> <kbd>→</kbd> Turn<br><kbd>Shift</kbd> Sprint on foot<br><kbd>Space</kbd> Handbrake<br><kbd>F</kbd> Leave a stopped car / enter nearby car<br><kbd>E</kbd> Enter building / leave through exit<br><kbd>X</kbd> Break an eligible nearby object<br><kbd>C</kbd> Chase / hood / aerial<br>Drag the view to look around; scroll to zoom<br><kbd>Tab</kbd> Explore menu<br><kbd>R</kbd> Reset to your placed position<br><kbd>P</kbd> <kbd>Esc</kbd> Pause</p><p>Interior layouts are authored for the game. They do not reproduce surveyed rooms. Larger buildings and buildings with unknown heights are protected.</p><p>In placement mode, drag to explore, right-drag to zoom and Ctrl-drag to tilt. Click a clear street to place the car. Shift-click is reserved for map navigation.</p></aside>
    <div class="drive-footer"><div class="trip"><span id="area-name">PHILADELPHIA</span><strong id="trip-distance">0.00 <small>MI DRIVEN</small></strong><span id="position-label">—</span></div><div id="instrument" class="instrument"><span id="gear">N</span><strong id="speed">0</strong><div><span>MPH</span><small id="frame-rate">— FPS</small></div></div></div>
    <div id="touch-controls" class="touch-controls"><div><button data-control="left" aria-label="Turn left">←</button><button data-control="right" aria-label="Turn right">→</button></div><div><button data-control="sprint" aria-label="Sprint" hidden>SPRINT</button><button data-control="brake" aria-label="Handbrake">BRAKE</button><button data-control="reverse" aria-label="Brake and reverse">↓</button><button data-control="forward" aria-label="Accelerate">↑</button></div></div>
  </section>
  <footer id="page-footer" class="page-footer"><span>PHILADELPHIA DRIVE</span><span>City of Philadelphia / PASDA · Esri · Mapzen / USGS</span></footer>
`;

let world;
$('start-location').value='chinatown';
// Keep the city visible while playing. Management controls live in one drawer;
// the current action and instruments remain directly available on the street.
const gameMenu = document.querySelector('.drive-top');
gameMenu.id = 'game-menu'; gameMenu.hidden = true;
gameMenu.setAttribute('aria-label', 'Explore and settings');
const menuHeading = document.createElement('div');
menuHeading.className = 'menu-heading';
menuHeading.innerHTML = '<strong>Explore Philadelphia</strong><button id="menu-close" class="quiet" type="button" aria-label="Close menu">Close ×</button>';
gameMenu.prepend(menuHeading);
const menuToggle = document.createElement('button');
menuToggle.id = 'menu-toggle'; menuToggle.className = 'quiet'; menuToggle.textContent = 'Menu'; menuToggle.hidden = true;
menuToggle.setAttribute('aria-controls','game-menu'); menuToggle.setAttribute('aria-expanded','false');
document.querySelector('.topbar').append($('camera'), $('pause'), menuToggle);
$('camera').hidden = true; $('pause').hidden = true;
document.querySelector('.drive-toolbar').append($('disconnect'));
document.querySelector('#drive-ui').append($('drive-status'));
document.querySelector('.navigation-panel').append($('controls-help'));
const contextActions = document.createElement('div'); contextActions.className = 'context-actions';
contextActions.append(document.querySelector('.action-buttons'));
document.querySelector('#drive-ui').append(contextActions);
const sourceStatus = document.createElement('p'); sourceStatus.id = 'source-status';
const sourceNotices = [];
sourceStatus.textContent = 'City data and detail vary by neighborhood. Source credits are always available below.';
gameMenu.append(sourceStatus);
const pauseCard = document.createElement('div'); pauseCard.className = 'pause-card'; pauseCard.hidden = true;
pauseCard.innerHTML = '<span>PHILADELPHIA</span><strong>Paused</strong><button id="resume-game" class="primary" type="button">Back to the street <span>↗</span></button>';
document.querySelector('#drive-ui').append(pauseCard);
  const performancePanel=createPerformancePanel(document.querySelector('.drive-toolbar'));
  createCityExplorer(document.querySelector('.drive-toolbar'),{onVisit:location=>{
    releaseControls();$('area-name').textContent=location.name.toUpperCase();world?.changeLocation(location);setGameMenu(false,false);
  }});
const cityPhotoButton=document.createElement('button');cityPhotoButton.type='button';cityPhotoButton.className='quiet';
let cityPhotosEnabled=true;
cityPhotoButton.textContent='Original building photos · on';cityPhotoButton.setAttribute('aria-pressed','true');
cityPhotoButton.title='Restored original photographs for the matched Chinatown block; other source buildings remain as supplied.';
cityPhotoButton.addEventListener('click',()=>{cityPhotosEnabled=!cityPhotosEnabled;world?.setCityPhotos(cityPhotosEnabled);cityPhotoButton.textContent=`Original building photos · ${cityPhotosEnabled?'on':'off'}`;cityPhotoButton.setAttribute('aria-pressed',String(cityPhotosEnabled));});
document.querySelector('.drive-toolbar').append(cityPhotoButton);
const districtButton=document.createElement('button');districtButton.type='button';districtButton.className='quiet';districtButton.textContent='Play Chinatown district';
const aerialButton=document.createElement('button');aerialButton.type='button';aerialButton.className='quiet';aerialButton.textContent='Aerial imagery · on';aerialButton.setAttribute('aria-pressed','true');
let aerialVisible=true;
aerialButton.addEventListener('click',()=>{aerialVisible=!aerialVisible;world?.setAerialImagery(aerialVisible);aerialButton.textContent=`Aerial imagery · ${aerialVisible?'on':'off'}`;aerialButton.setAttribute('aria-pressed',String(aerialVisible));});
districtButton.addEventListener('click',async()=>{releaseControls();districtButton.disabled=true;try{await world.startGameDistrict();aerialVisible=false;aerialButton.textContent='Aerial imagery · off';aerialButton.setAttribute('aria-pressed','false');setGameMenu(false,false);}catch(error){status(error.message,'error');}finally{districtButton.disabled=false;}});
document.querySelector('.drive-toolbar').append(districtButton,aerialButton);
const soundButton = document.createElement('button'); soundButton.type='button'; soundButton.className='quiet';
soundButton.textContent='Footsteps · off'; soundButton.setAttribute('aria-pressed','false');
soundButton.title='Recorded footsteps; vehicle audio is not available yet';
document.querySelector('.drive-toolbar').append(soundButton);
let soundEnabled = false;
const gameAudio = createGameAudio({ onStatus: ({ status: audioStatus, muted }) => {
  soundButton.disabled = audioStatus === 'loading';
  soundButton.textContent = audioStatus === 'loading' ? 'Loading footsteps…' : audioStatus === 'unavailable' ? 'Retry footsteps' : `Footsteps · ${soundEnabled && !muted ? 'on' : 'off'}`;
  soundButton.setAttribute('aria-pressed', String(soundEnabled && !muted));
} });
soundButton.addEventListener('click', async () => {
  if (soundEnabled) { soundEnabled=false; gameAudio.setMuted(true); }
  else { soundEnabled=await gameAudio.enable(); gameAudio.setMuted(!soundEnabled); }
});
window.addEventListener('pagehide',()=>gameAudio.destroy(),{once:true});
const talkButton=document.createElement('button');
talkButton.id='talk-action';talkButton.type='button';talkButton.className='quiet';talkButton.hidden=true;
talkButton.innerHTML='<span>Talk</span><kbd>G</kbd>';
document.querySelector('.action-buttons').append(talkButton);
let busy = false;
let cameraIndex = 0;
const cameraNames = ['chase', 'hood', 'aerial'];
const keys = new Set();
const touch = new Set();
let active = false;
let currentMode = 'placing';
let lastFrameState = null;
let vehicleChanging = false;
let gamePaused = false;
let resumeAfterMenu = false;
let hintTimer;
$('vehicle-select').replaceChildren(...vehicles.map(vehicle => new Option(vehicle.name, vehicle.id)));
const status = (message, type = '', channel = 'play') => {
  if (channel === 'source') {
    if (!sourceNotices.some(item=>item.message===message)) sourceNotices.push({message,type});
    if (sourceNotices.length>6) sourceNotices.shift();
    sourceStatus.textContent = sourceNotices.map(item=>item.message).join('\n\n');
    sourceStatus.dataset.type = sourceNotices.some(item=>item.type==='error') ? 'error' : type;
    menuToggle.classList.add('source-notice');
    menuToggle.title = 'City data notice available in the menu';
    return;
  }
  $('setup-status').textContent = message;
  $('setup-status').dataset.type = type;
  $('drive-status').textContent = message;
  $('drive-status').dataset.type = type;
  $('drive-status').classList.remove('hint-resting');
  clearTimeout(hintTimer);
  if (type !== 'error') hintTimer = setTimeout(() => {
    if (currentMode !== 'placing' && !gamePaused) $('drive-status').classList.add('hint-resting');
  }, 6500);
};
const locationById = id => locations.find(l => l.id === id) || locations[0];
function releaseControls() { keys.clear(); touch.clear(); document.querySelector('[data-control=sprint]')?.setAttribute('aria-pressed','false'); world?.setInput({}); }
function sendInput() {
  world?.setInput({
    throttle: Number(keys.has('KeyW') || keys.has('ArrowUp') || touch.has('forward')) - Number(keys.has('KeyS') || keys.has('ArrowDown') || touch.has('reverse')),
    steer: Number(keys.has('KeyD') || keys.has('ArrowRight') || touch.has('right')) - Number(keys.has('KeyA') || keys.has('ArrowLeft') || touch.has('left')),
    handbrake: keys.has('Space') || touch.has('brake'),
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.has('sprint'),
  });
}
function setActive(value) {
  active = value;
  $('setup').hidden = value;
  $('drive-ui').hidden = !value;
  $('disconnect').hidden = !value;
  $('camera').hidden = !value; $('pause').hidden = !value; menuToggle.hidden = !value;
  $('page-footer').hidden = value;
  $('connection-label').textContent = value ? 'PUBLIC CITY DATA · LIVE' : 'FREE · NO API KEY';
  $('connection-dot').classList.toggle('connected', value);
  document.body.classList.toggle('is-driving', value);
  if (!value) {
    gameMenu.hidden = true; menuToggle.setAttribute('aria-expanded','false');
    document.body.classList.remove('menu-open'); pauseCard.hidden = true;
    $('controls-help').hidden = true;
    $('help-toggle').setAttribute('aria-expanded', 'false');
  }
}

function setGameMenu(open, resume = true) {
  releaseControls();
  if (open) {
    releaseControls(); resumeAfterMenu = !gamePaused;
    menuToggle.classList.remove('source-notice');
    world?.pause();
  }
  gameMenu.hidden = !open;
  menuToggle.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('menu-open',open);
  pauseCard.hidden = !gamePaused || open;
  if (!open) {
    $('controls-help').hidden = true; $('help-toggle').setAttribute('aria-expanded','false');
    if (resume && resumeAfterMenu && gamePaused) world?.togglePause();
    resumeAfterMenu = false;
    $('world').querySelector('canvas')?.focus();
  }
}
menuToggle.addEventListener('click', () => setGameMenu(gameMenu.hidden));
$('menu-close').addEventListener('click', () => setGameMenu(false));
$('resume-game').addEventListener('click', () => { releaseControls(); world?.togglePause(); $('world').querySelector('canvas')?.focus(); });

function updateActions(state = {}) {
  currentMode = ['driving', 'walking', 'interior', 'placing'].includes(state.mode) ? state.mode : 'driving';
  const onFoot = currentMode === 'walking' || currentMode === 'interior';
  const inInterior = currentMode === 'interior';
  const driving = currentMode === 'driving';
  const stopped = Math.abs(Number(state.speed) || 0) <= 0.2;
  document.body.dataset.mode = currentMode;
  contextActions.hidden = currentMode === 'placing' || gamePaused || !gameMenu.hidden;
  $('mode-label').textContent = { driving: 'Driving', walking: 'On foot', interior: 'Inside', placing: 'Place your car' }[currentMode];
  $('vehicle-name').textContent = state.vehicleName || vehicles.find(vehicle => vehicle.id === $('vehicle-select').value)?.name || '';
  const selected = vehicles.find(vehicle => vehicle.id === state.vehicleId || vehicle.name === state.vehicleName);
  if (selected && !vehicleChanging) $('vehicle-select').value = selected.id;
  $('vehicle-select').disabled = onFoot || vehicleChanging || vehicles.length === 0;
  $('vehicle-action-label').textContent = currentMode === 'walking' ? 'Enter car' : 'Leave car';
  $('vehicle-action').disabled = vehicleChanging || inInterior || currentMode === 'placing' || (driving && !stopped) || (currentMode==='walking' && !state.canEnterCar);
  $('building-action-label').textContent = inInterior ? 'Exit building' : 'Enter building';
  $('building-action').disabled = !onFoot || (inInterior ? !state.interior?.nearExit : !state.nearbyBuilding);
  $('damage-action').disabled = currentMode !== 'walking';
  talkButton.hidden=!inInterior;
  talkButton.disabled=!state.interior?.nearbyName;
  talkButton.setAttribute('aria-label',state.interior?.nearbyName?`Talk to ${state.interior.nearbyName} G`:'Talk G');
  $('place').disabled = onFoot;
  $('destination').disabled = inInterior;
  $('camera').disabled = inInterior;
  $('action-hint').textContent = currentMode === 'placing' ? 'Choose a clear street on the map.'
    : driving ? (stopped ? 'Step outside to explore on foot.' : 'Stop the car to step outside.')
      : inInterior ? (state.interior?.nearExit ? 'Use E to leave through the exit.' : 'Return to the exit door to leave.')
        : 'Approach a car or building to interact. Hold Shift to sprint.';
  $('interior-info').hidden = !inInterior;
  if (inInterior) {
    $('interior-name').textContent = state.interior?.layoutName || state.interior?.name || 'Interior layout';
    $('interior-building').textContent = `Building ${state.interior?.buildingId ?? '—'}`;
  }
  document.querySelector('[data-control=sprint]').hidden = !onFoot;
  document.querySelector('[data-control=brake]').hidden = onFoot;
  document.querySelector('[data-control=forward]').setAttribute('aria-label', onFoot ? 'Walk forward' : 'Accelerate');
  document.querySelector('[data-control=reverse]').setAttribute('aria-label', onFoot ? 'Walk backward' : 'Brake and reverse');
  $('instrument').classList.toggle('on-foot', onFoot);
}

function performAction(method) {
  releaseControls();
  if (!gameMenu.hidden) setGameMenu(false);
  world?.[method]?.();
}
document.querySelectorAll('[data-location]').forEach(button => button.addEventListener('click', () => {
  $('start-location').value = button.dataset.location;
  document.querySelectorAll('[data-location]').forEach(b => b.classList.toggle('selected', b === button));
}));

$('connect-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !world) return;
  busy = true;
  $('connect').disabled = true;
  $('connect').textContent = 'Loading Philadelphia…';
  status('Loading public Philadelphia models, imagery and terrain…');
  try {
    await world.connect($('quality').value);
    const location = locationById($('start-location').value);
    $('destination').value = location.id;
    $('area-name').textContent = location.name.toUpperCase();
    setActive(true);
    if(location.id==='chinatown'){
      await world.startGameDistrict();aerialVisible=false;aerialButton.textContent='Aerial imagery · off';aerialButton.setAttribute('aria-pressed','false');
    }else{await world.startCityWorld(location);aerialVisible=false;aerialButton.textContent='Aerial imagery · off';aerialButton.setAttribute('aria-pressed','false');}
  } catch {
    status('A public city service could not be reached. Check your internet connection and try again. No API key is needed.', 'error');
  } finally {
    busy = false;
    $('connect').disabled = false;
    $('connect').innerHTML = 'Play Philadelphia <span>↗</span>';
  }
});
$('disconnect').addEventListener('click', () => {
  releaseControls();
  world.disconnect();
  sourceNotices.length=0;
  sourceStatus.textContent='City data and detail vary by neighborhood. Source credits are always available below.';
  sourceStatus.dataset.type='';menuToggle.classList.remove('source-notice');
  setActive(false);
  status('Disconnected. Start exploring to load the city again.');
});
$('destination').addEventListener('change', () => {
  releaseControls();
  const location = locationById($('destination').value);
  $('area-name').textContent = location.name.toUpperCase();
  world.changeLocation(location);
  setGameMenu(false, false);
  $('world').querySelector('canvas')?.focus();
});
$('place').addEventListener('click', () => { releaseControls(); world.startPlacement(); setGameMenu(false, false); });
$('vehicle-action').addEventListener('click', () => performAction('toggleVehicle'));
$('building-action').addEventListener('click', () => performAction('interact'));
$('damage-action').addEventListener('click', () => performAction('damage'));
talkButton.addEventListener('click',()=>performAction('talk'));
$('vehicle-select').addEventListener('change', async () => {
  releaseControls();
  vehicleChanging = true;
  updateActions(lastFrameState ?? { mode: currentMode });
  try {
    await world?.setVehicle($('vehicle-select').value);
  } catch {
    status('The selected vehicle could not load. Try selecting it again.', 'error');
  } finally {
    vehicleChanging = false;
    updateActions(lastFrameState ?? { mode: currentMode });
    $('world').querySelector('canvas')?.focus();
  }
});
function cycleCamera() {
  if (currentMode === 'interior') return;
  cameraIndex = (cameraIndex + 1) % cameraNames.length;
  world?.setCamera(cameraNames[cameraIndex]);
  $('camera').textContent = `Camera · ${cameraNames[cameraIndex]}`;
}
$('camera').addEventListener('click', cycleCamera);
$('pause').addEventListener('click', () => { releaseControls(); if(!gameMenu.hidden)setGameMenu(false,false); world?.togglePause(); });
$('help-toggle').addEventListener('click', () => {
  $('controls-help').hidden = !$('controls-help').hidden;
  $('help-toggle').setAttribute('aria-expanded', String(!$('controls-help').hidden));
});
$('touch-toggle').addEventListener('click', () => {
  const visible = $('touch-controls').classList.toggle('is-visible');
  if(!visible)releaseControls();
  $('touch-toggle').setAttribute('aria-pressed', String(visible));
  document.body.classList.toggle('screen-keys', visible);
});
// Toolbar buttons otherwise retain focus and consume the next driving key.
$('drive-ui').addEventListener('click', event => {
  if (event.target.closest('button')) $('world').querySelector('canvas')?.focus();
});
const drivingKeys = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight']);
window.addEventListener('keydown', event => {
  if (!active || event.ctrlKey || event.metaKey || event.altKey || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(event.target.tagName)) return;
  if (drivingKeys.has(event.code)) {
    event.preventDefault(); keys.add(event.code); sendInput();
  } else if (!event.repeat) {
    if (event.code === 'KeyC') cycleCamera();
    if (event.code === 'KeyF') { event.preventDefault(); performAction('toggleVehicle'); }
    if (event.code === 'KeyE') { event.preventDefault(); performAction('interact'); }
    if (event.code === 'KeyX') { event.preventDefault(); performAction('damage'); }
    if (event.code === 'KeyG') { event.preventDefault(); performAction('talk'); }
    if (event.code === 'KeyR') { releaseControls(); world.reset(); }
    if (event.code === 'KeyP' || event.code === 'Escape') {
      event.preventDefault(); releaseControls();
      if (!gameMenu.hidden) setGameMenu(false); else world.togglePause();
    }
    if (event.code === 'Tab') { event.preventDefault(); setGameMenu(gameMenu.hidden); }
  }
});
window.addEventListener('keyup', event => { keys.delete(event.code); sendInput(); });
window.addEventListener('blur', () => { releaseControls(); world?.pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { releaseControls(); world?.pause(); } });
document.querySelectorAll('[data-control]').forEach(button => {
  if(button.dataset.control==='sprint'){
    button.setAttribute('aria-pressed','false');
    button.title='Toggle sprint, then hold forward';
    button.addEventListener('click',()=>{
      if(touch.has('sprint'))touch.delete('sprint');else touch.add('sprint');
      button.setAttribute('aria-pressed',String(touch.has('sprint')));sendInput();
    });
    return;
  }
  button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); touch.add(button.dataset.control); sendInput(); });
  for (const kind of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(kind, () => { touch.delete(button.dataset.control); sendInput(); });
});

try {
  const { createWorld } = await import('./world.js');
  world = createWorld($('world'), {
    onStatus: status,
    onMotion: motion => gameAudio.update(motion),
    onPause: value => {
      if(value)gameAudio.update({paused:true});
      gamePaused = value;
      $('pause').textContent = value ? 'Resume' : 'Pause';
      pauseCard.hidden = !active || !value || !gameMenu.hidden;
      document.body.classList.toggle('game-paused',value);
      contextActions.hidden = value || currentMode === 'placing' || !gameMenu.hidden;
    },
    onFrame(state, fps) {
      lastFrameState = state;
      performancePanel.update(state);
      updateActions(state);
      const frameSpeed = currentMode === 'interior' ? state.interior?.speed : state.speed;
      const speed = Number.isFinite(frameSpeed) ? frameSpeed : 0;
      const distance = Number.isFinite(state.distance) ? state.distance : 0;
      $('speed').textContent = Math.round(Math.abs(speed) * 2.236936);
      $('gear').textContent = currentMode === 'walking' ? (speed>2.3?'RUN':'WALK') : currentMode === 'interior' ? 'IN' : speed < -0.1 ? 'R' : speed > 0.1 ? 'D' : 'N';
      $('trip-distance').innerHTML = `${(distance / 1609.344).toFixed(2)} <small>MI TRAVELED</small>`;
      $('position-label').textContent = Number.isFinite(state.latitude) && Number.isFinite(state.longitude)
        ? `${state.latitude.toFixed(5)}° N  /  ${Math.abs(state.longitude).toFixed(5)}° W` : '—';
      $('frame-rate').textContent = `${Math.round(fps)} FPS`;
    },
  });
  const recorder = createRecorder({
    getCanvas: () => $('world').querySelector('canvas'),
    subscribeFrame: callback => world.onRenderedFrame(callback),
    getLabel: () => [currentMode === 'interior' ? 'Authored interior' : currentMode === 'walking' ? 'On foot' : currentMode === 'placing' ? 'Map placement' : 'Driving', lastFrameState?.vehicleName, lastFrameState?.interior?.layoutName].filter(Boolean).join(' · '),
    onStatus: status,
    onControl: releaseControls,
    onReplay: () => world.pause(),
    isActive: () => active,
    mount: document.querySelector('.topbar'),
  });
  window.addEventListener('pagehide', () => recorder.destroy(), { once: true });
  $('connect').disabled = false;
  $('connect').innerHTML = 'Play Philadelphia <span>↗</span>';
  status('Graphics ready. Philadelphia is one click away.');
} catch {
  status('The 3D renderer could not start. Use a browser with WebGL 2 and hardware acceleration enabled, then reload.', 'error');
  $('connect').textContent = 'Graphics unavailable';
}

