# Meeting and browser companion audit

## Confirmed defects addressed

| Area | Defect and user-visible effect | Change |
| --- | --- | --- |
| Name delivery | Roster only sent on DOM changes; extracting names before the app connects permanently loses the first roster. | Replay cached state on WebSocket open; send current roster with telemetry, including empty rosters. |
| Window synchronization | Opening settings after the original participant event misses the roster. | Added GetExtensionParticipants snapshot API and UI polling. |
| Recording initialization | Starting recording clears already-received extension state. | Preserve the current browser state. |
| Name validation | App rejects any name containing an underscore or the substring frame; page scanner rejects legitimate names ending in control words. | Remove overly broad rejection rules; retain exact control-token filtering in page scanner. |
| Silence and disconnect | Empty speaker/participant updates ignored; last speaker never expires. | Explicit clearing, disconnect cleanup, three-second speaker expiry. |
| Attribution | Local user or multiple simultaneous speakers selected as the first remote speaker. | Exclude identified self; use unnamed remote attribution when multiple remote speakers are detected. |
| Attribution timing | Entire audio turn labelled using whoever is active when silence finally occurs. | Capture identity at turn start; split when a different positively identified speaker arrives. |
| Browser lifecycle | Closed/navigated tabs leave old participants; multiple tabs overwrite each other. | Clear closed/navigated tab state and retain one active source until it empties or becomes stale. |
| Reconnect lifecycle | Obsolete socket callbacks can overwrite the replacement connection; obsolete app sockets can report disconnection for the new connection. | Guard callbacks by socket identity; close superseded app sockets. |
| Injection | Navigation injection and content-script injection can wrap WebRTC more than once. | Idempotent page injection guard. |
| Platform coverage | Webex/Slack had no scanning branches despite advertised support; new Teams hostname absent. | Add scoped Webex/Slack fallbacks and teams.cloud.microsoft coverage. These selectors still need live validation. |
| Extension CPU use | Full DOM scan and participant logging every 100 ms. | Scan at 250 ms and remove repetitive per-scan/forwarding logs. |
| Speaker fallback | Meet global audio marks every unmuted participant as speaking; random volumes shown on other platforms. | Only infer a remote identity when one remote participant is unmuted; deterministic activity indicators. |
| VAD timing | Silence counts callbacks, assuming 30 ms callbacks without configuring that period. | Count samples for a real 600 ms silence threshold. |
| Continuous speech | Twelve-second limit only checked inside the silence branch; continuous speech grows unbounded. | Check maximum length during speech too. |
| Recording stop | Pending mic/system turn buffers discarded; 300 ms sleep doesn't wait for inference. | Flush partial turns, await worker completion, then build transcript and summary. |
| Meeting lifecycle | New meeting can reuse mutable engine channels while previous worker still runs. | Keep stopping state until finalization completes. |
| Startup errors | Failed microphone start can leak devices/context. | Release partially initialized devices and uninitialize audio context. |
| Capture failures | Loopback errors only written to stdout; UI implies full capture. | Emit visible microphone-only warnings. |
| Backpressure | Full segment queue silently discards dialogue. | Emit warnings; original audio remains in full recording buffers. |
| Transcript ordering | Independent mic/system turns saved in dispatch order rather than chronological order. | Sort completed transcript by start time. |
| Meeting model routing | Conformer loads dictation model/config; Whistle bypasses bilingual language detection. | Pass meeting-specific Conformer config; perform bilingual routing before Whistle fast path; fall back from English-only language detection to a downloaded multilingual Whisper model. |
| Conformer concurrency | Model session may be destroyed or replaced while another transcription uses it. | Hold session mutex across initialization and inference. |
| Summary model | Meeting LLM selector ignored in favor of dictation LLM. | Honor MeetingLLMModel first. |
| Summary identity | Streaming regeneration events labelled with current recording ID instead of summarized meeting. | Pass explicit meeting ID through summarizer. |
| Summary concurrency | Multiple meeting summaries can replace each other's model server. | Serialize meeting summary jobs. Dictation/server lifecycle coordination still needs broader work. |
| Summary errors | Non-EOF stream failures accepted as successful partial summaries. | Return stream read errors. |
| UI lifecycle | Repeated setup creates duplicate listeners and polling intervals. | Apply existing initialization guard. |
| UI event routing | Old recording segments can enter current live dialogue; stop can re-add an already completed summary as generating. | Filter by meeting ID; rely on summary lifecycle events. |
| Empty regeneration | Empty transcript returns success without completion event, leaving loading state stuck. | Return a proper error. |
| Product messaging | UI claims isolated speaker audio arrives from extension, but server only handles metadata. | Explain that app records microphone/system output. |

