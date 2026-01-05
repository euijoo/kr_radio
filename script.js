let scanAudios = [];
let scanInterval = null;
let lastTunedFreq = null;
let originalVolume = 1;
let isDirectTuning = false;
let isScanningActive = false;
let audioContext = null;

function startScan(currentFreq) {
  if (isDirectTuning || isChanging) return;
  isScanningActive = true;

  if (lastTunedFreq && Math.abs(currentFreq - lastTunedFreq) >= 2 && !audio.paused) {
    const fadeOutInterval = setInterval(() => {
      if (audio.volume > 0.05) {
        audio.volume = Math.max(0, audio.volume - 0.15);
      } else {
        audio.pause();
        audio.volume = originalVolume;
        clearInterval(fadeOutInterval);
      }
    }, 30);
  }

  stopScan();

  const flat = channels.flatMap(g => g.list);
  const nearbyStations = flat.filter(ch => Math.abs(ch.freq - currentFreq) <= 2);
  const isIOSDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isIOSDevice) {
    const nearestStation = nearbyStations.reduce((a, b) =>
      Math.abs(b.freq - currentFreq) < Math.abs(a.freq - currentFreq) ? b : a
    , {freq: 0});
    const distanceToNearest = Math.abs(nearestStation.freq - currentFreq);

    if (distanceToNearest <= 1.5 && nearestStation.url) {
      const tempAudio = new Audio(nearestStation.url);
      const volume = Math.max(0, 1 - (distanceToNearest / 1.5));
      tempAudio.volume = volume * 0.25;
      tempAudio.play().catch(() => {});
      scanAudios.push(tempAudio);
    }
    noiseGain.gain.value = Math.min(0.3, distanceToNearest * 0.12);
  } else {
    nearbyStations.forEach(station => {
      const distance = Math.abs(station.freq - currentFreq);
      const volume = Math.max(0, 1 - (distance / 2));
      if (volume > 0.1) {
        const tempAudio = new Audio(station.url);
        tempAudio.volume = volume * 0.4;
        tempAudio.play().catch(() => {});
        scanAudios.push(tempAudio);
      }
    });

    const nearestStation = nearbyStations.reduce((a, b) =>
      Math.abs(b.freq - currentFreq) < Math.abs(a.freq - currentFreq) ? b : a
    , {freq: 0});
    const distanceToNearest = Math.abs(nearestStation.freq - currentFreq);
    noiseGain.gain.value = Math.min(0.2, distanceToNearest * 0.08);
  }
}

function stopScan() {
  scanAudios.forEach((audio, index) => {
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
      audio.load();
    } catch (e) {}
  });
  scanAudios = [];
  isScanningActive = false;
  noiseGain.gain.value = 0;
}

const MIN = 87.5, MAX = 108;
const audio = new Audio();
const ctx = new (window.AudioContext || window.webkitAudioContext)();
const noiseGain = ctx.createGain();
noiseGain.gain.value = 0;

let power = false;
let activeGroup = null;
let currentSchedule = null;
let inputTimer = null;
let isChanging = false;
let lastTouchX = null;
let isTouching = false;
let lastTouchEnd = 0;

let fadeTimer = null;
let currentVolume = 1;
let lastVolumeBeforeMute = 1;
let isMuted = false;

function clearFade() {
  if (fadeTimer) {
    clearInterval(fadeTimer);
    fadeTimer = null;
  }
}
function setVolumeInstant(volume) {
  clearFade();
  audio.volume = Math.max(0, Math.min(1, volume));
}
function fadeToVolume(targetVolume = originalVolume, duration = 800) {
  clearFade();
  targetVolume = Math.max(0, Math.min(1, targetVolume));
  const startVolume = audio.volume;
  const diff = targetVolume - startVolume;
  if (diff === 0) return;
  const steps = 20;
  const stepTime = duration / steps;
  let currentStep = 0;
  fadeTimer = setInterval(() => {
    currentStep++;
    const ratio = currentStep / steps;
    const v = startVolume + diff * ratio;
    audio.volume = Math.max(0, Math.min(1, v));
    if (currentStep >= steps || audio.paused) {
      audio.volume = targetVolume;
      clearFade();
    }
  }, stepTime);
}
function fadeIn(targetVolume = originalVolume, duration = 800) {
  setVolumeInstant(0);
  fadeToVolume(targetVolume, duration);
}
function fadeOut(duration = 500) {
  fadeToVolume(0, duration);
}

const range = document.getElementById('freqRange');
const needle = document.getElementById('needle');
const freqText = document.getElementById('freqText');
const stationText = document.getElementById('stationText');
const nowProgram = document.getElementById('nowProgram');
const stereo = document.getElementById('stereoLamp');
const powerBtn = document.getElementById('powerBtn');
const tabs = document.getElementById('tabs');
const channelList = document.getElementById('channelList');
const scale = document.getElementById('scale');
const muteBtn = document.getElementById('muteBtn');

function updateMuteUI() {
  if (isMuted) {
    muteBtn.classList.add('bg-red-500','shadow','shadow-red-500/80');
    muteBtn.classList.remove('bg-yellow-400/40');
  } else {
    muteBtn.classList.remove('bg-red-500','shadow','shadow-red-500/80');
    muteBtn.classList.add('bg-yellow-400/40');
  }
}
muteBtn.addEventListener('click', () => {
  if (!power) return;
  if (!audio.src) return;

  if (isMuted) {
    isMuted = false;
    audio.muted = false;
    if (lastVolumeBeforeMute <= 0) lastVolumeBeforeMute = 1;
    audio.volume = currentVolume * originalVolume * lastVolumeBeforeMute;
  } else {
    isMuted = true;
    lastVolumeBeforeMute = audio.volume > 0 ? audio.volume / (originalVolume || 1) : currentVolume;
    audio.muted = true;
  }
  updateMuteUI();
});

const chan
