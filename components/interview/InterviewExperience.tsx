"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ALL_QUESTIONS,
  chapterForQuestion,
  type InterviewQuestion,
} from "@/lib/interview/script";

type Phase = "intro" | "idle" | "recording" | "review" | "saving" | "done";

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

export default function InterviewExperience({ displayName }: { displayName: string }) {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("intro");
  const [qi, setQi] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  // Capability flags (resolved on the client).
  const [canRecognize, setCanRecognize] = useState(false);
  const [canRecordAudio, setCanRecordAudio] = useState(false);

  // Recording machinery.
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);
  const committedRef = useRef("");
  const finalRef = useRef("");
  const startedAtRef = useRef(0);
  const durationRef = useRef(0);
  const wantRecognitionRef = useRef(false);

  const question: InterviewQuestion | undefined = ALL_QUESTIONS[qi];
  const chapter = question ? chapterForQuestion(question.id) : undefined;

  useEffect(() => {
    setCanRecognize(
      typeof window !== "undefined" &&
        !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    );
    setCanRecordAudio(
      typeof window !== "undefined" &&
        typeof MediaRecorder !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia,
    );
  }, []);

  // --- interviewer voice ---------------------------------------------------
  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.96;
      u.pitch = 1;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    } catch {
      /* speech synthesis unavailable — question is on screen anyway */
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    setSpeaking(false);
  }, []);

  // --- recording -----------------------------------------------------------
  const teardownStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

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
      // Chrome ends recognition on silence — keep it alive while recording.
      if (wantRecognitionRef.current) {
        try {
          rec.start();
        } catch {
          /* already starting */
        }
      }
    };
    rec.onerror = () => {
      /* ignore transient errors; audio + manual editing still work */
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
    recognitionRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    stopSpeaking();
    committedRef.current = transcript ? transcript.trimEnd() + " " : "";
    finalRef.current = "";

    // Audio capture (optional — recognition can run without it).
    if (canRecordAudio) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        chunksRef.current = [];
        const mimeType = pickMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunksRef.current.push(ev.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          audioBlobRef.current = blob;
          setAudioUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
          teardownStream();
        };
        recorderRef.current = recorder;
        recorder.start();
      } catch {
        setError("I couldn't reach your microphone. You can still type your answer below.");
      }
    }

    if (canRecognize) startRecognition();

    startedAtRef.current = Date.now();
    setPhase("recording");
  }, [transcript, canRecordAudio, canRecognize, startRecognition, stopSpeaking, teardownStream]);

  const stopRecording = useCallback(() => {
    durationRef.current = Date.now() - startedAtRef.current;
    stopRecognition();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    } else {
      teardownStream();
    }
    setPhase("review");
  }, [stopRecognition, teardownStream]);

  const resetAnswer = useCallback(() => {
    audioBlobRef.current = null;
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setTranscript("");
    finalRef.current = "";
    committedRef.current = "";
  }, []);

  // --- navigation ----------------------------------------------------------
  const goToQuestion = useCallback(
    (index: number) => {
      resetAnswer();
      setError(null);
      if (index >= ALL_QUESTIONS.length) {
        stopSpeaking();
        setPhase("done");
        return;
      }
      setQi(index);
      setPhase("idle");
      const q = ALL_QUESTIONS[index];
      if (q) setTimeout(() => speak(q.prompt), 350);
    },
    [resetAnswer, speak, stopSpeaking],
  );

  const beginInterview = useCallback(() => {
    // First user gesture — unlocks speech synthesis.
    setPhase("idle");
    const q = ALL_QUESTIONS[0];
    if (q) setTimeout(() => speak(q.prompt), 300);
  }, [speak]);

  const saveAnswer = useCallback(async () => {
    if (!question) return;
    const text = transcript.trim();
    if (!text && !audioBlobRef.current) {
      setError("Record or type something first, or skip this question.");
      return;
    }
    setPhase("saving");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("questionId", question.id);
      fd.append("transcript", text);
      fd.append("durationMs", String(durationRef.current || 0));
      if (audioBlobRef.current) {
        const ext = (audioBlobRef.current.type.split("/")[1] || "webm").split(";")[0];
        fd.append("audio", audioBlobRef.current, `answer.${ext}`);
      }
      const res = await fetch("/api/interview/answer", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong saving that.");
      }
      goToQuestion(qi + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong saving that.");
      setPhase("review");
    }
  }, [question, transcript, qi, goToQuestion]);

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
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progress = Math.round((qi / ALL_QUESTIONS.length) * 100);

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-[#0b1410] via-[#0a1a12] to-[#05090a] px-6 py-10 font-sans text-parchment">
      {/* Exit */}
      <button
        onClick={() => {
          stopSpeaking();
          router.push("/forest");
        }}
        className="absolute right-6 top-6 rounded-full border border-parchment/20 bg-black/30 px-4 py-1.5 text-sm text-parchment/70 transition hover:border-parchment/50 hover:text-parchment"
      >
        {phase === "done" ? "To my forest ›" : "Save & exit ›"}
      </button>

      <div className="mx-auto flex min-h-[80vh] max-w-2xl flex-col justify-center">
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
            {/* Progress */}
            <div className="mb-8">
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
            </div>

            {/* Question */}
            <div className="mb-6">
              <div className="flex items-start gap-3">
                <button
                  onClick={() => question && speak(question.prompt)}
                  title="Hear the question"
                  className={`mt-1 shrink-0 rounded-full border px-2.5 py-2 transition ${
                    speaking
                      ? "border-fruit/60 text-fruit"
                      : "border-parchment/25 text-parchment/60 hover:border-parchment/60 hover:text-parchment"
                  }`}
                  aria-label="Hear the question"
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

            {/* Answer surface */}
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder={
                phase === "recording"
                  ? "Listening… speak naturally."
                  : canRecognize
                    ? "Press record and speak — your words appear here. You can edit anytime."
                    : "Type your answer here."
              }
              rows={6}
              className="w-full resize-none rounded-2xl border border-parchment/15 bg-black/30 p-4 text-base leading-relaxed text-parchment outline-none transition focus:border-canopy-light"
            />

            {audioUrl ? (
              <audio src={audioUrl} controls className="mt-3 w-full" />
            ) : null}

            {error ? (
              <p className="mt-3 rounded-lg bg-red-900/40 px-4 py-2 text-sm text-red-200">{error}</p>
            ) : null}

            {/* Controls */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {phase === "recording" ? (
                <button
                  onClick={stopRecording}
                  className="inline-flex items-center gap-2 rounded-full bg-red-600 px-6 py-3 font-semibold text-white transition hover:bg-red-500"
                >
                  <span className="h-2.5 w-2.5 animate-pulse rounded-sm bg-white" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  className="inline-flex items-center gap-2 rounded-full bg-canopy px-6 py-3 font-semibold text-white transition hover:bg-canopy-light"
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-white" />
                  {transcript || audioUrl ? "Record again" : canRecordAudio ? "Record answer" : "Start"}
                </button>
              )}

              {phase !== "recording" ? (
                <>
                  <button
                    onClick={saveAnswer}
                    disabled={phase === "saving"}
                    className="rounded-full bg-fruit px-6 py-3 font-semibold text-[#3a2600] transition hover:brightness-110 disabled:opacity-60"
                  >
                    {phase === "saving" ? "Growing…" : "Save & continue"}
                  </button>
                  <button
                    onClick={() => goToQuestion(qi + 1)}
                    className="rounded-full px-4 py-3 text-sm text-parchment/50 transition hover:text-parchment"
                  >
                    Skip
                  </button>
                </>
              ) : null}
            </div>

            {!canRecognize ? (
              <p className="mt-6 text-xs text-parchment/40">
                Live voice-to-text isn't supported in this browser, so type your answer above.
                {canRecordAudio ? " Your voice is still being recorded." : ""} For the full
                experience, try Chrome or Safari.
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
        I'll ask you about your life, one gentle question at a time. Just speak your answer aloud —
        I'll listen and write it down. Every story you tell grows your forest. There are no wrong
        answers, and you can skip anything or stop whenever you like.
      </p>
      <button
        onClick={onBegin}
        className="rounded-full bg-canopy px-10 py-3.5 text-lg font-semibold text-white transition hover:bg-canopy-light"
      >
        Begin
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
      <p className="mb-3 text-sm uppercase tracking-[0.3em] text-canopy-light">Thank you</p>
      <h1 className="mb-5 font-serif text-4xl leading-tight text-parchment md:text-5xl">
        Your forest has grown.
      </h1>
      <p className="mx-auto mb-8 max-w-xl text-lg text-parchment/75">
        Every answer you gave is now part of your living legacy — a leaf, a flower, a root, a piece
        of fruit. Come back anytime to tell more. Your story is never finished.
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
