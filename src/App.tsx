import { useCallback, useEffect, useId, useRef, useState } from "react";
import { stories } from "./data/stories";
import type { Motif, Story } from "./data/storyTypes";

// Fungsi split yang lebih baik untuk teks panjang
function splitNarrationText(text: string, maxChars = 180) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [] as string[];
  }

  // Split berdasarkan kalimat terlebih dahulu
  const sentences = normalized.match(/[^.!?]+[.!?]+/g) ?? [normalized];
  const chunks: string[] = [];
  let currentChunk = "";

  const pushChunk = () => {
    const trimmed = currentChunk.trim();
    if (trimmed) {
      chunks.push(trimmed);
      currentChunk = "";
    }
  };

  for (const sentence of sentences) {
    const cleanSentence = sentence.trim();
    if (!cleanSentence) {
      continue;
    }

    // Jika kalimat tunggal terlalu panjang, pecah berdasarkan koma atau spasi
    if (cleanSentence.length > maxChars) {
      pushChunk();
      
      // Coba pecah berdasarkan koma
      const subParts = cleanSentence.split(/,\s*/);
      let subChunk = "";
      
      for (const part of subParts) {
        if (part.length > maxChars) {
          // Pecah berdasarkan kata
          if (subChunk) {
            chunks.push(subChunk.trim());
            subChunk = "";
          }
          
          const words = part.split(" ");
          let wordChunk = "";
          
          for (const word of words) {
            const candidate = wordChunk ? `${wordChunk} ${word}` : word;
            if (candidate.length > maxChars) {
              if (wordChunk) {
                chunks.push(wordChunk.trim());
              }
              wordChunk = word;
            } else {
              wordChunk = candidate;
            }
          }
          
          if (wordChunk.trim()) {
            subChunk = wordChunk;
          }
        } else {
          const candidate = subChunk ? `${subChunk}, ${part}` : part;
          if (candidate.length > maxChars) {
            if (subChunk) {
              chunks.push(subChunk.trim());
            }
            subChunk = part;
          } else {
            subChunk = candidate;
          }
        }
      }
      
      if (subChunk.trim()) {
        currentChunk = subChunk;
      }
      continue;
    }

    const nextChunk = currentChunk ? `${currentChunk} ${cleanSentence}` : cleanSentence;
    if (nextChunk.length > maxChars) {
      pushChunk();
      currentChunk = cleanSentence;
    } else {
      currentChunk = nextChunk;
    }
  }

  pushChunk();
  return chunks;
}

const coverScene: Pick<Story, "motif" | "palette" | "image"> = {
  motif: "book",
  palette: ["#513529", "#d4a75f", "#f7e8c7"],
  image: "/images/nabi/cover.jpg",
};

