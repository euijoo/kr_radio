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

const channels = [
  {
    group: 'S B S',
    list: [
      {name: 'SBS 파워FM',  freq: 107.7, url: 'https://radio.bsod.kr/stream/?stn=sbs&ch=powerfm',  json: 'schedule/sbs-powerfm.json'},
      {name: 'SBS 러브FM',  freq: 103.5, url: 'https://radio.bsod.kr/stream/?stn=sbs&ch=lovefm',   json: 'schedule/sbs-lovefm.json'},
      {name: 'SBS 고릴라디오M', freq: 88.5, url: 'https://radio.bsod.kr/stream/?stn=sbs&ch=dmb',      json: 'schedule/sbs-gorillam.json'}
    ]
  },
  {
    group: 'M B C',
    list: [
      {name: 'MBC FM4U',   freq: 91.9, url: 'https://radio.bsod.kr/stream/?stn=mbc&ch=fm4u',  json: 'schedule/mbc-fm4u.json'},
      {name: 'MBC 표준FM', freq: 95.9, url: 'https://radio.bsod.kr/stream/?stn=mbc&ch=sfm',   json: 'schedule/mbc-standardfm.json'},
      {name: 'MBC 올댓뮤직', freq: 100.7, url: 'https://radio.bsod.kr/stream/?stn=mbc&ch=chm',  json: 'schedule/mbc-allthatmusic.json'}
    ]
  },
  {
    group: 'K B S',
    list: [
      {name: 'KBS 1라디오', freq: 97.3, url: 'https://radio.bsod.kr/stream/?stn=kbs&ch=1radio', json: 'schedule/kbs-1radio.json'},
      {name: 'KBS 2라디오', freq: 106.1, url: 'https://radio.bsod.kr/stream/?stn=kbs&ch=2radio', json: 'schedule/kbs-happyfm.json'},
      {name: 'KBS 3라디오', freq: 104.9, url: 'https://radio.bsod.kr/stream/?stn=kbs&ch=3radio', json: 'schedule/kbs-3radio.json'},
      {name: 'KBS 1FM',    freq: 93.1, url: 'https://radio.bsod.kr/stream/?stn=kbs&ch=1fm',    json: 'schedule/kbs-classicfm.json'},
      {name: 'KBS 2FM',    freq: 89.1, url: 'https://radio.bsod.kr/stream/?stn=kbs&ch=2fm',    json: 'schedule/kbs-coolfm.json'}
    ]
  },
  {
    group: 'E T C',
    list: [
      {
        name: 'EBS FM',
        freq: 104.5,
        url: 'https://radio.bsod.kr/stream?stn=ebs',
        json: 'schedule/ebs-fm.json'
      },
      {
        name: 'TBS FM',
        freq: 95.1,
        url: 'https://radio.bsod.kr/stream?stn=tbs&ch=fm'
        // json: 'schedule/tbs-fm.json'
      },
      {
        name: 'TBS eFM',
        freq: 101.3,
        url: 'https://radio.bsod.kr/stream?stn=tbs&ch=efm'
        // json: 'schedule/tbs-efm.json'
      },
      {
        name: 'CBS FM',
        freq: 98.1,
        url: 'https://radio.bsod.kr/stream?stn=cbs&ch=sfm',
        json: 'schedule/cbs-standardfm.json'
      },
      {
        name: 'CBS 음악FM',
        freq: 93.9,
        url: 'https://radio.bsod.kr/stream?stn=cbs&ch=mfm',
        json: 'schedule/cbs-musicfm.json'
      },
      {
        name: 'CBS JOY4U',
        freq: 90.1,
        url: 'https://radio.bsod.kr/stream?stn=cbs&ch=joy4u',
        json: 'schedule/cbs-joy4u.json'
      }
    ]
  }
];

const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
const data = buffer.getChannelData(0);
for (let i = 0; i < data.length; i++) {
  data[i] = (Math.random() * 2 - 1) * 0.5;
}
const noise = ctx.createBufferSource();
noise.buffer = buffer;
noise.loop = true;
noise.connect(noiseGain).connect(ctx.destination);
noise.start();

for (let freq = 88; freq <= 108; freq += 0.5) {
  const tick = document.createElement('div');
  if (freq % 4 === 0) {
    tick.className = 'tick major';
    tick.innerHTML = `
      <div class="tick-mark"></div>
      <div class="tick-label">${Math.round(freq)}</div>
    `;
  } else if (freq % 2 === 0) {
    tick.className = 'tick medium';
    tick.innerHTML = `<div class="tick-mark"></div>`;
  } else {
    tick.className = 'tick minor';
    tick.innerHTML = `<div class="tick-mark"></div>`;
  }
  scale.appendChild(tick);
}

