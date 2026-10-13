// LocalFlow Meeting Companion - Page Context Injector
// Hooks into WebAudio, HTMLAudioElement, and WebRTC to isolate audio per participant and extract speaker names

(function () {
  'use strict';

  console.log('[LocalFlow Companion] Injected into meeting page:', window.location.hostname);

  const PLATFORM_DETECTORS = {
    google_meet: () => window.location.hostname.includes('meet.google.com'),
    zoom: () => window.location.hostname.includes('zoom.us'),
    teams: () => window.location.hostname.includes('teams.microsoft.com') || window.location.hostname.includes('teams.live.com'),
    webex: () => window.location.hostname.includes('webex.com'),
    discord: () => window.location.hostname.includes('discord.com'),
    slack: () => window.location.hostname.includes('app.slack.com')
  };

  function getCurrentPlatform() {
    for (const [key, fn] of Object.entries(PLATFORM_DETECTORS)) {
      if (fn()) return key;
    }
    return 'generic';
  }

  const platform = getCurrentPlatform();

  // ── 1. DOM SPEAKER SCRAPERS ───────────────────────────────────────────────
  // Identifies speaker names from active speaking indicators across platforms
  function detectActiveSpeakerFromDOM() {
    let speakerName = '';

    if (platform === 'google_meet') {
      // Google Meet highlights the speaker's tile with blue border or speaking indicator
      const activeTile = document.querySelector('[data-requested-participant-id] [data-self-name], [data-participant-id] [aria-label*="speaking" i], [aria-label*="is talking" i]');
      if (activeTile) {
        speakerName = activeTile.getAttribute('aria-label') || activeTile.textContent || '';
        speakerName = speakerName.replace(/is talking/gi, '').replace(/speaking/gi, '').trim();
      }
      if (!speakerName) {
        // Fallback to active tile name container
        const nameEl = document.querySelector('[data-participant-id] div[title], [data-self-name]');
        if (nameEl) speakerName = nameEl.getAttribute('title') || nameEl.textContent || '';
      }
    } else if (platform === 'zoom') {
      // Zoom web client active speaker display
      const speakerEl = document.querySelector('.speaker-bar__speaker-name, .speaking-name, .active-speaker-name, .participants-item__display-name');
      if (speakerEl) speakerName = speakerEl.textContent.trim();
    } else if (platform === 'teams') {
      // Teams active speaker banner or highlighted tile
      const speakerEl = document.querySelector('[data-tid="active-speaker-name"], .ui-chat__message__author, [aria-label*="speaking" i]');
      if (speakerEl) speakerName = speakerEl.textContent.trim();
    } else if (platform === 'discord') {
      // Discord speaking border: .avatarSpeaking
      const discordSpeaking = document.querySelector('[class*="avatarSpeaking"]');
      if (discordSpeaking) {
        const userContainer = discordSpeaking.closest('[class*="user_"], [class*="voiceUser_"]');
        if (userContainer) {
          const nameEl = userContainer.querySelector('[class*="username_"], [class*="name_"]');
          if (nameEl) speakerName = nameEl.textContent.trim();
        }
      }
    } else if (platform === 'slack') {
      // Slack huddles active speaker
      const slackSpeaking = document.querySelector('[data-qa="huddle_speaker_active"], [class*="c-huddle__speaker--active"]');
      if (slackSpeaking) {
        speakerName = slackSpeaking.textContent.trim();
      }
    } else if (platform === 'webex') {
      // Webex active speaker indicator
      const webexEl = document.querySelector('.active-speaker-container .user-name, [data-testid="active-speaker-name"]');
      if (webexEl) speakerName = webexEl.textContent.trim();
    }

    return speakerName ? speakerName.replace(/[\n\r]+/g, ' ').slice(0, 50).trim() : '';
  }

  // Continuously track DOM active speaker changes
  let lastReportedSpeaker = '';
  setInterval(() => {
    const current = detectActiveSpeakerFromDOM();
    if (current && current !== lastReportedSpeaker) {
      lastReportedSpeaker = current;
      window.postMessage({
        source: 'LOCALFLOW_INJECTED',
        type: 'SPEAKER_ACTIVE',
        platform: platform,
        speakerName: current,
        timestamp: Date.now()
      }, '*');
    }
  }, 350);

  // ── 2. WEBAUDIO & STREAM CAPTURE ──────────────────────────────────────────
  // Shared AudioContext for downsampling to 16kHz mono PCM
  let audioCtx = null;
  const hookedElements = new WeakSet();

  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function attachStreamTap(mediaStream, streamLabel) {
    if (!mediaStream || !mediaStream.getAudioTracks || mediaStream.getAudioTracks().length === 0) return;
    try {
      const ctx = getAudioContext();
      const source = ctx.createMediaStreamSource(mediaStream);
      // ScriptProcessorNode handles PCM buffer extraction (buffer size 4096 = ~256ms of 16kHz audio)
      const processor = ctx.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Compute RMS to prevent sending complete silence
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        if (rms < 0.005) return; // Discard silence

        // Convert Float32 array to binary base64 or raw array
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        const activeSpeaker = detectActiveSpeakerFromDOM() || streamLabel || 'Remote Speaker';

        // Convert Int16Array to binary string for base64 transport
        let binary = '';
        const bytes = new Uint8Array(pcm16.buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);

        window.postMessage({
          source: 'LOCALFLOW_INJECTED',
          type: 'AUDIO_CHUNK',
          platform: platform,
          speakerName: activeSpeaker,
          sampleRate: 16000,
          rms: rms,
          pcmBase64: base64Data,
          timestamp: Date.now()
        }, '*');
      };

      source.connect(processor);
      processor.connect(ctx.destination);
    } catch (err) {
      console.warn('[LocalFlow Companion] Failed to attach audio tap:', err);
    }
  }

  // Hook HTMLMediaElement (Audio / Video elements playing WebRTC incoming audio)
  function monitorAudioElements() {
    const elements = document.querySelectorAll('audio, video');
    elements.forEach((el, index) => {
      if (hookedElements.has(el)) return;
      hookedElements.add(el);

      if (el.srcObject instanceof MediaStream) {
        attachStreamTap(el.srcObject, `Speaker ${index + 1}`);
      }

      // Also listen if srcObject changes later
      el.addEventListener('loadedmetadata', () => {
        if (el.srcObject instanceof MediaStream) {
          attachStreamTap(el.srcObject, `Speaker ${index + 1}`);
        }
      });
    });
  }

  // Observe DOM additions for dynamically added WebRTC audio elements
  const observer = new MutationObserver(() => {
    monitorAudioElements();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  monitorAudioElements();

  // Hook WebRTC RTCPeerConnection to intercept incoming remote audio tracks directly
  const OrigPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
  if (OrigPeerConnection) {
    window.RTCPeerConnection = function (...args) {
      const pc = new OrigPeerConnection(...args);
      pc.addEventListener('track', (event) => {
        if (event.track && event.track.kind === 'audio' && event.streams && event.streams[0]) {
          attachStreamTap(event.streams[0], 'Remote Speaker');
        }
      });
      return pc;
    };
    window.RTCPeerConnection.prototype = OrigPeerConnection.prototype;
  }
})();