// Custom hook untuk TTS yang lebih robust
function useSpeechSynthesis() {
  const [ttsState, setTtsState] = useState<"idle" | "playing" | "paused">("idle");
  const [activeStorySlug, setActiveStorySlug] = useState<string | null>(null);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  
  const chunksRef = useRef<string[]>([]);
  const currentIndexRef = useRef(0);
  const isStoppingRef = useRef(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const keepAliveRef = useRef<NodeJS.Timeout | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  const speechSupported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window;

  // Load voices
  useEffect(() => {
    if (!speechSupported) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      // Prioritas: id-ID, kemudian bahasa Indonesia lainnya
      voiceRef.current = 
        voices.find((v) => v.lang === "id-ID") ??
        voices.find((v) => v.lang.startsWith("id")) ??
        voices.find((v) => v.lang.startsWith("en")) ??
        voices[0] ?? 
        null;
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [speechSupported]);

  // Chrome bug workaround: Keep-alive interval
  useEffect(() => {
    if (!speechSupported || ttsState !== "playing") {
      if (keepAliveRef.current) {
        clearInterval(keepAliveRef.current);
        keepAliveRef.current = null;
      }
      return;
    }

    // Chrome akan menghentikan speech setelah ~15 detik
    // Workaround: pause dan resume secara berkala
    keepAliveRef.current = setInterval(() => {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 5000); // Setiap 5 detik

    return () => {
      if (keepAliveRef.current) {
        clearInterval(keepAliveRef.current);
        keepAliveRef.current = null;
      }
    };
  }, [speechSupported, ttsState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (speechSupported) {
        isStoppingRef.current = true;
        window.speechSynthesis.cancel();
        if (keepAliveRef.current) {
          clearInterval(keepAliveRef.current);
        }
      }
    };
  }, [speechSupported]);

  const speakChunk = useCallback((index: number) => {
    if (!speechSupported || isStoppingRef.current) return;
    
    const chunks = chunksRef.current;
    if (index >= chunks.length) {
      // Selesai semua chunks
      setTtsState("idle");
      setActiveStorySlug(null);
      setCurrentChunkIndex(0);
      chunksRef.current = [];
      currentIndexRef.current = 0;
      return;
    }

    const chunk = chunks[index];
    const utterance = new SpeechSynthesisUtterance(chunk);
    
    utterance.lang = "id-ID";
    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.volume = 1;
    
    if (voiceRef.current) {
      utterance.voice = voiceRef.current;
    }

    utterance.onstart = () => {
      if (isStoppingRef.current) return;
      setCurrentChunkIndex(index + 1);
    };

    utterance.onend = () => {
      if (isStoppingRef.current) return;
      currentIndexRef.current = index + 1;
      // Delay kecil sebelum chunk berikutnya untuk stabilitas
      setTimeout(() => {
        if (!isStoppingRef.current) {
          speakChunk(index + 1);
        }
      }, 100);
    };

    utterance.onerror = (event) => {
      console.error("Speech error:", event.error);
      
      // Jika error bukan karena interrupted, coba lanjutkan
      if (event.error !== "interrupted" && !isStoppingRef.current) {
        setTimeout(() => {
          if (!isStoppingRef.current) {
            speakChunk(index + 1);
          }
        }, 200);
      } else if (event.error === "interrupted" && !isStoppingRef.current) {
        // Interrupted tapi bukan karena stop manual
        setTtsState("idle");
        setActiveStorySlug(null);
      }
    };

    utteranceRef.current = utterance;
    
    // Cancel any pending speech before speaking new chunk
    window.speechSynthesis.cancel();
    
    // Small delay to ensure cancel is processed
    setTimeout(() => {
      if (!isStoppingRef.current) {
        window.speechSynthesis.speak(utterance);
      }
    }, 50);
  }, [speechSupported]);

  const startNarration = useCallback((story: Story) => {
    if (!speechSupported) return;

    // Stop any current narration
    isStoppingRef.current = true;
    window.speechSynthesis.cancel();
    
    // Reset state
    setTimeout(() => {
      isStoppingRef.current = false;

      const text = `${story.name}. ${story.subtitle}. ${story.paragraphs.join(" ")} Pelajaran utama: ${story.lesson}`;
      const chunks = splitNarrationText(text);
      
      if (!chunks.length) return;

      chunksRef.current = chunks;
      currentIndexRef.current = 0;
      setTotalChunks(chunks.length);
      setCurrentChunkIndex(0);
      setActiveStorySlug(story.slug);
      setTtsState("playing");

      speakChunk(0);
    }, 100);
  }, [speechSupported, speakChunk]);

  const stopNarration = useCallback(() => {
    if (!speechSupported) return;

    isStoppingRef.current = true;
    window.speechSynthesis.cancel();
    
    chunksRef.current = [];
    currentIndexRef.current = 0;
    utteranceRef.current = null;
    
    setTtsState("idle");
    setActiveStorySlug(null);
    setCurrentChunkIndex(0);
    setTotalChunks(0);

    // Reset flag setelah delay
    setTimeout(() => {
      isStoppingRef.current = false;
    }, 100);
  }, [speechSupported]);

  const pauseNarration = useCallback(() => {
    if (!speechSupported) return;
    if (!window.speechSynthesis.speaking || window.speechSynthesis.paused) return;

    window.speechSynthesis.pause();
    setTtsState("paused");
  }, [speechSupported]);

  const resumeNarration = useCallback(() => {
    if (!speechSupported) return;
    
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setTtsState("playing");
    } else if (ttsState === "paused" && chunksRef.current.length > 0) {
      // Jika speech sudah di-cancel tapi masih dalam state paused, restart dari chunk terakhir
      setTtsState("playing");
      speakChunk(currentIndexRef.current);
    }
  }, [speechSupported, ttsState, speakChunk]);

  return {
    speechSupported,
    ttsState,
    activeStorySlug,
    currentChunkIndex,
    totalChunks,
    startNarration,
    stopNarration,
    pauseNarration,
    resumeNarration,
  };
}

export default function App() {
  const {
    speechSupported,
    ttsState,
    activeStorySlug,
    currentChunkIndex,
    totalChunks,
    startNarration,
    stopNarration,
    pauseNarration,
    resumeNarration,
  } = useSpeechSynthesis();

  return (
    <div className="overflow-x-hidden">
      <header className="relative isolate min-h-screen overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.92),_transparent_34%),radial-gradient(circle_at_80%_20%,rgba(246,221,173,0.8),transparent_28%),linear-gradient(180deg,#f8f1e4_0%,#f3e4cc_52%,#e9d6b8_100%)]" />
        <div className="absolute inset-0 opacity-60">
          <div className="animate-drift absolute left-[-8%] top-12 h-72 w-72 rounded-full bg-amber-200/30 blur-3xl" />
          <div className="animate-breathe absolute right-[-6%] top-32 h-80 w-80 rounded-full bg-orange-200/25 blur-3xl" />
          <div className="animate-sheen absolute bottom-[-12%] left-1/3 h-96 w-96 rounded-full bg-[#f0d7ab]/30 blur-3xl" />
        </div>

        <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6 lg:px-10">
          <div className="flex items-center justify-between gap-4 border-b border-[#9f7b4d]/20 pb-5 text-sm text-[#6f5a45]">
            <p className="font-medium uppercase tracking-[0.28em]">Kisah 25 Nabi</p>
            <a
              href="#bab"
              className="rounded-full border border-[#9f7b4d]/25 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#5f4a36] transition hover:border-[#8d6c43] hover:text-[#3e2d1d]"
            >
              Mulai membaca
            </a>
          </div>

          <div className="flex flex-1 flex-col justify-center gap-12 py-10 lg:flex-row lg:items-center lg:gap-16 lg:py-12">
            <div className="max-w-3xl flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.42em] text-[#8a6a45]">
                Buku kisah lengkap dalam satu halaman
              </p>
              <h1 className="mt-5 font-serif text-5xl font-semibold leading-[0.95] tracking-tight text-[#2f2318] sm:text-6xl lg:text-8xl">
                25 Nabi
                <span className="mt-2 block text-3xl font-medium text-[#6d5742] sm:text-4xl lg:text-5xl">
                  dari Adam sampai Muhammad SAW
                </span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-[#5e4d3c] sm:text-lg">
                Versi panjang, utuh, dan nyaman dibaca seperti buku, dengan ilustrasi simbolik
                untuk setiap nabi. Setiap bab disusun sebagai cerita yang mengalir agar pembaca
                bisa mengikuti perjalanan, ujian, dan pelajaran dari awal hingga akhir.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#bab"
                  className="rounded-full bg-[#3c2a1e] px-6 py-3 text-sm font-semibold text-[#f8f1e4] transition hover:bg-[#241810]"
                >
                  Baca dari awal
                </a>
                <a
                  href="#daftar-bab"
                  className="rounded-full border border-[#8c6c44]/30 px-6 py-3 text-sm font-semibold text-[#4f3d2c] transition hover:border-[#7d5f3a] hover:text-[#2f2318]"
                >
                  Lihat daftar bab
                </a>
              </div>
              <p className="mt-8 max-w-xl text-sm leading-7 text-[#73604c]">
                Catatan: foto dapat ditambahkan per nabi lewat file masing-masing. Jika foto belum
                ada, sistem akan menampilkan ilustrasi simbolik otomatis.
              </p>
            </div>

            <div className="w-full max-w-xl flex-shrink-0 lg:w-[44rem]">
              <div className="animate-float">
                <StoryVisual scene={coverScene} label="Pembuka kisah" hero />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main id="bab" className="mx-auto max-w-7xl px-6 pb-24 pt-10 lg:px-10">
        <section id="daftar-bab" className="border-t border-[#ccb48b]/60 pt-10">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.42em] text-[#8a6a45]">
                Daftar bab
              </p>
              <h2 className="mt-4 font-serif text-3xl font-semibold tracking-tight text-[#2f2318] sm:text-4xl">
                Susunan perjalanan para nabi
              </h2>
              <p className="mt-4 text-base leading-8 text-[#5e4d3c]">
                Klik nama nabi untuk langsung melompat ke bab yang kamu ingin baca. Urutannya
                mengikuti kisah 25 nabi yang dikenal luas dalam tradisi Islam.
              </p>
            </div>

            <nav className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
              {stories.map((story) => (
                <a
                  key={story.slug}
                  href={`#${story.slug}`}
                  className="group border-b border-[#d6c2a4]/70 pb-2 text-[#4f3e2e] transition hover:border-[#8f6d44] hover:text-[#261a11]"
                >
                  <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.34em] text-[#8f6d44]">
                    Bab {String(story.number).padStart(2, "0")}
                  </span>
                  <span className="mt-1 block font-medium">{story.name}</span>
                </a>
              ))}
            </nav>
          </div>
        </section>

        <div className="mt-12">
          {stories.map((story, index) => (
            <ChapterSection
              key={story.slug}
              story={story}
              reverse={index % 2 === 1}
              speechSupported={speechSupported}
              isActive={activeStorySlug === story.slug}
              ttsState={ttsState}
              currentChunkIndex={currentChunkIndex}
              totalChunks={totalChunks}
              onStartNarration={() => startNarration(story)}
              onPauseNarration={pauseNarration}
              onResumeNarration={resumeNarration}
              onStopNarration={stopNarration}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function ChapterSection({
  story,
  reverse,
  speechSupported,
  isActive,
  ttsState,
  currentChunkIndex,
  totalChunks,
  onStartNarration,
  onPauseNarration,
  onResumeNarration,
  onStopNarration,
}: {
  story: Story;
  reverse: boolean;
  speechSupported: boolean;
  isActive: boolean;
  ttsState: "idle" | "playing" | "paused";
  currentChunkIndex: number;
  totalChunks: number;
  onStartNarration: () => void;
  onPauseNarration: () => void;
  onResumeNarration: () => void;
  onStopNarration: () => void;
}) {
  const progress = totalChunks > 0 ? Math.round((currentChunkIndex / totalChunks) * 100) : 0;

  return (
    <section id={story.slug} className="scroll-mt-24 border-t border-[#ccb48b]/55 py-12 lg:py-14">
      <div
        className={`flex flex-col gap-8 lg:items-start ${reverse ? "lg:flex-row-reverse" : "lg:flex-row"}`}
      >
        <div className="flex-1">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.42em] text-[#8a6a45]">
              Bab {String(story.number).padStart(2, "0")}
            </p>
            <h3 className="mt-4 font-serif text-4xl font-semibold tracking-tight text-[#2f2318] sm:text-5xl">
              {story.name}
            </h3>
            <p className="mt-4 text-lg leading-8 text-[#6a5743]">{story.subtitle}</p>

            <div className="mt-5 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                {!isActive && (
                  <button
                    type="button"
                    onClick={onStartNarration}
                    disabled={!speechSupported}
                    className="inline-flex items-center gap-2 rounded-full bg-[#3f2e21] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.22em] text-[#f8f1e4] transition hover:bg-[#281a11] disabled:cursor-not-allowed disabled:bg-[#9a876f]"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Dengarkan kisah
                  </button>
                )}

                {isActive && ttsState === "playing" && (
                  <button
                    type="button"
                    onClick={onPauseNarration}
                    className="inline-flex items-center gap-2 rounded-full border border-[#8c6c44]/35 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.22em] text-[#3e2d1d] transition hover:border-[#7d5f3a]"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                    Jeda
                  </button>
                )}

                {isActive && ttsState === "paused" && (
                  <button
                    type="button"
                    onClick={onResumeNarration}
                    className="inline-flex items-center gap-2 rounded-full border border-[#8c6c44]/35 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.22em] text-[#3e2d1d] transition hover:border-[#7d5f3a]"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Lanjutkan
                  </button>
                )}

                {isActive && ttsState !== "idle" && (
                  <button
                    type="button"
                    onClick={onStopNarration}
                    className="inline-flex items-center gap-2 rounded-full border border-[#8c6c44]/35 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.22em] text-[#3e2d1d] transition hover:border-[#7d5f3a]"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 6h12v12H6z" />
                    </svg>
                    Stop
                  </button>
                )}
              </div>

              {/* Progress bar untuk narasi aktif */}
              {isActive && ttsState !== "idle" && (
                <div className="max-w-md space-y-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#e0d3c0]">
                    <div
                      className="h-full rounded-full bg-[#8a6a45] transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-[#8a6a45]">
                    {ttsState === "playing" ? "Sedang membacakan" : "Dijeda"} — {progress}%
                    {ttsState === "playing" && (
                      <span className="ml-2 inline-flex items-center gap-1">
                        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                        <span className="text-green-700">aktif</span>
                      </span>
                    )}
                  </p>
                </div>
              )}

              <p className="text-xs leading-6 text-[#735f4a]">
                {speechSupported
                  ? isActive && ttsState !== "idle"
                    ? "Audio sedang diputar. Klik Jeda untuk pause, atau Stop untuk berhenti."
                    : "Gunakan tombol audio untuk membacakan kisah secara otomatis."
                  : "Browser ini belum mendukung fitur audio otomatis (Text-to-Speech)."}
              </p>
            </div>

            <div className="mt-7 space-y-5 text-[1.04rem] leading-8 text-[#4f4132]">
              {story.paragraphs.map((paragraph, idx) => (
                <p key={`${story.slug}-p-${idx}`}>{paragraph}</p>
              ))}
            </div>

            <p className="mt-7 border-l-2 border-[#b98a4f] pl-4 text-[1.02rem] italic leading-8 text-[#6f5b42]">
              {story.lesson}
            </p>
          </div>
        </div>

        <div className="w-full lg:w-[420px]">
          <div className="animate-float">
            <StoryVisual scene={story} label={`Ilustrasi simbolik ${story.name}`} />
          </div>
        </div>
      </div>
    </section>
  );
}

function StoryVisual({
  scene,
  label,
  hero = false,
}: {
  scene: Pick<Story, "motif" | "palette" | "image">;
  label: string;
  hero?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(scene.image && !failed);

  return (
    <figure>
      {showImage ? (
        <div className="relative isolate overflow-hidden rounded-[2rem] border border-[#d9bf98] bg-[#1f160f] shadow-[0_26px_70px_rgba(68,42,14,0.16)]">
          <img
            src={scene.image}
            alt={label}
            className={`${hero ? "h-[42rem]" : "h-[28rem]"} w-full object-cover`}
            onError={() => setFailed(true)}
            loading="lazy"
          />
        </div>
      ) : (
        <SceneArt scene={scene} label={label} hero={hero} />
      )}

      <figcaption className="mt-3 text-xs font-semibold uppercase tracking-[0.34em] text-[#8a6a45]">
        {label}
      </figcaption>
    </figure>
  );
}

function SceneArt({
  scene,
  label,
  hero = false,
}: {
  scene: Pick<Story, "motif" | "palette">;
  label: string;
  hero?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const [deep, mid, light] = scene.palette;

  return (
    <div aria-label={label} className="relative isolate overflow-hidden rounded-[2rem] border border-[#d9bf98] bg-[#1f160f] shadow-[0_26px_70px_rgba(68,42,14,0.16)]">
      <svg
        viewBox="0 0 800 1000"
        className={`${hero ? "h-[42rem]" : "h-[28rem]"} w-full`}
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id={`${id}-bg`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={deep} />
            <stop offset="56%" stopColor={mid} />
            <stop offset="100%" stopColor={light} />
          </linearGradient>
          <radialGradient id={`${id}-glow`} cx="50%" cy="42%" r="58%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
            <stop offset="60%" stopColor="#ffffff" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="800" height="1000" fill={`url(#${id}-bg)`} />
        <rect width="800" height="1000" fill={`url(#${id}-glow)`} opacity="0.65" />

        {Array.from({ length: 16 }).map((_, i) => (
          <circle
            key={`${id}-star-${i}`}
            cx={80 + ((i * 97) % 640)}
            cy={70 + ((i * 131) % 320)}
            r={1.6 + (i % 3) * 0.5}
            fill="#fff9ea"
            opacity={0.35 + (i % 4) * 0.1}
          />
        ))}

        <path
          d="M0 730 C140 640 240 640 380 720 C500 790 620 820 800 760 L800 1000 L0 1000 Z"
          fill="rgba(37,26,18,0.28)"
        />
        <path
          d="M0 780 C110 735 210 720 330 760 C445 798 565 835 800 790 L800 1000 L0 1000 Z"
          fill="rgba(255,255,255,0.08)"
        />

        <g transform="translate(400 490)">{drawMotif(scene.motif, deep, mid, light)}</g>
      </svg>

      <div className="animate-sheen pointer-events-none absolute inset-0 bg-[linear-gradient(130deg,rgba(255,255,255,0.18),transparent_20%,transparent_70%,rgba(255,255,255,0.08))]" />
    </div>
  );
}

function drawMotif(motif: Motif, deep: string, mid: string, light: string) {
  switch (motif) {
    case "book":
      return (
        <g>
          <ellipse cx="0" cy="70" rx="140" ry="40" fill="rgba(255,255,255,0.1)" />
          <path
            d="M-180 40 C-110 10 -30 0 0 22 C30 0 110 10 180 40 L180 250 C120 220 45 210 0 230 C-45 210 -120 220 -180 250 Z"
            fill="rgba(255,255,255,0.16)"
          />
          <path
            d="M-170 45 C-105 20 -40 20 -8 40 L-8 235 C-52 215 -110 216 -170 245 Z"
            fill={light}
            opacity="0.9"
          />
          <path
            d="M170 45 C105 20 40 20 8 40 L8 235 C52 215 110 216 170 245 Z"
            fill={light}
            opacity="0.82"
          />
          <path d="M0 30 C18 50 24 95 24 234" stroke={mid} strokeWidth="6" strokeLinecap="round" />
          <circle cx="0" cy="118" r="18" fill={light} opacity="0.95" />
        </g>
      );
    case "garden":
      return (
        <g>
          <rect x="-34" y="40" width="68" height="180" rx="28" fill={deep} opacity="0.82" />
          <circle cx="0" cy="-10" r="122" fill={mid} opacity="0.9" />
          <circle cx="-84" cy="36" r="74" fill={light} opacity="0.55" />
          <circle cx="82" cy="30" r="76" fill={light} opacity="0.55" />
          <circle cx="0" cy="-98" r="58" fill={light} opacity="0.7" />
        </g>
      );
    case "ark":
      return (
        <g>
          <path
            d="M-170 178 C-70 132 70 132 170 178 L132 250 C56 274 -56 274 -132 250 Z"
            fill={deep}
            opacity="0.82"
          />
          <path d="M-130 180 C-52 150 52 150 130 180" fill="none" stroke={light} strokeWidth="6" strokeLinecap="round" />
          <path d="M-30 10 L-12 -128 L0 -132 L12 -128 L30 10" fill={light} opacity="0.85" />
        </g>
      );
    case "storm":
      return (
        <g>
          <circle cx="0" cy="-48" r="70" fill={mid} opacity="0.86" />
          <path d="M-10 58 L-24 138" stroke={light} strokeWidth="6" strokeLinecap="round" />
          <path
            d="M-34 150 L0 88 L16 124 L54 56"
            fill="none"
            stroke={mid}
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      );
    case "desert":
      return (
        <g>
          <path
            d="M-200 246 C-100 202 -22 206 54 234 C108 254 150 260 200 248"
            fill="none"
            stroke={mid}
            strokeWidth="10"
            strokeLinecap="round"
            opacity="0.8"
          />
          <ellipse cx="34" cy="110" rx="18" ry="12" fill={light} opacity="0.85" />
        </g>
      );
    case "fire":
      return (
        <g>
          <path
            d="M-48 224 C-80 164 -74 110 -40 72 C-18 48 -18 18 -28 -18 C8 10 30 38 34 72 C64 106 74 154 52 214 C38 250 -14 252 -48 224 Z"
            fill={light}
            opacity="0.95"
          />
          <path
            d="M-10 250 C-34 212 -32 180 -10 148 C2 130 8 110 4 88 C24 110 42 132 46 156 C60 178 58 214 44 242 C32 264 4 268 -10 250 Z"
            fill={mid}
            opacity="0.9"
          />
        </g>
      );
    case "city":
      return (
        <g>
          <rect x="-148" y="90" width="70" height="150" rx="4" fill={deep} opacity="0.78" />
          <rect x="-60" y="42" width="118" height="198" rx="10" fill={mid} opacity="0.9" />
          <rect x="90" y="82" width="64" height="158" rx="4" fill={deep} opacity="0.78" />
          <circle cx="0" cy="18" r="44" fill={light} opacity="0.84" />
        </g>
      );
    case "palm":
      return (
        <g>
          <path d="M-20 260 C-28 190 -24 122 -2 10" stroke={deep} strokeWidth="18" strokeLinecap="round" />
          <path
            d="M0 4 C-46 -24 -92 -34 -142 -28 C-98 10 -52 24 0 4 Z"
            fill={light}
            opacity="0.85"
          />
          <path d="M0 4 C44 -24 92 -34 142 -28 C98 10 52 24 0 4 Z" fill={light} opacity="0.85" />
        </g>
      );
    case "star":
      return (
        <g>
          <polygon
            points="0,-152 34,-48 142,-48 58,14 90,118 0,54 -90,118 -58,14 -142,-48 -34,-48"
            fill={light}
            opacity="0.9"
          />
        </g>
      );
    case "well":
      return (
        <g>
          <rect x="-92" y="20" width="184" height="160" rx="18" fill={deep} opacity="0.82" />
          <ellipse cx="0" cy="18" rx="98" ry="32" fill={mid} opacity="0.92" />
          <ellipse cx="0" cy="20" rx="66" ry="18" fill={light} opacity="0.84" />
        </g>
      );
    case "palace":
      return (
        <g>
          <rect x="-150" y="86" width="300" height="170" rx="12" fill={deep} opacity="0.78" />
          <path d="M-120 86 C-96 28 -48 -8 0 -8 C48 -8 96 28 120 86" fill={mid} opacity="0.92" />
          <circle cx="0" cy="122" r="26" fill={deep} opacity="0.52" />
        </g>
      );
    case "lamp":
      return (
        <g>
          <circle cx="0" cy="-36" r="98" fill={light} opacity="0.26" />
          <path d="M-72 -116 H72 L54 42 C50 88 20 126 0 142 C-20 126 -50 88 -54 42 Z" fill={deep} opacity="0.9" />
        </g>
      );
    case "market":
      return (
        <g>
          <path d="M0 -138 V92" stroke={light} strokeWidth="10" strokeLinecap="round" />
          <path d="M-124 -58 H124" stroke={light} strokeWidth="10" strokeLinecap="round" />
          <path d="M-154 54 C-126 88 -74 88 -46 54" fill="none" stroke={mid} strokeWidth="8" strokeLinecap="round" />
        </g>
      );
    case "staff":
      return (
        <g>
          <path d="M0 -184 V182" stroke={deep} strokeWidth="18" strokeLinecap="round" />
          <path
            d="M0 -184 C48 -156 84 -112 96 -72 C108 -24 96 14 66 46 C36 76 -4 92 -48 98"
            fill="none"
            stroke={light}
            strokeWidth="10"
            strokeLinecap="round"
          />
        </g>
      );
    case "balance":
      return (
        <g>
          <path d="M0 -170 V120" stroke={deep} strokeWidth="16" strokeLinecap="round" />
          <path d="M-132 -92 H132" stroke={light} strokeWidth="10" strokeLinecap="round" />
        </g>
      );
    case "harp":
      return (
        <g>
          <path d="M-86 -128 C18 -96 54 12 70 164" fill="none" stroke={light} strokeWidth="12" strokeLinecap="round" />
          <path d="M-8 -132 C-26 -42 -24 68 18 164" fill="none" stroke={mid} strokeWidth="10" strokeLinecap="round" />
        </g>
      );
    case "throne":
      return (
        <g>
          <rect x="-118" y="8" width="236" height="136" rx="24" fill={deep} opacity="0.84" />
          <path d="M-108 8 C-72 -80 72 -80 108 8" fill={mid} opacity="0.9" />
        </g>
      );
    case "sprout":
      return (
        <g>
          <path d="M0 154 V-62" stroke={deep} strokeWidth="14" strokeLinecap="round" />
          <circle cx="0" cy="-18" r="30" fill={light} opacity="0.86" />
        </g>
      );
    case "fish":
      return (
        <g>
          <ellipse cx="0" cy="0" rx="110" ry="68" fill={light} opacity="0.9" />
          <polygon points="108,0 186,-70 174,0 186,70" fill={mid} opacity="0.9" />
        </g>
      );
    case "niche":
      return (
        <g>
          <path
            d="M-114 160 V-24 C-114 -114 -70 -176 0 -176 C70 -176 114 -114 114 -24 V160 Z"
            fill={deep}
            opacity="0.82"
          />
          <circle cx="0" cy="34" r="34" fill={light} opacity="0.88" />
        </g>
      );
    case "crown":
      return (
        <g>
          <path d="M-162 126 L-120 18 L-54 78 L0 -36 L54 78 L120 18 L162 126 Z" fill={deep} opacity="0.9" />
          <rect x="-162" y="126" width="324" height="44" rx="18" fill={mid} opacity="0.92" />
        </g>
      );
    case "dove":
      return (
        <g>
          <path
            d="M-118 12 C-88 -32 -36 -58 12 -52 C46 -48 72 -26 84 6 C110 18 132 46 132 80 C104 70 84 64 62 66 C24 70 -6 96 -34 122 C-42 84 -70 50 -118 12 Z"
            fill={light}
            opacity="0.92"
          />
        </g>
      );
    default:
      return null;
  }
}