## Remaining limitations and potential causes

- Live selector compatibility is unverified for Google Meet, Zoom, Teams, Webex, Discord and Slack. Participant panels, localization, layout variants and virtualized/off-screen rosters can hide names. Added Webex/Slack selectors are best-effort fallbacks, not verified platform integrations.
- Only top-level frames are injected/forwarded. Calls hosted in iframes can be invisible. Browser extension does not inspect native desktop clients.
- The extension does not transmit per-person PCM into the meeting engine. Audio is mixed Windows system output plus microphone. Unrelated system audio can be transcribed. Output-device changes or a meeting routed to another output may not match the default loopback device.
- Speaker attribution uses UI activity hints, not verified acoustic diarization. Overlap, UI latency, hidden tiles and brief speaker changes can remain ambiguous. The standalone fallback's centroid/zero-crossing heuristic is not a speaker embedding and is unreliable for distinguishing people.
- The microphone's so-called AEC is an energy gate, not acoustic echo cancellation. Speakers can bleed into the microphone; quiet local speech can be rejected. Headphones help distinguish this from engine failures.
- Bilingual detection still requires a downloaded multilingual Whisper model. If none is available, the app logs the missing prerequisite and uses English; the UI does not yet validate this prerequisite.
- Fixed energy thresholds can miss soft speech and admit background sounds. Maximum chunks can cut words at twelve seconds; no overlap reconciliation is implemented.
- Slow CPUs can fill the bounded inference queue. Warnings now expose loss, but no persistent transcription backlog/reprocessing system exists. Stop waits for queued inference and can take time.
- Entire mic and system recordings remain in float32 RAM; stop allocates another mixed buffer. Long meetings remain expensive for low-memory devices. WAV saving currently writes one sample at a time and ignores write/close failures.
- Several DB/audio persistence failures remain ignored. Startup creates the meeting DB row before audio initialization, so a failed start can leave an empty record.
- Summarization sends the whole transcript in a single context window. Long meetings can exceed context. There is no hierarchical chunk summarizer.
- Fallback model selection can choose an unsuitable GGUF (including a specialized normalizer). A successful server connection does not guarantee a suitable summarization model.
- Serializing meeting summaries does not prevent dictation or another app process from restarting the shared LLM server during a summary.
- The extension port is configurable but the app listens at fixed port 28282. Leave extension port at 28282. Port conflicts or another app instance can prevent the server from binding; listener failure is still logged rather than exposed in UI.
- Bridge currently accepts any WebSocket origin on loopback and uses no pairing token. This should be hardened before wider distribution.
- No saved backend recording/summary status is restored into the UI on reload. Returning to a newly opened window during a recording can still show the hub; summary progress is held in frontend memory.

## Verification and live-call checklist

Automated checks: `node --test extension/bridge.test.cjs`; backend regressions in meeting_regression_test.go; frontend production build. Backend tests need native DLLs on PATH.

1. Rebuild/restart the app, reload the unpacked extension, then reload existing meeting tabs.
2. Keep extension port at 28282. Start the call before launching LocalFlow; confirm roster recovery without anyone joining/leaving.
3. Close/reopen settings and confirm roster recovery. Start recording and verify names remain available.
4. Test self speech, remote speech, silence, remote speaker changes, and overlapping voices. Confirm uncertain turns use a generic remote label.
5. Stop immediately after speech, then repeat with more than twelve seconds of uninterrupted speech. Check that the tail appears and the summary includes it.
6. Close/navigate the meeting tab, reconnect the app, and test two open meeting tabs. Check old names clear and inactive tabs do not overwrite the call.
7. Test all six platforms with participant panel open and closed. Record DOM/layout/localization failures separately from bridge delivery failures.
8. Select different dictation/meeting models, including Malayalam Conformer and bilingual routing; verify the selected meeting model loads.
9. Regenerate an older meeting while a newer meeting exists and confirm streaming text updates only the requested meeting.
10. Test unavailable microphone/system output and slow inference; check visible warnings and saved audio.

## Follow-up: Google Meet displays Remote Speaker

The previous bridge delivered roster names but did not preserve enough identity data to attribute system audio when Meet's activity animation was missed. The extension now sends the remote roster when local identity is known, including when the local tile is labelled only You. The engine uses a fresh sole-remote identity for two-person calls, accepts late identity for a pending unnamed turn, and retains generic attribution when several remotes are ambiguous. Fixed mute detection treating unmuted as muted. Extension version: 1.1.5. Existing meeting records are not relabelled retroactively. Live Meet validation is still required.