const amScale = document.createElement('div');
amScale.className = 'am-scale';
[530, 630, 810, 1080, 1350, 1620].forEach(freq => {
  const tick = document.createElement('div');
  tick.className = 'am-tick major';
  tick.innerHTML = `
    <div class="am-tick-label">${freq}</div>
    <div class="am-tick-mark"></div>
  `;
  amScale.appendChild(tick);
});
document.getElementById('dial').insertBefore(amScale, scale);

async function loadSchedule(path) {
  try {
    const r = await fetch(path);
    currentSchedule = await r.json();
    updateNowProgram();
  } catch {
    currentSchedule = null;
    nowProgram.textContent = '';
  }
}

function dayKey() {
  const d = new Date().getDay();
  return d === 6 ? 'saturday' : d === 0 ? 'sunday' : 'weekday';
}
function toMin(t) {
  let [h, m] = t.split(':').map(Number);
  if (h < 5) h += 24;
  return h * 60 + m;
}
function updateNowProgram() {
  if (!currentSchedule) return;
  const now = new Date();
  let nowMin = now.getHours() * 60 + now.getMinutes();
  if (now.getHours() < 5) nowMin += 1440;
  const list = currentSchedule.schedule[dayKey()] || currentSchedule.schedule.weekday;
  for (let i = 0; i < list.length; i++) {
    const cur = toMin(list[i].time || list[i].start);
    const next = list[i + 1] ? toMin(list[i + 1].time || list[i + 1].start) : 9999;
    if (nowMin >= cur && nowMin < next) {
      const title = list[i].title || list[i].name || '';
      nowProgram.textContent = title;

      if (power && !audio.paused) {
        const flat = channels.flatMap(g => g.list);
        const currentChannel = flat.find(ch => ch.url === audio.src);
        if (currentChannel) {
          updateMediaSession(currentChannel, title);
          stationText.textContent = title
            ? currentChannel.name + ' - ' + title
            : currentChannel.name;
        }
      }
      return;
    }
  }
  nowProgram.textContent = '';
}
setInterval(updateNowProgram, 60000);

function updateNeedle(f) {
  const majorFreqs = [88, 92, 96, 100, 104, 108];
  const ticks = document.querySelectorAll('.tick.major');
  if (ticks.length === 0) {
    needle.style.left = ((f - MIN) / (MAX - MIN) * dial.clientWidth) + 'px';
    freqText.textContent = f.toFixed(1) + ' MHz';
    return;
  }
  let position;
  if (f <= majorFreqs[0]) {
    position = ticks[0].offsetLeft + (ticks[0].offsetWidth / 2);
  } else if (f >= majorFreqs[majorFreqs.length - 1]) {
    position = ticks[ticks.length - 1].offsetLeft + (ticks[ticks.length - 1].offsetWidth / 2);
  } else {
    for (let i = 0; i < majorFreqs.length - 1; i++) {
      if (f >= majorFreqs[i] && f <= majorFreqs[i + 1]) {
        const tick1 = ticks[i].offsetLeft + (ticks[i].offsetWidth / 2);
        const tick2 = ticks[i + 1].offsetLeft + (ticks[i + 1].offsetWidth / 2);
        const ratio = (f - majorFreqs[i]) / (majorFreqs[i + 1] - majorFreqs[i]);
        position = tick1 + (tick2 - tick1) * ratio;
        break;
      }
    }
  }
  needle.style.left = position + 'px';
  freqText.textContent = f.toFixed(1) + ' MHz';
}

function updateMediaSession(channel, programTitle) {
  if (!('mediaSession' in navigator)) return;
  const title = programTitle || channel.name;
  const artist = channel.group || 'FM Radio';
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist,
    album: 'FM Radio',
    artwork: [{ src: 'bg-radio.png', sizes: '512x512', type: 'image/png' }]
  });
}

