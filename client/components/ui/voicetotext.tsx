import React, { useCallback, useEffect, useRef, useState } from "react";

/* ============================================================
   VOICE INPUT PRIMITIVES
   One shared SpeechRecognition hook powers both the multi-line
   VoiceToText box and the single-line VoiceInput used by the
   clinical detail rows (Command(s), Clinical notes).
============================================================ */

interface UseSpeechRecognitionParams {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const getSpeechRecognition = () =>
  typeof window === "undefined"
    ? null
    : (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

export function useSpeechRecognition({
  value,
  onChange,
  disabled = false,
}: UseSpeechRecognitionParams) {
  const [isListening, setIsListening] = useState(false);

  const recognitionRef = useRef<any>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);

  /* Keep the latest value / callback available to speech recognition,
     which captures them when it starts. */
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;

    if (recognition) {
      try {
        recognition.onend = null;
        recognition.onerror = null;
        recognition.onresult = null;
        recognition.stop();
      } catch (error) {
        console.error("Unable to stop speech recognition:", error);
      }
    }

    setIsListening(false);
  }, []);

  /* Never leave the microphone running if the field unmounts mid-listen. */
  useEffect(() => {
    return () => {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;

      if (recognition) {
        try {
          recognition.onend = null;
          recognition.onerror = null;
          recognition.onresult = null;
          recognition.stop();
        } catch {
          // Ignore teardown errors.
        }
      }
    };
  }, []);

  /* Disabling a field while it listens (e.g. saving) stops it too. */
  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);

  const start = useCallback(() => {
    if (disabled || recognitionRef.current) return;

    const SpeechRecognition = getSpeechRecognition();

    if (!SpeechRecognition) {
      alert(
        "Voice input is not supported in this browser. Please use Google Chrome or Microsoft Edge.",
      );
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-IN";

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let transcript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }

      const spokenText = transcript.trim();

      if (!spokenText) return;

      const currentValue = valueRef.current.trim();

      const nextValue = currentValue
        ? `${currentValue} ${spokenText}`
        : spokenText;

      valueRef.current = nextValue;

      onChangeRef.current(nextValue);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (error) {
      console.error("Unable to start speech recognition:", error);
      setIsListening(false);
      recognitionRef.current = null;
    }
  }, [disabled]);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  return { isListening, start, stop, toggle };
}

const MicrophoneIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="8" y1="22" x2="16" y2="22" />
  </svg>
);

const StopIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <rect x="7" y="7" width="10" height="10" rx="1.5" />
  </svg>
);

const voiceButtonClass = (isListening: boolean) =>
  `flex items-center justify-center rounded-full transition-colors duration-200 ${
    isListening ? "text-red-500 hover:bg-red-50" : "text-blue-500 hover:bg-blue-50"
  }`;

/* ============================================================
   VOICE-TO-TEXT TEXTAREA (existing behaviour, shared hook)
============================================================ */

interface VoiceToTextProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /* Visible textarea height in lines. */
  rows?: number;
  disabled?: boolean;
}

const VoiceToText: React.FC<VoiceToTextProps> = ({
  value,
  onChange,
  placeholder = "Speak your reason for visit...",
  rows = 4,
  disabled = false,
}) => {
  const { isListening, toggle } = useSpeechRecognition({
    value,
    onChange,
    disabled,
  });

  const handleTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
  };

  return (
    <div className="w-full">
      {/* Textarea Container */}
      <div className="relative w-full">
        <textarea
          value={value}
          onChange={handleTextChange}
          rows={rows}
          disabled={disabled}
          placeholder={
            isListening ? "Listening... Please speak..." : placeholder
          }
          className={`w-full rounded-xl border bg-white
            px-4 py-3 pr-14 text-sm
            outline-none resize-none
            transition-all duration-200
            ${
              isListening
                ? "border-red-300 ring-2 ring-red-100"
                : "border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            }
            disabled:cursor-not-allowed disabled:bg-slate-50`}
        />

        {/* Microphone Only */}
        <button
          type="button"
          onClick={toggle}
          disabled={disabled}
          title={isListening ? "Stop voice input" : "Voice input"}
          aria-label={isListening ? "Stop voice input" : "Voice input"}
          className={`absolute right-3 top-3 h-8 w-8 ${voiceButtonClass(
            isListening,
          )} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {isListening ? (
            <StopIcon className="h-5 w-5" />
          ) : (
            <MicrophoneIcon className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Listening Status */}
      {isListening && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-red-600">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          Voice input is active. Speak clearly.
        </div>
      )}
    </div>
  );
};

/* ============================================================
   SINGLE-LINE VOICE INPUT
   Same look as the compact clinical-detail inputs, with an inline
   microphone button. Used for Command(s) and symptom notes.
============================================================ */

interface VoiceInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /* Classes for the wrapper (defaults to full width). */
  className?: string;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({
  value,
  onChange,
  placeholder = "Type...",
  disabled = false,
  className = "",
}) => {
  const { isListening, toggle } = useSpeechRecognition({
    value,
    onChange,
    disabled,
  });

  return (
    <div className={`relative min-w-0 ${className || "w-full"}`}>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={isListening ? "Listening..." : placeholder}
        className={`h-7 w-full rounded-md border bg-white pl-2 pr-8 text-xs leading-4 text-slate-600 outline-none transition-colors disabled:cursor-not-allowed disabled:bg-slate-50 ${
          isListening
            ? "border-red-300 ring-1 ring-red-100"
            : "border-slate-200 focus:border-blue-400"
        }`}
      />

      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        title={isListening ? "Stop voice input" : "Voice input"}
        aria-label={isListening ? "Stop voice input" : "Voice input"}
        className={`absolute right-1 top-1/2 h-5 w-5 -translate-y-1/2 ${voiceButtonClass(
          isListening,
        )} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        {isListening ? (
          <StopIcon className="h-3.5 w-3.5" />
        ) : (
          <MicrophoneIcon className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
};

export default VoiceToText;
