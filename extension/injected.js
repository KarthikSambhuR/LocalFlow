// LocalFlow Meeting Companion - Page Context Audio & Speaker Engine
(function () {
  'use strict';
  console.log('[LF-injected] 🚀 injected script loaded in MAIN world on', location.href);

  const PLATFORM_DETECTORS = {
    google_meet: () => location.hostname.includes('meet.google.com'),
    zoom: () => location.hostname.includes('zoom.us'),
    teams: () => location.hostname.includes('teams.microsoft.com') || location.hostname.includes('teams.live.com'),
    webex: () => location.hostname.includes('webex.com'),
    discord: () => location.hostname.includes('discord.com'),
    slack: () => location.hostname.includes('app.slack.com')
  };

  const platform = Object.keys(PLATFORM_DETECTORS).find(k => PLATFORM_DETECTORS[k]()) || 'generic';
  if (platform === 'generic') return;

  // Ignore empty background/helper iframes on Google Meet, Discord, Teams, etc.
  if (window !== window.top && platform !== 'zoom') return;

  let config = {
    captureEnabled: true,
    noiseGate: 6
  };

  let forceNextEmit = true;

  window.addEventListener('message', (e) => {
    if (e.source === window && e.data?.source === 'LOCALFLOW_CONTENT' && e.data.type === 'SETTINGS_UPDATED') {
      config = { ...config, ...e.data.settings };
      forceNextEmit = true;
    }
  });

  const BAD_WORDS = new Set([
    'reframe', 'frame', 'person', 'frame person', 'more_vert', 'mute', 'unmute',
    'camera', 'microphone', 'video', 'share', 'presenting', 'raise', 'hand',
    'pin', 'unpin', 'more', 'settings', 'chat', 'people', 'participant', 'participants',
    'contributors', 'in the meeting', 'meeting host', 'host', 'co-host', 'organizer',
    'leave', 'call', 'meeting', 'details', 'captions', 'activities', 'turn on',
    'turn off', 'audio', 'visual', 'grid', 'layout', 'info', 'you', 'push_pin',
    'fullscreen', 'subtitles', 'reactions', 'lock', 'security', 'background',
    'effects', 'apply visual effects', 'add people', 'search for people', 'companion mode',
    'keep_off', 'mic_off', 'mic', 'videocam', 'videocam_off', 'visual_effects', 'more_horiz',
    'devices', 'call_end', 'present_to_all', 'closed_caption', 'back_hand', 'mood',
    'Send a reaction', 'Turn on captions', 'Raise hand', 'Share screen', 'Meeting details',
    'chat_bubble', 'group', 'apps', 'lock_person', 'spark', 'ask gemini'
  ]);

  function cleanName(raw) {
    if (!raw || typeof raw !== 'string') return '';
    return raw
      .replace(/frame_person|reframe|more_vert|mic_off|keep_off|visual_effects|more_horiz|devices/gi, '')
      .replace(/\s*\((you|guest|external|presentation)\)\s*/gi, '')
      .replace(/\b(meeting host|co-host|is speaking|is talking|presenting)\b/gi, '')
      .replace(/^(speaking|talking):\s*/gi, '')
      .replace(/'s (video|presentation).*$/gi, '')
      .replace(/^video of\s+/gi, '')
      .replace(/[\n\r\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50);
  }

  function isValidName(name) {
    if (!name || name.length < 2 || name.length > 50) return false;
    // Reject icon/material-icon tokens like mic_off, videocam_off (all lowercase with underscores, no spaces)
    if (/^[a-z][a-z0-9_]+$/.test(name) && name.includes('_')) return false;
    // Reject meeting codes like "nwe-vrbd-mgi" or timestamps like "15:22"
    if (/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(name)) return false;
    if (/^[0-9:\s\-.,+]+$/.test(name)) return false;

    const lower = name.toLowerCase().trim();
    if (BAD_WORDS.has(lower)) return false;
    for (const word of BAD_WORDS) {
      const w = word.toLowerCase();
      if (lower === w || lower.startsWith(w + ' ') || lower.endsWith(' ' + w)) {
        return false;
      }
    }
    return true;
  }

  function findParticipantTile(el) {
    if (!el) return null;
    const explicit = el.closest?.(
      '[data-participant-id], [data-requested-participant-id], [data-allocation-index], div[role="listitem"], div[role="region"]'
    );
    if (explicit) return explicit;

    // Walk up from name badge to find the video tile container box
    let curr = el.parentElement;
    for (let i = 0; i < 7 && curr && curr !== document.body; i++) {
      const rect = curr.getBoundingClientRect?.();
      if (rect && rect.width >= 120 && rect.height >= 80 && rect.width < window.innerWidth * 0.98) {
        return curr;
      }
      curr = curr.parentElement;
    }
    return el.parentElement;
  }

  function extractNameFromElement(el) {
    if (!el) return '';

    const selfName = el.getAttribute?.('data-self-name') || el.querySelector?.('[data-self-name]')?.getAttribute('data-self-name');
    if (selfName) {
      const c = cleanName(selfName);
      if (isValidName(c)) return c;
    }

    const meetSelectors = ['[jsname="W297wb"]', '.notranslate', 'span[dir="auto"]'];
    for (const sel of meetSelectors) {
      const nodes = el.querySelectorAll?.(sel) || [];
      for (const node of nodes) {
        if (node.closest?.('button, [role="button"], i, .google-material-icons')) continue;
        const c = cleanName(node.textContent);
        if (isValidName(c)) return c;
      }
    }

    const aria = el.getAttribute?.('aria-label');
    if (aria) {
      const c = cleanName(aria);
      if (isValidName(c)) return c;
    }

    const leafNodes = el.querySelectorAll?.('span, div') || [];
    for (const node of leafNodes) {
      if (node.children.length === 0 && !node.closest?.('button, [role="button"], i, svg')) {
        const c = cleanName(node.textContent);
        if (isValidName(c)) return c;
      }
    }
    return '';
  }

  // --- WEBAUDIO & WEBRTC AUDIO ENGINE ---
  let audioCtx = null;
  const trackedStreams = new Map();
  const activePeerConnections = new Set();

  function ensureAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function attachStreamAnalyser(stream, element = null) {
    if (!stream || typeof stream.getAudioTracks !== 'function' || stream.getAudioTracks().length === 0) return;
    const id = stream.id || Math.random().toString(36).slice(2);
    if (trackedStreams.has(id)) {
      if (element) trackedStreams.get(id).element = element;
      return;
    }

    try {
      const ctx = ensureAudioContext();
      if (!ctx) return;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      trackedStreams.set(id, { analyser, dataArray, stream, element });
    } catch (_) {}
  }

  const origSrcObject = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject');
  if (origSrcObject && origSrcObject.set) {
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
      set(val) {
        if (val instanceof MediaStream) attachStreamAnalyser(val, this);
        return origSrcObject.set.call(this, val);
      },
      get() {
        return origSrcObject.get.call(this);
      },
      configurable: true
    });
  }

  // Also intercept local microphone getUserMedia so when YOU speak, we have your exact mic volume!
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async function (...args) {
      const stream = await origGetUserMedia(...args);
      if (stream && stream.getAudioTracks().length > 0) {
        attachStreamAnalyser(stream, null);
      }
      return stream;
    };
  }

  const OrigPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
  if (OrigPeerConnection) {
    const WrappedPC = function (...args) {
      const pc = new OrigPeerConnection(...args);
      activePeerConnections.add(pc);
      pc.addEventListener('track', (e) => {
        if (e.track && e.track.kind === 'audio') {
          const stream = (e.streams && e.streams[0]) || new MediaStream([e.track]);
          attachStreamAnalyser(stream, null);
        }
      });
      return pc;
    };
    WrappedPC.prototype = OrigPeerConnection.prototype;
    Object.assign(WrappedPC, OrigPeerConnection);
    window.RTCPeerConnection = WrappedPC;
  }

  function computeVolume(analyser, dataArray) {
    analyser.getByteTimeDomainData(dataArray);
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const norm = (dataArray[i] - 128) / 128;
      sumSquares += norm * norm;
    }
    const rms = Math.sqrt(sumSquares / dataArray.length);
    return Math.min(100, Math.round(rms * 300));
  }

  function getGlobalAudioEnergy() {
    document.querySelectorAll('audio, video').forEach(el => {
      if (el.srcObject instanceof MediaStream) {
        attachStreamAnalyser(el.srcObject, el);
      }
    });

    let maxVol = 0;
    for (const [id, item] of trackedStreams.entries()) {
      if (!item.stream.active) {
        trackedStreams.delete(id);
        continue;
      }
      const vol = computeVolume(item.analyser, item.dataArray);
      if (vol > maxVol) maxVol = vol;
    }

    for (const pc of activePeerConnections) {
      try {
        const receivers = pc.getReceivers?.() || [];
        for (const r of receivers) {
          if (r.track && r.track.kind === 'audio' && typeof r.getSynchronizationSources === 'function') {
            for (const s of r.getSynchronizationSources()) {
              if (typeof s.audioLevel === 'number') {
                const rtpVol = Math.min(100, Math.round(Math.pow(s.audioLevel, 0.55) * 140));
                if (rtpVol > maxVol) maxVol = rtpVol;
              }
            }
          }
        }
      } catch (_) {}
    }

    return maxVol;
  }

  // --- VOICE EQUALIZER ANIMATION TRACKER ---
  const prevBarSignatures = new Map();

  function isTileMuted(container) {
    if (!container) return false;
    const icons = container.querySelectorAll('i, .google-material-icons, [data-icon-type], svg');
    for (const icon of icons) {
      if (icon.textContent?.trim() === 'mic_off') return true;
    }
    if (container.querySelector('[aria-label*="muted" i], [data-is-muted="true"]')) return true;
    return false;
  }

  function checkTileSpeakingVol(container, name) {
    if (!container || !name) return 0;
    if (isTileMuted(container)) return 0;

    if (
      container.querySelector('[aria-label*="speaking" i], [aria-label*="talking" i], [data-is-speaking="true"]') ||
      /speaking|talking/i.test(container.getAttribute('aria-label') || '')
    ) {
      return 65;
    }

    const styledChildren = container.querySelectorAll('[style*="height"], [style*="transform"]');
    let currentSig = '';
    let maxBarMetric = 0;

    for (const el of styledChildren) {
      const style = el.getAttribute('style') || '';
      if (style.includes('width: 100%') || style.includes('left:') || style.includes('top:')) continue;

      const scaleMatch = style.match(/scaleY\(([0-9.]+)\)/i);
      const heightMatch = style.match(/height:\s*([0-9.]+)(px|%)/i);

      if (scaleMatch) {
        const val = parseFloat(scaleMatch[1]);
        currentSig += `s:${val.toFixed(2)}|`;
        if (val > 0.2 && val <= 2.0) {
          maxBarMetric = Math.max(maxBarMetric, Math.min(100, Math.round(val * 95)));
        }
      } else if (heightMatch) {
        const val = parseFloat(heightMatch[1]);
        const unit = heightMatch[2];
        if ((unit === 'px' && val <= 32) || (unit === '%' && val <= 100)) {
          currentSig += `h:${val.toFixed(1)}|`;
          const norm = unit === 'px' ? (val / 18) * 100 : val;
          if (norm > 20) {
            maxBarMetric = Math.max(maxBarMetric, Math.min(100, Math.round(norm)));
          }
        }
      }
    }

    const now = Date.now();
    const prev = prevBarSignatures.get(name) || { sig: '', activeUntil: 0, lastVol: 0 };

    // Trigger on signature change OR on first non-empty signature (animation started)
    if (currentSig && (currentSig !== prev.sig)) {
      const vol = maxBarMetric > config.noiseGate ? maxBarMetric : Math.floor(45 + Math.random() * 35);
      prevBarSignatures.set(name, { sig: currentSig, activeUntil: now + 450, lastVol: vol });
      return vol;
    }

    prevBarSignatures.set(name, { sig: currentSig, activeUntil: prev.activeUntil, lastVol: prev.lastVol });

    if (now < prev.activeUntil) {
      return Math.max(config.noiseGate, Math.round(prev.lastVol * 0.85));
    }

    return 0;
  }

  // --- COMPREHENSIVE PARTICIPANT & SPEAKER SCANNER ---
  function scanMeetingState() {
    const participantMap = new Map(); // name -> { name, muted, isSelf }
    const activeMap = new Map(); // name -> volume
    const globalAudioVol = getGlobalAudioEnergy();

    if (platform === 'google_meet') {
      const candidateTiles = new Set();

      // 1. Standard participant containers
      document.querySelectorAll(
        '[data-participant-id], [data-requested-participant-id], [data-allocation-index], div[role="listitem"]'
      ).forEach(el => candidateTiles.add(el));

      // 2. Fallback when Contributors panel is closed: find all name badges on stage tiles (.notranslate, [jsname="W297wb"], [data-self-name])
      document.querySelectorAll('[data-self-name], [jsname="W297wb"], .notranslate').forEach(badge => {
        if (badge.closest('button, [role="button"], i, .google-material-icons')) return;
        const name = cleanName(badge.getAttribute('data-self-name') || badge.textContent);
        if (isValidName(name)) {
          const tile = findParticipantTile(badge);
          if (tile) candidateTiles.add(tile);
        }
      });

      const unmutedList = [];

      candidateTiles.forEach(tile => {
        const name = extractNameFromElement(tile);
        if (!isValidName(name)) return;

        // Ignore bottom control bar or top header
        if (tile.closest('[role="banner"], [aria-label*="Call controls" i]')) return;

        const muted = isTileMuted(tile);
        const isSelf = /\(you\)/i.test(tile.textContent || '') || tile.hasAttribute('data-self-name');

        if (!participantMap.has(name)) {
          participantMap.set(name, { name, muted, isSelf });
        } else {
          const existing = participantMap.get(name);
          existing.muted = existing.muted || muted;
          existing.isSelf = existing.isSelf || isSelf;
        }

        const vol = checkTileSpeakingVol(tile, name);
        if (vol >= config.noiseGate) {
          const combined = globalAudioVol > config.noiseGate
            ? Math.round((vol * 0.4) + (globalAudioVol * 0.6))
            : vol;
          activeMap.set(name, Math.max(activeMap.get(name) || 0, combined));
        }

        if (!muted) {
          if (!unmutedList.includes(name)) unmutedList.push(name);
        }
      });

      // Fallback: if audio energy is actively detected (or only 1 participant is unmuted and speaking)
      if (activeMap.size === 0 && globalAudioVol >= Math.max(10, config.noiseGate) && unmutedList.length > 0) {
        for (const name of unmutedList) {
          activeMap.set(name, globalAudioVol);
        }
      }
    } else if (platform === 'discord') {
      document.querySelectorAll('[class*="voiceUser_"], [class*="tile_"]').forEach(el => {
        const nameEl = el.querySelector('[class*="username_"], [class*="name_"]');
        const name = nameEl ? cleanName(nameEl.textContent) : '';
        if (isValidName(name)) {
          const muted = Boolean(el.querySelector('[aria-label*="Muted" i], [class*="mute"]'));
          participantMap.set(name, { name, muted, isSelf: false });
          if (el.querySelector('[class*="avatarSpeaking"], [class*="borderSpeaking"]')) {
            activeMap.set(name, globalAudioVol >= config.noiseGate ? globalAudioVol : Math.floor(45 + Math.random() * 35));
          }
        }
      });
    } else if (platform === 'zoom') {
      document.querySelectorAll('.participants-item, .video-avatar').forEach(el => {
        const name = cleanName(el.textContent);
        if (isValidName(name)) {
          participantMap.set(name, { name, muted: false, isSelf: false });
        }
      });
      document.querySelectorAll('.speaker-bar__speaker-name, .speaking-name, .active-speaker-name').forEach(el => {
        const name = cleanName(el.textContent);
        if (isValidName(name)) {
          participantMap.set(name, { name, muted: false, isSelf: false });
          activeMap.set(name, globalAudioVol >= config.noiseGate ? globalAudioVol : Math.floor(45 + Math.random() * 35));
        }
      });
    } else if (platform === 'teams') {
      document.querySelectorAll('[data-tid="roster-participant"], [role="listitem"]').forEach(el => {
        const name = extractNameFromElement(el);
        if (isValidName(name)) {
          participantMap.set(name, { name, muted: false, isSelf: false });
        }
      });
      document.querySelectorAll('[data-tid="active-speaker-name"], [aria-label*="speaking" i]').forEach(el => {
        const name = cleanName(el.getAttribute('aria-label') || el.textContent);
        if (isValidName(name)) {
          participantMap.set(name, { name, muted: false, isSelf: false });
          activeMap.set(name, globalAudioVol >= config.noiseGate ? globalAudioVol : Math.floor(45 + Math.random() * 35));
        }
      });
    }

    const speakers = [];
    for (const [name, volume] of activeMap.entries()) {
      if (volume >= config.noiseGate) {
        speakers.push({ name, volume: Math.min(100, Math.round(volume)) });
      }
    }
    speakers.sort((a, b) => b.volume - a.volume);

    const result = {
      participants: Array.from(participantMap.values()),
      speakers
    };
    console.log('[LF] scan →', result.participants.map(p => p.name), '| speakers:', result.speakers.map(s => s.name));
    return result;
  }

  // --- 100ms TELEMETRY LOOP ---
  let lastPartKey = '';
  let lastEmitTime = 0;
  let wasEmptySpeakers = true;

  setInterval(() => {
    if (!config.captureEnabled) return;

    const { participants, speakers } = scanMeetingState();
    const now = Date.now();
    const partKey = participants.map(p => `${p.name}:${p.muted ? 'M' : 'U'}`).join('|');
    const participantsChanged = partKey !== lastPartKey;

    // Emit immediately when participants change, when someone is speaking, when popup requests sync, or every 1.5s heartbeat
    if (
      forceNextEmit ||
      participantsChanged ||
      speakers.length > 0 ||
      !wasEmptySpeakers ||
      (now - lastEmitTime > 1500 && participants.length > 0)
    ) {
      forceNextEmit = false;
      lastPartKey = partKey;
      lastEmitTime = now;
      wasEmptySpeakers = speakers.length === 0;

      window.postMessage({
        source: 'LOCALFLOW_INJECTED',
        type: 'MEETING_TELEMETRY',
        platform,
        participants,
        speakers,
        participantsChanged,
        timestamp: now
      }, '*');
    }
  }, 100);
})();