async function snapTo(freq) {
  isDirectTuning = true;
  stopScan();
  const isIOSDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (audio.src) {
    audio.pause();
    audio.currentTime = 0;
  }
  await new Promise(resolve => setTimeout(resolve, isIOSDevice ? 50 : 30));
  const flat = channels.flatMap(g => g.list);
  const nearest = flat.reduce((a, b) =>
    Math.abs(b.freq - freq) < Math.abs(a.freq - freq) ? b : a
  );
  range.value = nearest.freq;
  updateNeedle(nearest.freq);
  stationText.textContent = nearest.name;

  if (nearest.json) {
    loadSchedule(nearest.json);
  } else {
    currentSchedule = null;
    nowProgram.textContent = '';
  }

  if (!power) {
    stereo.classList.remove('on');
    isDirectTuning = false;
    noiseGain.gain.value = 0;
    return;
  }

  noiseGain.gain.value = 0;
  stereo.classList.remove('on');

  if (audio.src === nearest.url && !audio.paused && audio.readyState >= 2) {
    stationText.textContent = nearest.name;
    stereo.classList.add('on');
    lastTunedFreq = nearest.freq;
    isDirectTuning = false;
    return;
  }

  try {
    audio.pause();
    audio.src = '';
    audio.currentTime = 0;
    await new Promise(resolve => setTimeout(resolve, isIOSDevice ? 80 : 50));
    audio.src = nearest.url;
    audio.volume = currentVolume * originalVolume;
    audio.load();

    const readyPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('스트림 로드 타임아웃 (6초)'));
      }, 6000);

      const onCanPlay = () => {
        clearTimeout(timeout);
        audio.removeEventListener('canplay', onCanPlay);
        audio.removeEventListener('loadeddata', onLoadedData);
        audio.removeEventListener('error', onError);
        resolve();
      };
      const onLoadedData = () => {
        if (audio.readyState >= 2) {
          clearTimeout(timeout);
          audio.removeEventListener('canplay', onCanPlay);
          audio.removeEventListener('loadeddata', onLoadedData);
          audio.removeEventListener('error', onError);
          resolve();
        }
      };
      const onError = () => {
        clearTimeout(timeout);
        audio.removeEventListener('canplay', onCanPlay);
        audio.removeEventListener('loadeddata', onLoadedData);
        audio.removeEventListener('error', onError);
        reject(new Error('스트림 로드 에러'));
      };

      audio.addEventListener('canplay', onCanPlay);
      audio.addEventListener('loadeddata', onLoadedData);
      audio.addEventListener('error', onError);

      if (audio.readyState >= 2) {
        clearTimeout(timeout);
        audio.removeEventListener('canplay', onCanPlay);
        audio.removeEventListener('loadeddata', onLoadedData);
        audio.removeEventListener('error', onError);
        resolve();
      }
    });

    await readyPromise;

    let retryCount = 0;
    const maxRetries = 3;
    let playSuccess = false;

    while (retryCount < maxRetries && !playSuccess) {
      try {
        if (isIOSDevice && retryCount > 0) {
          audio.load();
          await new Promise(resolve => setTimeout(resolve, 150));
        }
        const playPromise = audio.play();
        if (playPromise !== undefined) await playPromise;
        await new Promise(resolve => setTimeout(resolve, 100));

        if (!audio.paused && audio.readyState >= 2) {
          playSuccess = true;
          stationText.textContent = nearest.name;
          stereo.classList.add('on');
          lastTunedFreq = nearest.freq;
          break;
        } else {
          throw new Error('재생 상태 확인 실패');
        }
      } catch (err) {
        retryCount++;
        if (retryCount >= maxRetries) throw err;
        const waitTime = 100 * retryCount;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    if (!playSuccess) throw new Error('최대 재시도 횟수 초과');

  } catch (e) {
    stereo.classList.remove('on');
    noiseGain.gain.value = 0;
    stationText.textContent = nearest.name + ' - 재생 오류';

    setTimeout(async () => {
      if (power && (audio.paused || audio.readyState < 3)) {
        stationText.textContent = nearest.name + ' 재연결 중...';
        try {
          audio.pause();
          audio.src = '';
          audio.currentTime = 0;
          await new Promise(resolve => setTimeout(resolve, 150));
          audio.src = nearest.url;
          audio.volume = currentVolume * originalVolume;
          audio.load();
          await new Promise(resolve => setTimeout(resolve, 300));
          await audio.play();
          stationText.textContent = nearest.name;
          stereo.classList.add('on');
        } catch (retryErr) {
          stationText.textContent = nearest.name + ' - 방송 불가';
        }
      }
    }, 3000);
  } finally {
    setTimeout(() => {
      isDirectTuning = false;
    }, 200);
  }
}

