"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ALL_QUESTIONS,
  FREE_NOTE_QUESTION,
  chapterForQuestion,
  type InterviewQuestion,
} from "@/lib/interview/script";
import { ACKNOWLEDGMENTS, FOLLOW_UPS, PATIENCE_LINES } from "@/lib/interview/persona";

type Phase = "intro" | "idle" | "recording" | "review" | "saving" | "done";

// Common ways to say who someone is to you — offered as quick suggestions;
// people can also type their own.
const RELATIONSHIP_OPTIONS = [
  "Mother", "Father", "Brother", "Sister", "Son", "Daughter",
  "Grandmother", "Grandfather", "Wife", "Husband", "Partner",
  "Aunt", "Uncle", "Cousin", "Friend",
];

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return "";
}

type Person = { id: string | null; name: string; relationship?: string | null };

export default function InterviewExperience({
  displayName,
  people = [],
  startIndex = 0,
  noteMode = false,
  skipIntro = false,
}: {
  displayName: string;
  people?: { id: string; name: string; relationship: string | null }[];
  /** Question index to begin at (from "continue" / chapter entry). */
  startIndex?: number;
  /** Free-form "quick voice note" — a single question, not the scripted flow. */
  noteMode?: boolean;
  /** Skip the intro card and go straight into a question. */
  skipIntro?: boolean;
}) {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>(skipIntro || noteMode ? "idle" : "intro");
  const [qi, setQi] = useState(startIndex);
  const [transcript, setTranscript] = useState("");
  const [hasRecorded, setHasRecorded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [patience, setPatience] = useState(PATIENCE_LINES[0]);

  // Who-was-there roster. Seeded with the family already in the forest; grows as
  // the person names new people. Selection resets per question.
  const [roster, setRoster] = useState<Person[]>(() =>
    people.map((p) => ({ id: p.id, name: p.name, relationship: p.relationship })),
  );
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");
  const [newRel, setNewRel] = useState("");
  const keyOf = (p: Person) => p.id ?? `new:${p.name.toLowerCase()}`;

  const togglePerson = useCallback((p: Person) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const k = p.id ?? `new:${p.name.toLowerCase()}`;
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const addPerson = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    const rel = newRel.trim();
    setNewName("");
    setNewRel("");
    setRoster((prev) => {
      const existing = prev.find((r) => r.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        const k = existing.id ?? `new:${existing.name.toLowerCase()}`;
        setSelectedKeys((s) => new Set(s).add(k));
        // Fill in a relationship if we didn't have one yet.
        if (rel && !existing.relationship) {
          return prev.map((r) => (r === existing ? { ...r, relationship: rel } : r));
        }
        return prev;
      }
      const added: Person = { id: null, name, relationship: rel || null };
      setSelectedKeys((s) => new Set(s).add(`new:${name.toLowerCase()}`));
      return [...prev, added];
    });
  }, [newName, newRel]);

  const [canRecognize, setCanRecognize] = useState(false);
  const [canRecordAudio, setCanRecordAudio] = useState(false);
  // Whether to run live speech-to-text *while recording*. On Android the speech
  // recognizer and the audio recorder fight over the single microphone, and the
  // recognizer wins — starving the recorder so it captures 0 bytes. There we
  // turn live transcription off and let the audio recording have the mic.
  const [liveTranscribe, setLiveTranscribe] = useState(false);
  // Bytes actually captured by the recorder — surfaced on screen so we can tell
  // (especially on iOS) whether the mic is really producing audio data.
  const [capturedKb, setCapturedKb] = useState(0);
  const bytesRef = useRef(0);
  // Human-readable reason the mic is unavailable, so the person knows what to fix.
  const [micReason, setMicReason] = useState("");
  // Whether the interviewer's voice may auto-play. On mobile, the spoken voice
  // (speechSynthesis) holds the device audio session in "playback" and starves
  // the recorder, so answers save as 0 KB. Recording must win the mic there, so
  // we never auto-speak on mobile — the person can still tap the speaker icon to
  // hear a question. Desktop keeps the fully spoken experience.
  const autoSpeakRef = useRef(true);

  // Recording machinery.
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);
  const committedRef = useRef("");
  const finalRef = useRef("");
  const wantRecognitionRef = useRef(false);

  // Duration accounting across pause/resume segments.
  const accMsRef = useRef(0);
  const segStartRef = useRef(0);

  // Voice + rotation state.
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const ackIdxRef = useRef(0);
  const followIdxRef = useRef(0);
  const prevChapterRef = useRef<string | null>(null);

  const question: InterviewQuestion | undefined = noteMode
    ? FREE_NOTE_QUESTION
    : ALL_QUESTIONS[qi];
  const chapter = noteMode ? undefined : question ? chapterForQuestion(question.id) : undefined;
  const hasContent = transcript.trim().length > 0 || hasRecorded;

  useEffect(() => {
    setCanRecognize(
      typeof window !== "undefined" &&
        !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    );
    if (typeof window === "undefined") return;
    const secure = window.isSecureContext;
    const hasMR = typeof MediaRecorder !== "undefined";
    const hasGUM = !!navigator.mediaDevices?.getUserMedia;
    const audioOk = secure && hasMR && hasGUM;
    setCanRecordAudio(audioOk);
    const recog = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    // Android's recognizer steals the mic from the recorder, so only transcribe
    // live when we're NOT also recording audio there.
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    setLiveTranscribe(recog && !(audioOk && isMobile));
    // Recording wins over playback on mobile: never auto-speak there, so the
    // spoken interviewer voice can't hold the audio session away from the mic.
    autoSpeakRef.current = !(audioOk && isMobile);
    if (!secure) {
      setMicReason(
        "This page isn't on a secure (https) connection, so the browser blocks the microphone. Open the site using its https:// web address.",
      );
    } else if (!hasGUM || !hasMR) {
      setMicReason("This browser can't record audio. Try Chrome for the full experience.");
    }
  }, []);

  // --- pick a warm voice ---------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return;
      const prefer = [
        "Samantha", "Karen", "Serena", "Moira", "Fiona", "Tessa",
        "Google US English", "Google UK English Female",
        "Microsoft Aria", "Microsoft Jenny", "Ava", "Allison",
      ];
      let chosen =
        voices.find((v) => v.lang.startsWith("en") && prefer.some((p) => v.name.includes(p))) ||
        voices.find((v) => v.lang.startsWith("en") && v.localService) ||
        voices.find((v) => v.lang.startsWith("en")) ||
        null;
      voiceRef.current = chosen;
    };
    pick();
    window.speechSynthesis.onvoiceschanged = pick;
    return () => {
      try {
        window.speechSynthesis.onvoiceschanged = null;
      } catch {
        /* ignore */
      }
    };
  }, []);

  // --- interviewer voice ---------------------------------------------------
  const speakSequence = useCallback((lines: string[], onDone?: () => void) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      onDone?.();
      return;
    }
    const clean = lines.map((l) => (l || "").trim()).filter(Boolean);
    if (!clean.length) {
      onDone?.();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      clean.forEach((line, i) => {
        const u = new SpeechSynthesisUtterance(line);
        u.rate = 0.92;
        u.pitch = 1.0;
        if (voiceRef.current) u.voice = voiceRef.current;
        if (i === 0) u.onstart = () => setSpeaking(true);
        if (i === clean.length - 1)
          u.onend = () => {
            setSpeaking(false);
            onDone?.();
          };
        window.speechSynthesis.speak(u);
      });
    } catch {
      onDone?.();
    }
  }, []);

  const speak = useCallback((text: string) => speakSequence([text]), [speakSequence]);

  // Automatic (unprompted) interviewer speech. Suppressed on mobile so it never
  // competes with the mic; the onDone callback still fires so flows that resume
  // recording after a line keep working.
  const maybeSpeak = useCallback(
    (lines: string[], onDone?: () => void) => {
      if (!autoSpeakRef.current) {
        onDone?.();
        return;
      }
      speakSequence(lines, onDone);
    },
    [speakSequence],
  );

  const stopSpeaking = useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    setSpeaking(false);
  }, []);

  // --- speech recognition --------------------------------------------------
  const startRecognition = useCallback(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalRef.current += res[0].transcript;
        else interim += res[0].transcript;
      }
      setTranscript((committedRef.current + finalRef.current + interim).replace(/\s+/g, " ").trimStart());
    };
    rec.onend = () => {
      if (wantRecognitionRef.current) {
        try {
          rec.start();
        } catch {
          /* already starting */
        }
      }
    };
    rec.onerror = () => {
      /* transient — audio + typing still work */
    };
    recognitionRef.current = rec;
    wantRecognitionRef.current = true;
    try {
      rec.start();
    } catch {
      /* ignore */
    }
  }, []);

  const stopRecognition = useCallback(() => {
    wantRecognitionRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
  }, []);

  // --- recording (continuous with pause/resume) ----------------------------
  const teardownStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Discard everything for the current question (start-over / navigation).
  const hardStopRecording = useCallback(() => {
    wantRecognitionRef.current = false;
    try {
      recognitionRef.current?.abort();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;
    teardownStream();
  }, [teardownStream]);

  const beginSegment = useCallback(() => {
    segStartRef.current = Date.now();
    if (liveTranscribe) startRecognition();
    setPhase("recording");
  }, [liveTranscribe, startRecognition]);

  // Fresh recording for this question.
  const startRecording = useCallback(async () => {
    setError(null);
    // iOS keeps the audio session in "playback" while speech synthesis is
    // active, which can make the mic capture silence. Cancel any speech and let
    // the session flip to record before we open the mic.
    stopSpeaking();
    committedRef.current = transcript ? transcript.trimEnd() + " " : "";
    finalRef.current = "";
    accMsRef.current = 0;
    bytesRef.current = 0;
    setCapturedKb(0);

    if (canRecordAudio) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        chunksRef.current = [];
        const mimeType = pickMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            chunksRef.current.push(ev.data);
            bytesRef.current += ev.data.size;
            setCapturedKb(Math.round(bytesRef.current / 1024));
          }
        };
        recorderRef.current = recorder;
        // Timeslice: flush a chunk every second. Without this, some mobile
        // browsers (notably iOS Safari) buffer everything and can hand back an
        // empty blob on stop — so recordings silently failed to save.
        recorder.start(1000);
      } catch (err) {
        const name = err instanceof Error ? err.name : "unknown error";
        let why = "Please try again.";
        if (name === "NotAllowedError") {
          why =
            "The browser is blocking the mic for this site. Tap the padlock (or ⋮ menu) in the address bar → Site settings/Permissions → allow Microphone, then reload.";
        } else if (name === "NotFoundError") {
          why = "No microphone was found on this device.";
        } else if (name === "NotReadableError") {
          why = "Another app may be using the microphone. Close it and try again.";
        } else if (name === "SecurityError") {
          why = "The connection isn't secure — open the site using its https:// web address.";
        }
        setError(`I couldn't reach your microphone (${name}). ${why} You can still type your answer below.`);
      }
    }
    beginSegment();
  }, [transcript, canRecordAudio, beginSegment, stopSpeaking]);

  // Resume the same recording (after a follow-up) or start one if none exists.
  const resumeOrStart = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state === "paused") {
      committedRef.current = transcript ? transcript.trimEnd() + " " : "";
      finalRef.current = "";
      try {
        rec.resume();
      } catch {
        /* ignore */
      }
      beginSegment();
    } else {
      void startRecording();
    }
  }, [transcript, beginSegment, startRecording]);

  // Pause (the "Stop" affordance) — keeps the session so we can continue.
  const pauseRecording = useCallback(() => {
    accMsRef.current += Date.now() - segStartRef.current;
    stopRecognition();
    const rec = recorderRef.current;
    if (rec && rec.state === "recording") {
      try {
        rec.pause();
      } catch {
        /* ignore */
      }
    }
    setHasRecorded(true);
    setPhase("review");
  }, [stopRecognition]);

  // Finalize into a single blob for saving.
  const finalizeRecording = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const rec = recorderRef.current;
        if (!rec || rec.state === "inactive") {
          resolve(audioBlobRef.current);
          return;
        }
        rec.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/mp4" });
          audioBlobRef.current = blob;
          teardownStream();
          recorderRef.current = null;
          resolve(blob);
        };
        try {
          // On iOS, stopping a *paused* recorder can hand back an empty file.
          // Resume it first, then flush any buffered audio before stopping so
          // the final chunk is captured.
          if (rec.state === "paused") {
            try {
              rec.resume();
            } catch {
              /* ignore */
            }
          }
          try {
            rec.requestData();
          } catch {
            /* ignore */
          }
          rec.stop();
        } catch {
          resolve(audioBlobRef.current);
        }
      }),
    [teardownStream],
  );

  const resetAnswer = useCallback(() => {
    hardStopRecording();
    audioBlobRef.current = null;
    chunksRef.current = [];
    accMsRef.current = 0;
    finalRef.current = "";
    committedRef.current = "";
    setTranscript("");
    setHasRecorded(false);
    setSelectedKeys(new Set());
    setNewName("");
    setNewRel("");
  }, [hardStopRecording]);

  const pickAck = useCallback(() => {
    const v = ACKNOWLEDGMENTS[ackIdxRef.current % ACKNOWLEDGMENTS.length];
    ackIdxRef.current += 1;
    return v;
  }, []);

  const pickFollowUp = useCallback(() => {
    const v = FOLLOW_UPS[followIdxRef.current % FOLLOW_UPS.length];
    followIdxRef.current += 1;
    return v;
  }, []);

  // --- navigation ----------------------------------------------------------
  const goToQuestion = useCallback(
    (index: number, ackLine?: string) => {
      resetAnswer();
      setError(null);
      if (index >= ALL_QUESTIONS.length) {
        maybeSpeak(ackLine ? [ackLine] : []);
        setPhase("done");
        return;
      }
      const q = ALL_QUESTIONS[index];
      const ch = chapterForQuestion(q.id);
      const chapterChanged = (ch?.id ?? null) !== prevChapterRef.current;
      prevChapterRef.current = ch?.id ?? null;
      setQi(index);
      setPhase("idle");
      const lines = [ackLine, chapterChanged ? ch?.intro : undefined, q.prompt].filter(
        (l): l is string => !!l,
      );
      setTimeout(() => maybeSpeak(lines), 300);
    },
    [resetAnswer, maybeSpeak],
  );

  const beginInterview = useCallback(() => {
    prevChapterRef.current = null;
    goToQuestion(0);
  }, [goToQuestion]);

  // When entered from the + menu we skip the intro card. Kick off the right
  // opening: a scripted question at startIndex, or the free-form note prompt.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    if (!skipIntro && !noteMode) return;
    startedRef.current = true;
    prevChapterRef.current = null;
    if (noteMode) {
      setPhase("idle");
      setTimeout(() => maybeSpeak([FREE_NOTE_QUESTION.prompt]), 300);
    } else {
      goToQuestion(startIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ask a gentle follow-up, then keep listening on the same recording.
  const askFollowUp = useCallback(() => {
    setError(null);
    const line = pickFollowUp();
    maybeSpeak([line], () => {
      if (canRecordAudio || canRecognize) resumeOrStart();
    });
  }, [pickFollowUp, maybeSpeak, canRecordAudio, canRecognize, resumeOrStart]);

  const startOver = useCallback(() => {
    resetAnswer();
    setPhase("idle");
    if (question) setTimeout(() => maybeSpeak([question.prompt]), 200);
  }, [resetAnswer, question, maybeSpeak]);

  const saveAnswer = useCallback(async () => {
    if (!question) return;
    const text = transcript.trim();
    if (!text && !hasRecorded) {
      setError("Record or type something first, or skip this question.");
      return;
    }
    setPhase("saving");
    setError(null);
    try {
      const blob = await finalizeRecording();
      const durationMs =
        accMsRef.current + (phase === "recording" ? Date.now() - segStartRef.current : 0);

      // Don't save an empty memory: if the mic produced no audio and there's no
      // typed text, tell the person rather than silently storing nothing.
      if (!text && (!blob || blob.size === 0)) {
        setError(
          "I didn't catch any audio or text. Please try recording again, or type your answer below.",
        );
        setPhase("review");
        return;
      }

      const fd = new FormData();
      fd.append("questionId", question.id);
      fd.append("transcript", text);
      fd.append("durationMs", String(Math.round(durationMs) || 0));
      if (blob && blob.size > 0) {
        const ext = (blob.type.split("/")[1] || "webm").split(";")[0];
        fd.append("audio", blob, `answer.${ext}`);
      }

      // The people the person tapped as part of this story.
      const selected = roster.filter((p) => selectedKeys.has(keyOf(p)));
      if (selected.length) {
        fd.append(
          "people",
          JSON.stringify(
            selected.map((p) =>
              p.id ? { id: p.id } : { name: p.name, relationship: p.relationship ?? undefined },
            ),
          ),
        );
      }

      const res = await fetch("/api/interview/answer", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Something went wrong saving that.");
      }

      // Adopt real ids for any freshly planted people so later questions reuse
      // the same sapling instead of planting a duplicate.
      if (Array.isArray(data.linkedPeople) && data.linkedPeople.length) {
        const linked = data.linkedPeople as { id: string; name: string }[];
        setRoster((prev) =>
          prev.map((p) => {
            if (p.id) return p;
            const match = linked.find((l) => l.name.toLowerCase() === p.name.toLowerCase());
            return match ? { ...p, id: match.id } : p;
          }),
        );
      }

      if (noteMode) {
        // A free-form note is a single memory — go straight to the closing card.
        maybeSpeak([pickAck()]);
        setPhase("done");
      } else {
        goToQuestion(qi + 1, pickAck());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong saving that.");
      setPhase("review");
    }
  }, [question, transcript, hasRecorded, phase, finalizeRecording, goToQuestion, qi, pickAck, roster, selectedKeys, noteMode, maybeSpeak]);

  // Rotate the patience line while recording.
  useEffect(() => {
    if (phase !== "recording") return;
    let i = 0;
    setPatience(PATIENCE_LINES[0]);
    const id = setInterval(() => {
      i = (i + 1) % PATIENCE_LINES.length;
      setPatience(PATIENCE_LINES[i]);
    }, 6000);
    return () => clearInterval(id);
  }, [phase]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      wantRecognitionRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const progress = Math.round((qi / ALL_QUESTIONS.length) * 100);

  return (
    <main className="relative min-h-[100dvh] bg-gradient-to-b from-[#0b1410] via-[#0a1a12] to-[#05090a] px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] font-sans text-parchment sm:px-6">
      <button
        onClick={() => {
          hardStopRecording();
          stopSpeaking();
          router.push("/forest");
        }}
        className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] z-10 rounded-full border border-parchment/20 bg-black/30 px-4 py-1.5 text-sm text-parchment/70 transition hover:border-parchment/50 hover:text-parchment"
      >
        {phase === "done" ? "To my forest ›" : "Save & exit ›"}
      </button>

      <div className="mx-auto flex min-h-[75vh] max-w-2xl flex-col justify-center">
        {phase === "intro" ? (
          <IntroCard
            displayName={displayName}
            canRecognize={canRecognize}
            canRecordAudio={canRecordAudio}
            onBegin={beginInterview}
          />
        ) : phase === "done" ? (
          <DoneCard onEnter={() => router.push("/forest")} />
        ) : (
          <>
            <div className="mb-8">
              {noteMode ? (
                <div className="text-xs uppercase tracking-[0.25em] text-canopy-light">
                  Quick voice note
                </div>
              ) : (
                <>
                  <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.25em] text-canopy-light">
                    <span>{chapter?.title}</span>
                    <span className="text-parchment/40">
                      {qi + 1} / {ALL_QUESTIONS.length}
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-parchment/10">
                    <div
                      className="h-full rounded-full bg-canopy transition-all duration-700"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="mb-6">
              <div className="flex items-start gap-3">
                <button
                  onClick={() => question && speak(question.prompt)}
                  title="Hear the question again"
                  className={`mt-1 shrink-0 rounded-full border px-2.5 py-2 transition ${
                    speaking
                      ? "border-fruit/60 text-fruit"
                      : "border-parchment/25 text-parchment/60 hover:border-parchment/60 hover:text-parchment"
                  }`}
                  aria-label="Hear the question again"
                >
                  <SpeakerIcon />
                </button>
                <h1 className="font-serif text-2xl leading-snug text-parchment sm:text-3xl">
                  {question?.prompt}
                </h1>
              </div>
              {question?.hint ? (
                <p className="mt-3 pl-12 text-sm text-parchment/50">{question.hint}</p>
              ) : null}
            </div>

            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder={
                phase === "recording"
                  ? liveTranscribe
                    ? "Listening… speak naturally, in your own time."
                    : "Recording your voice now — your words won't appear on screen in this browser, but the audio is being saved. You can also type here."
                  : liveTranscribe
                    ? "Press record and speak — your words appear here. You can edit them anytime."
                    : "Type your answer here."
              }
              rows={6}
              className="w-full resize-none rounded-2xl border border-parchment/15 bg-black/30 p-4 text-base leading-relaxed text-parchment outline-none transition focus:border-canopy-light"
            />

            {error ? (
              <p className="mt-3 rounded-lg bg-red-900/40 px-4 py-2 text-sm text-red-200">{error}</p>
            ) : null}

            {!canRecordAudio && micReason ? (
              <p className="mt-3 rounded-lg bg-amber-900/30 px-4 py-2 text-sm text-amber-200">
                {micReason}
              </p>
            ) : null}

            {hasContent && phase !== "recording" ? (
              <div className="mt-6 rounded-2xl border border-parchment/10 bg-black/20 p-4">
                <p className="text-sm text-parchment/85">Who was part of this story?</p>
                <p className="mt-1 text-xs text-parchment/45">
                  Tap anyone who was there — I'll connect this memory to them in your forest.
                </p>
                {roster.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {roster.map((p) => {
                      const on = selectedKeys.has(keyOf(p));
                      return (
                        <button
                          key={keyOf(p)}
                          type="button"
                          onClick={() => togglePerson(p)}
                          className={`rounded-full border px-3 py-1.5 text-sm transition ${
                            on
                              ? "border-fruit/70 bg-fruit/20 text-parchment"
                              : "border-parchment/20 text-parchment/60 hover:border-parchment/50 hover:text-parchment"
                          }`}
                        >
                          {p.name}
                          {p.relationship ? (
                            <span className="text-parchment/40"> · {p.relationship}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addPerson();
                      }
                    }}
                    placeholder="Add someone by name…"
                    className="min-w-[10rem] flex-1 rounded-full border border-parchment/15 bg-black/30 px-4 py-1.5 text-sm text-parchment outline-none transition focus:border-canopy-light"
                  />
                  <input
                    value={newRel}
                    onChange={(e) => setNewRel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addPerson();
                      }
                    }}
                    list="everroot-relationships"
                    placeholder="Who are they to you?"
                    className="min-w-[9rem] flex-1 rounded-full border border-parchment/15 bg-black/30 px-4 py-1.5 text-sm text-parchment outline-none transition focus:border-canopy-light"
                  />
                  <datalist id="everroot-relationships">
                    {RELATIONSHIP_OPTIONS.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    onClick={addPerson}
                    className="rounded-full border border-parchment/25 px-4 py-1.5 text-sm text-parchment/70 transition hover:border-parchment/60 hover:text-parchment"
                  >
                    Add
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {phase === "recording" ? (
                <>
                  <button
                    onClick={pauseRecording}
                    className="inline-flex items-center gap-2 rounded-full bg-red-600 px-6 py-3 font-semibold text-white transition hover:bg-red-500"
                  >
                    <span className="h-2.5 w-2.5 animate-pulse rounded-sm bg-white" />
                    I'm done for now
                  </button>
                  <span className="text-sm italic text-parchment/45">{patience}</span>
                </>
              ) : !hasContent ? (
                <>
                  <button
                    onClick={() => void startRecording()}
                    className="inline-flex items-center gap-2 rounded-full bg-canopy px-6 py-3 font-semibold text-white transition hover:bg-canopy-light"
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-white" />
                    {canRecordAudio ? "Record answer" : "Start"}
                  </button>
                  {noteMode ? (
                    <button
                      onClick={() => {
                        hardStopRecording();
                        stopSpeaking();
                        router.push("/forest");
                      }}
                      className="rounded-full px-4 py-3 text-sm text-parchment/50 transition hover:text-parchment"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={() => goToQuestion(qi + 1)}
                      className="rounded-full px-4 py-3 text-sm text-parchment/50 transition hover:text-parchment"
                    >
                      Skip this one
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={saveAnswer}
                    disabled={phase === "saving"}
                    className="rounded-full bg-fruit px-6 py-3 font-semibold text-[#3a2600] transition hover:brightness-110 disabled:opacity-60"
                  >
                    {phase === "saving" ? "Growing…" : noteMode ? "Save note" : "Save & continue"}
                  </button>
                  <button
                    onClick={askFollowUp}
                    disabled={phase === "saving"}
                    className="rounded-full border border-parchment/25 px-5 py-3 text-sm text-parchment/80 transition hover:border-parchment/60 hover:text-parchment disabled:opacity-60"
                  >
                    Tell me more
                  </button>
                  <button
                    onClick={startOver}
                    disabled={phase === "saving"}
                    className="rounded-full px-3 py-3 text-sm text-parchment/45 transition hover:text-parchment"
                  >
                    Start over
                  </button>
                  {!noteMode ? (
                    <button
                      onClick={() => goToQuestion(qi + 1)}
                      disabled={phase === "saving"}
                      className="rounded-full px-3 py-3 text-sm text-parchment/45 transition hover:text-parchment"
                    >
                      Skip
                    </button>
                  ) : null}
                </>
              )}
            </div>

            {canRecordAudio && (phase === "recording" || (phase === "review" && hasRecorded)) ? (
              <p
                className={`mt-4 text-xs ${
                  capturedKb > 0 ? "text-parchment/45" : "text-amber-300/80"
                }`}
              >
                {capturedKb > 0
                  ? `Voice captured: ${capturedKb} KB${phase === "recording" ? " and counting…" : ""}`
                  : phase === "recording"
                    ? "Waiting for audio from your mic… if this stays at 0 KB, your device isn't sending audio."
                    : "No audio was captured this time — try recording again, or type your answer."}
              </p>
            ) : null}

            {!liveTranscribe ? (
              <p className="mt-6 text-xs text-parchment/40">
                {canRecordAudio
                  ? "Your voice is being recorded and saved. Live word-by-word text isn't shown on this device, but you can type notes above anytime."
                  : "Live voice-to-text isn't supported in this browser, so type your answer above. For the full experience, try Chrome."}
              </p>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

function IntroCard({
  displayName,
  canRecognize,
  canRecordAudio,
  onBegin,
}: {
  displayName: string;
  canRecognize: boolean;
  canRecordAudio: boolean;
  onBegin: () => void;
}) {
  return (
    <div className="text-center">
      <p className="mb-3 text-sm uppercase tracking-[0.3em] text-canopy-light">Your life interview</p>
      <h1 className="mb-5 font-serif text-4xl leading-tight text-parchment md:text-5xl">
        Let's tell your story, {displayName}.
      </h1>
      <p className="mx-auto mb-8 max-w-xl text-lg text-parchment/75">
        I'll ask about your life one question at a time, and then I'll just listen. Say as much or as
        little as you like — I'll write down what you say, and now and then I'll ask you to tell me a
        little more. There's no rush, and nothing you have to answer. Whenever you're ready, we'll
        begin.
      </p>
      <button
        onClick={onBegin}
        className="rounded-full bg-canopy px-10 py-3.5 text-lg font-semibold text-white transition hover:bg-canopy-light"
      >
        I'm ready
      </button>
      {!canRecordAudio && !canRecognize ? (
        <p className="mt-6 text-xs text-parchment/40">
          This browser can't record voice — you'll be able to type your answers instead.
        </p>
      ) : null}
    </div>
  );
}

function DoneCard({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="text-center">
      <p className="mb-3 text-sm uppercase tracking-[0.3em] text-canopy-light">For the ones who come after</p>
      <h1 className="mb-5 font-serif text-4xl leading-tight text-parchment md:text-5xl">
        We can stop here for now.
      </h1>
      <p className="mx-auto mb-8 max-w-xl text-lg text-parchment/75">
        Everything you told me is part of your forest now — each memory grew something real: a leaf,
        a flower, a root, a piece of fruit. Come back whenever you'd like to tell more. A story like
        yours is never really finished.
      </p>
      <button
        onClick={onEnter}
        className="rounded-full bg-fruit px-10 py-3.5 text-lg font-semibold text-[#3a2600] transition hover:brightness-110"
      >
        Walk my forest
      </button>
    </div>
  );
}

function SpeakerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}
