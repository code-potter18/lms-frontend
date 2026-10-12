import React, { useRef, useState, useEffect } from "react";

interface VoiceToTextProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /* Visible textarea height in lines. */
  rows?: number;
}

const VoiceToText: React.FC<VoiceToTextProps> = ({
  value,
  onChange,
  placeholder = "Speak your reason for visit...",
  rows = 4,
}) => {
  const [isListening, setIsListening] = useState(false);

  const recognitionRef = useRef<any>(null);
  const valueRef = useRef(value);

  // Keep the latest value available to speech recognition
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const startVoiceRecognition = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert(
        "Voice input is not supported in this browser. Please use Google Chrome or Microsoft Edge."
      );
      return;
    }

    if (recognitionRef.current) {
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

      onChange(nextValue);
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
  };

  const stopVoiceRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    setIsListening(false);
  };

  const handleTextChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const newValue = e.target.value;

    valueRef.current = newValue;

    onChange(newValue);
  };

  return (
  <div className="w-full">
    {/* Textarea Container */}
    <div className="relative w-full">
      <textarea
        value={value}
        onChange={handleTextChange}
        rows={rows}
        placeholder={
          isListening
            ? "Listening... Please speak..."
            : placeholder
        }
        className={`w-full rounded-xl border bg-white
          px-4 py-3 pr-14 text-sm
          outline-none resize-none
          transition-all duration-200
          ${
            isListening
              ? "border-red-300 ring-2 ring-red-100"
              : "border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          }`}
      />

      {/* Microphone Only */}
      <button
        type="button"
        onClick={
          isListening
            ? stopVoiceRecognition
            : startVoiceRecognition
        }
        title={isListening ? "Stop voice input" : "Voice input"}
        aria-label={
          isListening ? "Stop voice input" : "Voice input"
        }
        className={`absolute right-3 top-3
          flex items-center justify-center
          w-8 h-8
          rounded-full
          transition-colors duration-200
          ${
            isListening
              ? "text-red-500 hover:bg-red-50"
              : "text-blue-500 hover:bg-blue-50"
          }`}
      >
        {isListening ? (
          /* Stop icon */
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-5 h-5"
          >
            <rect
              x="7"
              y="7"
              width="10"
              height="10"
              rx="1.5"
            />
          </svg>
        ) : (
          /* Microphone icon */
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="8" y1="22" x2="16" y2="22" />
          </svg>
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
export default VoiceToText;