audio.addEventListener('playing', () => {
  if (!power) return;
  noiseGain.gain.value = 0;
  stereo.classList.add('on');
  const flat = channels.flatMap(g => g.list);
  const currentChannel = flat.find(ch => ch.url === audio.src);
  if (currentChannel) {
    stationText.textContent =
      nowProgram.textContent && nowProgram.textContent.trim() !== ''
        ? currentChannel.name + ' - ' + nowProgram.textContent
        : currentChannel.name;
  }
});
audio.addEventListener('waiting', () => {
  stereo.classList.remove('on');
  if (power && !isScanningActive) {
    noiseGain.gain.value = (isDirectTuning || isChanging) ? 0 : 0.05;
    const flat = channels.flatMap(g => g.list);
    const currentChannel = flat.find(ch => ch.url === audio.src);
    if (currentChannel) {
      stationText.textContent =
        (isDirectTuning || isChanging)
          ? currentChannel.name + ' 연결 중...'
          : currentChannel.name + ' - 버퍼링...';
    }
  }
});
audio.addEventListener('stalled', () => {
  setTimeout(() => {
    if (power && audio.readyState < 3 && !audio.paused) {
      const currentSrc = audio.src;
      if (currentSrc) {
        audio.load();
        audio.play().catch(() => {});
      }
    }
  }, 5000);
});
audio.addEventListener('pause', () => {
  stereo.classList.remove('on');
  if (power && !isScanningActive && !isDirectTuning) {
    noiseGain.gain.value = 0.05;
  }
});
audio.addEventListener('error', () => {
  stereo.classList.remove('on');
  if (power) {
    noiseGain.gain.value = (isDirectTuning || isChanging) ? 0 : 0.05;
    const flat = channels.flatMap(g => g.list);
    const currentChannel = flat.find(ch => ch.url === audio.src);
    if (!isDirectTuning && !isChanging) {
      setTimeout(() => {
        if (audio.paused || audio.readyState < 3) {
          stationText.textContent = currentChannel
            ? currentChannel.name + ' - 방송 오류'
            : '방송 오류';
        }
      }, 3000);
    }
  }
});

let inputDebounceTimer = null;
let lastInputFreq = null;

range.addEventListener('input', () => {
  ctx.resume();
  const currentFreq = +range.value;
  lastInputFreq = currentFreq;
  updateNeedle(currentFreq);
  clearTimeout(inputTimer);
  clearTimeout(inputDebounceTimer);

  if (!power) {
    noiseGain.gain.value = 0;
    stereo.classList.remove('on');
    return;
  }

  const isIOSDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isIOSDevice && isTouching) {
    if (!isChanging && !isDirectTuning) {
      startScan(currentFreq);
    }
    return;
  }

  if (!isChanging && !isDirectTuning) {
    if (isIOSDevice || !isTouching) {
      stationText.textContent = '스캔중...';
      startScan(currentFreq);
    }
  }

  if (!isChanging) {
    stereo.classList.remove('on');
  }

  inputDebounceTimer = setTimeout(() => {
    if (!isChanging && !isDirectTuning) {
      stopScan();
      isChanging = true;
      snapTo(currentFreq).then(() => {
        setTimeout(() => { isChanging = false; }, 100);
      }).catch(() => {
        isChanging = false;
      });
    }
  }, 500);

  inputTimer = setTimeout(() => {
    if (!isDirectTuning && !isChanging) {
      stopScan();
    }
  }, 550);
});

range.addEventListener('change', () => {
  const currentFreq = +range.value;
  if (isChanging) return;
  clearTimeout(inputDebounceTimer);
  isChanging = true;
  stopScan();
  snapTo(currentFreq).then(() => {
    setTimeout(() => {
      isChanging = false;
    }, 100);
  }).catch(() => {
    isChanging = false;
  });
});

powerBtn.onclick = () => {
  ctx.resume();
  power = !power;
  powerBtn.classList.toggle('power-on', power);
  if (!power) {
    audio.pause();
    audio.volume = currentVolume * originalVolume;
    stopScan();
    noiseGain.gain.value = 0;
    stereo.classList.remove('on');
    stationText.textContent = '전원 꺼짐';
    nowProgram.textContent = '';
    lastTunedFreq = null;
    isMuted = false;
    audio.muted = false;
    updateMuteUI();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null;
    }
  } else {
    stationText.textContent = '예열중...';
    noiseGain.gain.value = 0.05;
    setTimeout(() => snapTo(+range.value), 800);
  }
};

