import './recorder.css';

const MAX_BYTES = 100_000_000;
const MAX_SECONDS = 60;
const CREDITS = [
  'City of Philadelphia / PASDA · Esri · DVRPC · Mapzen / USGS',
  'Mustang: Ricy (CC BY 4.0) · Huracán: George Zaky (CC BY)',
  'Tree: Rico Cilliers / Poly Haven (CC0) · Character: MakeHuman (CC0), modified',
];

/** Record only the running game's canvas. No generated or replayed gameplay. */
export function createRecorder({
  getCanvas,
  subscribeFrame,
  getLabel = () => 'Philadelphia',
  onStatus = () => {},
  onControl = () => {},
  onReplay = () => {},
  isActive = () => true,
  mount = document.body,
} = {}) {
  const panel = document.createElement('div');
  panel.className = 'recorder-panel';
  panel.innerHTML = '<button id="record-gameplay" type="button" class="quiet" title="Record up to 60 seconds of live gameplay, without audio">Record</button><button id="replay-gameplay" type="button" class="quiet" hidden>View clip</button>';
  mount.append(panel);
  const recordButton = panel.querySelector('#record-gameplay');
  const replayButton = panel.querySelector('#replay-gameplay');
  const dialog = document.createElement('dialog');
  dialog.className = 'recorder-dialog';
  dialog.setAttribute('aria-labelledby', 'clip-title');
  dialog.innerHTML = '<div class="clip-heading"><h2 id="clip-title">Live gameplay clip</h2><button class="quiet" type="button" data-close>Close</button></div><video controls playsinline preload="metadata" aria-label="Recorded live gameplay"></video><p class="clip-description">Recorded from this running build. Early prototype · no audio.</p><div class="clip-actions"><button type="button" class="quiet" data-save>Save clip to project</button><a class="quiet" data-download>Download WebM</a></div><p class="clip-status" role="status"></p>';
  document.body.append(dialog);
  const player = dialog.querySelector('video');
  const saveButton = dialog.querySelector('[data-save]');
  const download = dialog.querySelector('[data-download]');
  const clipStatus = dialog.querySelector('.clip-status');
  let recorder = null;
  let sourceStream = null;
  let outputStream = null;
  let sourceVideo = null;
  let animation = 0;
  let removeFrame = null;
  let timer = 0;
  let state = 'idle';
  let destroyed = false;
  let chunks = [];
  let bytes = 0;
  let blob = null;
  let blobUrl = null;
  let startedAt = 0;
  let savedPath = null;
  let activeSave = null;
  let generation = 0;

  const supported = typeof MediaRecorder !== 'undefined'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function';
  recordButton.disabled = !supported;
  if (!supported) recordButton.title = 'Canvas recording is unavailable in this browser.';

  function updateButtons() {
    recordButton.textContent = state === 'recording'
      ? `Stop · ${Math.min(MAX_SECONDS, Math.floor((performance.now() - startedAt) / 1000))}s`
      : state === 'starting' ? 'Starting…' : state === 'stopping' ? 'Finishing…' : 'Record';
    recordButton.disabled = !supported || state === 'starting' || state === 'stopping';
    recordButton.classList.toggle('is-recording', state === 'recording');
    replayButton.hidden = !blob || state !== 'idle';
  }

  function cleanCapture() {
    cancelAnimationFrame(animation);
    removeFrame?.(); removeFrame = null;
    clearInterval(timer);
    sourceStream?.getTracks().forEach(track => track.stop());
    outputStream?.getTracks().forEach(track => track.stop());
    if (sourceVideo) {
      sourceVideo.pause();
      sourceVideo.srcObject = null;
      sourceVideo.remove();
    }
    sourceStream = outputStream = sourceVideo = null;
  }

  function openReplay() {
    if (!blob || destroyed) return;
    onControl();
    onReplay();
    player.src = blobUrl;
    player.currentTime = 0;
    saveButton.disabled = Boolean(savedPath) || blob.size > MAX_BYTES || Boolean(activeSave);
    download.href = blobUrl;
    download.download = `philadelphia-drive-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
    clipStatus.textContent = savedPath ? `Saved to ${savedPath}` : `${(blob.size / 1_000_000).toFixed(1)} MB · Replay before saving or sharing.`;
    if (!dialog.open) dialog.showModal();
  }

  function stop() {
    if (state !== 'recording') return;
    state = 'stopping';
    clearInterval(timer);
    updateButtons();
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  async function start() {
    if (destroyed || state !== 'idle' || !supported) return;
    if (!isActive()) { onStatus('Load the city before recording.'); return; }
    const canvas = getCanvas?.();
    if (!canvas?.width || !canvas?.height) { onStatus('The game canvas is not ready to record.', 'error'); return; }
    const currentGeneration = ++generation;
    state = 'starting';
    updateButtons();
    onControl();
    try {
      // Prefer a synchronous Cesium postRender copy, before WebGL clears its
      // drawing buffer. Offscreen video decoding may otherwise throttle capture.
      if(!subscribeFrame){
      sourceStream = canvas.captureStream(30);
      sourceVideo = document.createElement('video');
      sourceVideo.muted = true;
      sourceVideo.playsInline = true;
      sourceVideo.className = 'recorder-source';
      sourceVideo.srcObject = sourceStream;
      document.body.append(sourceVideo);
      await sourceVideo.play();
      await new Promise((resolve, reject) => {
        if (sourceVideo.readyState >= 2) { resolve(); return; }
        const timeout = setTimeout(() => reject(new Error('No live canvas frames arrived.')), 6000);
        sourceVideo.addEventListener('loadeddata', () => { clearTimeout(timeout); resolve(); }, { once: true });
        sourceVideo.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Canvas capture could not start.')); }, { once: true });
      });
      }
      if (destroyed || currentGeneration !== generation) { cleanCapture(); return; }
      if (!isActive() || document.hidden) throw new Error('Keep the active game visible while recording.');
      const output = document.createElement('canvas');
      const scale = Math.min(1, 1280 / canvas.width, 720 / canvas.height);
      output.width = Math.max(2, Math.floor(canvas.width * scale / 2) * 2);
      output.height = Math.max(2, Math.floor(canvas.height * scale / 2) * 2);
      const context = output.getContext('2d', { alpha: false });
      if (!context) throw new Error('The video compositor could not start.');
      const drawFrame = () => {
        if (destroyed || !['starting', 'recording', 'stopping'].includes(state)) return;
        if (subscribeFrame || sourceVideo?.readyState >= 2) {
          context.drawImage(subscribeFrame ? canvas : sourceVideo, 0, 0, output.width, output.height);
          const padding = Math.max(10, Math.round(output.width * .015));
          const size = Math.max(11, Math.round(output.width / 82));
          const creditSize = Math.max(10, size - 2);
          const lineHeight = creditSize + 4;
          const footerHeight = size * 2.2 + lineHeight * CREDITS.length;
          context.fillStyle = 'rgba(7,16,21,.87)';
          context.fillRect(0, 0, output.width, size * 2.8);
          context.fillRect(0, output.height - footerHeight, output.width, footerHeight);
          context.textBaseline = 'middle';
          context.font = `600 ${size}px Arial, sans-serif`;
          context.fillStyle = '#d8ef83';
          context.fillText('PHILADELPHIA DRIVE · EARLY PROTOTYPE', padding, size * 1.4, output.width - padding * 2);
          context.font = `${size}px Arial, sans-serif`;
          context.fillStyle = '#f3f3eb';
          context.fillText(String(getLabel() || 'Live gameplay'), padding, output.height - footerHeight + size * 1.2, output.width - padding * 2);
          context.font = `${creditSize}px Arial, sans-serif`;
          context.fillStyle = '#b7c6c8';
          CREDITS.forEach((line, index) => context.fillText(line, padding, output.height - footerHeight + size * 2.15 + lineHeight * (index + .5), output.width - padding * 2));
        }
        if(!subscribeFrame) animation = requestAnimationFrame(drawFrame);
      };
      // Schedule the copy in a rendering turn; the decoded stream retains its
      // last actual game frame until the renderer produces another one.
      if(subscribeFrame){
        await new Promise((resolve,reject)=>{
          const timeout=setTimeout(()=>reject(new Error('No rendered game frame arrived.')),6000);
          let first=true;
          removeFrame=subscribeFrame(()=>{drawFrame();if(first){first=false;clearTimeout(timeout);resolve();}});
        });
      }else await new Promise(resolve => requestAnimationFrame(() => { drawFrame(); resolve(); }));
      if(destroyed || currentGeneration!==generation){cleanCapture();return;}
      if(!isActive() || document.hidden)throw new Error('Keep the active game visible while recording.');
      outputStream = output.captureStream(30);
      const mimeType = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('This browser cannot encode WebM clips.');
      chunks = []; bytes = 0;
      recorder = new MediaRecorder(outputStream, { mimeType, videoBitsPerSecond: 5_000_000 });
      recorder.addEventListener('dataavailable', event => {
        if (event.data.size) { chunks.push(event.data); bytes += event.data.size; }
        if (bytes >= MAX_BYTES * .9) stop();
      });
      recorder.addEventListener('stop', () => {
        cleanCapture();
        const result = new Blob(chunks, { type: 'video/webm' });
        chunks = []; recorder = null; state = 'idle';
        if (destroyed) return;
        if (result.size === 0) {
          updateButtons();
          onStatus('The recorder received no video frames. Try again after the scene is visible.', 'error');
          return;
        }
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        blob = result;
        blobUrl = URL.createObjectURL(blob);
        savedPath = null;
        updateButtons();
        onStatus('Gameplay clip recorded. View it, then save to the project or download the WebM.');
        openReplay();
      });
      recorder.addEventListener('error', () => {
        onStatus('Video recording failed. Stop and try recording a shorter clip.', 'error');
        stop();
      });
      recorder.start(1000);
      startedAt = performance.now();
      state = 'recording';
      updateButtons();
      timer = setInterval(() => {
        if (performance.now() - startedAt >= MAX_SECONDS * 1000 || !isActive()) stop();
        else updateButtons();
      }, 200);
      canvas.focus();
      onStatus('Recording the actual game view · 60-second limit · no audio.');
    } catch (error) {
      cleanCapture();
      state = 'idle';
      updateButtons();
      if (!destroyed) onStatus(`Recording could not start: ${error.message}`, 'error');
    }
  }

  recordButton.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation(); onControl();
    if (state === 'recording') { stop(); getCanvas?.()?.focus(); }
    else void start();
  });
  replayButton.addEventListener('click', openReplay);
  panel.addEventListener('pointerdown', event => event.stopPropagation());
  panel.addEventListener('keydown', event => event.stopPropagation());
  dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { player.pause(); getCanvas?.()?.focus(); });
  saveButton.addEventListener('click', async () => {
    if (!blob || activeSave || savedPath) return;
    if (blob.size > MAX_BYTES) { clipStatus.textContent = 'This clip exceeds the local save limit. Use Download WebM.'; return; }
    const capturedBlob = blob;
    const controller = new AbortController();
    activeSave = controller;
    saveButton.disabled = true;
    clipStatus.textContent = 'Saving the recorded video to this project…';
    try {
      const response = await fetch('/__capture', { method: 'POST', headers: { 'Content-Type': 'video/webm' }, body: capturedBlob, signal: controller.signal });
      const result = await response.json();
      if (!response.ok || !result.path) throw new Error(result.error || `Save failed (HTTP ${response.status}).`);
      if (destroyed || blob !== capturedBlob) return;
      savedPath = result.path;
      clipStatus.textContent = `Saved to ${result.path}`;
      onStatus(`Gameplay video saved to ${result.path}`);
    } catch (error) {
      if (!destroyed && error.name !== 'AbortError') clipStatus.textContent = `Could not save to the project: ${error.message} Download WebM is still available.`;
    } finally {
      activeSave = null;
      if (!destroyed) saveButton.disabled = Boolean(savedPath);
    }
  });
  const onVisibility = () => { if (document.hidden) stop(); };
  document.addEventListener('visibilitychange', onVisibility);

  function destroy() {
    if (destroyed) return;
    destroyed = true; generation++;
    if (recorder?.state === 'recording') recorder.stop();
    cleanCapture(); activeSave?.abort();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    document.removeEventListener('visibilitychange', onVisibility);
    panel.remove(); dialog.remove();
  }

  return { start, stop, destroy, get recording() { return state === 'recording'; } };
}