const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
if (isIOS) {
  range.addEventListener('touchstart', e => {
    isTouching = true;
    lastTouchX = e.touches[0].clientX;
    clearTimeout(inputDebounceTimer);
    if (ctx.state === 'suspended') ctx.resume();
  });

  range.addEventListener('touchmove', e => {
    e.preventDefault();
    if (lastTouchX === null) return;
    const x = e.touches[0].clientX;
    const dx = x - lastTouchX;
    lastTouchX = x;
    const sensitivity = 0.07;
    let v = parseFloat(range.value);
    v += dx * sensitivity;
    v = Math.max(MIN, Math.min(MAX, v));
    range.value = v.toFixed(1);
    const inputEvent = new Event('input', {bubbles: true});
    range.dispatchEvent(inputEvent);
  }, {passive: false});

  range.addEventListener('touchend', () => {
    isTouching = false;
    lastTouchX = null;
    clearTimeout(inputTimer);
    clearTimeout(inputDebounceTimer);
    setTimeout(() => {
      const currentFreq = +range.value;
      if (!isChanging && !isDirectTuning) {
        stopScan();
        isChanging = true;
        isDirectTuning = true;
        snapTo(currentFreq).then(() => {
          setTimeout(() => {
            isChanging = false;
          }, 200);
        }).catch(() => {
          isChanging = false;
          isDirectTuning = false;
        });
      }
    }, 150);
  });
}

function playClickSound() {
  const clickAudio = new Audio('sound/button.mp3');
  clickAudio.volume = 0.5;
  clickAudio.play().catch(() => {});
}
function triggerHaptic() {
  if (navigator.vibrate) navigator.vibrate(10);
  if (window.Taptic && window.Taptic.impact) {
    window.Taptic.impact('light');
  }
}
function feedbackOnClick() {
  playClickSound();
  triggerHaptic();
}

function closeList() {
  channelList.style.height = channelList.scrollHeight + 'px';
  requestAnimationFrame(() => {
    channelList.style.height = '0px';
    channelList.classList.remove('open');
  });
}

const buttonColors = ['sbs', 'mbc', 'kbs', 'etc'];

channels.forEach((g, index) => {
  const tab = document.createElement('div');
  tab.className = 'tab';
  const button = document.createElement('div');
  button.className = `tab-button ${buttonColors[index]}`;
  const label = document.createElement('div');
  label.className = 'tab-label';
  label.textContent = g.group;
  tab.appendChild(button);
  tab.appendChild(label);

  tab.onclick = () => {
    feedbackOnClick();
    if (activeGroup === g) {
      closeList();
      activeGroup = null;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      return;
    }
    activeGroup = g;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    channelList.innerHTML = '';
    g.list.forEach(ch => {
      const d = document.createElement('div');
      d.className = 'channel-item flex justify-between bg-neutral-800 rounded-lg p-3 mb-2 cursor-pointer';
      d.innerHTML = `<span>${ch.name}</span><span class="text-xs text-gray-400">${ch.freq.toFixed(1)}</span>`;
      d.onclick = async () => {
        clearTimeout(inputTimer);
        clearTimeout(inputDebounceTimer);
        isDirectTuning = true;
        isChanging = true;
        stopScan();
        const isIOSDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isIOSDevice) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        await snapTo(ch.freq);
        closeList();
        activeGroup = null;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        setTimeout(() => { isChanging = false; }, 200);
      };
      channelList.appendChild(d);
    });
    channelList.classList.add('open');
    channelList.style.height = '0px';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        channelList.style.height = channelList.scrollHeight + 'px';
      });
    });
  };
  tabs.appendChild(tab);
});

function updateTime() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  document.getElementById('currentTime').textContent = h + ':' + m + ':' + s;
}
updateTime();
setInterval(updateTime, 1000);

document.addEventListener('touchstart', function(e) {
  if (e.touches.length > 1) e.preventDefault();
}, {passive: false});
document.addEventListener('touchmove', function(e) {
  if (e.touches.length > 1) e.preventDefault();
}, {passive: false});
document.addEventListener('touchend', function(e) {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) e.preventDefault();
  lastTouchEnd = now;
}, {passive: false});

let isMouseDown = false;
range.addEventListener('mousedown', () => {
  isMouseDown = true;
  clearTimeout(inputDebounceTimer);
});
range.addEventListener('mouseup', () => {
  isMouseDown = false;
  setTimeout(() => {
    const currentFreq = +range.value;
    if (!isChanging && !isDirectTuning) {
      clearTimeout(inputDebounceTimer);
      stopScan();
      isChanging = true;
      snapTo(currentFreq).then(() => {
        setTimeout(() => { isChanging = false; }, 100);
      }).catch(() => {
        isChanging = false;
      });
    }
  }, 50);
});

range.value = 91.9;
updateNeedle(91.9);
stationText.textContent = '전원 꺼짐';
audio.volume = currentVolume * originalVolume;
isMuted = false;
audio.muted = false;
updateMuteUI();
