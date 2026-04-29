/**
 * LiveDocumentScanner — full-screen camera capture for document verification.
 *
 * Opens the rear-facing camera via getUserMedia, draws a guide rectangle for
 * letter / A4 / square capture, and emits a JPEG blob on confirm. Falls back
 * to a native `<input type="file" capture="environment">` when getUserMedia
 * is unavailable (older browsers, embedded webviews, denied permission).
 *
 * Props:
 *   open              boolean
 *   onClose()         called on cancel
 *   onCapture(blob, meta)  called with image/jpeg blob + { width, height, kind:'scan' }
 *   guideRatio        number — width/height of the guide rectangle (default 0.71 = A4)
 *   maxWidth          number — downscale captures wider than this (default 1920)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, FlashlightOff, Flashlight, RotateCcw, Check, X, AlertTriangle, Loader2 } from "lucide-react";

const DEFAULT_GUIDE_RATIO = 0.71; // A4 portrait, ~1:1.41
const ANALYSIS_WIDTH = 120;
const ANALYSIS_HEIGHT = 160;
const AUTO_CAPTURE_GOOD_FRAMES = 4;

function analyzeFrame(video, previousSample) {
  const canvas = document.createElement("canvas");
  canvas.width = ANALYSIS_WIDTH;
  canvas.height = ANALYSIS_HEIGHT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { ready: false, message: "Camera analysis unavailable" };

  ctx.drawImage(video, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
  const data = ctx.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT).data;
  const luminance = [];
  let total = 0;
  let min = 255;
  let max = 0;
  let edgeScore = 0;

  for (let index = 0; index < data.length; index += 4) {
    const value = Math.round((data[index] * 0.299) + (data[index + 1] * 0.587) + (data[index + 2] * 0.114));
    luminance.push(value);
    total += value;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  for (let y = 1; y < ANALYSIS_HEIGHT - 1; y += 2) {
    for (let x = 1; x < ANALYSIS_WIDTH - 1; x += 2) {
      const current = luminance[(y * ANALYSIS_WIDTH) + x];
      const horizontal = Math.abs(current - luminance[(y * ANALYSIS_WIDTH) + x + 1]);
      const vertical = Math.abs(current - luminance[((y + 1) * ANALYSIS_WIDTH) + x]);
      if (horizontal + vertical > 42) edgeScore += 1;
    }
  }

  let motion = 0;
  if (previousSample?.length === luminance.length) {
    for (let index = 0; index < luminance.length; index += 16) {
      motion += Math.abs(luminance[index] - previousSample[index]);
    }
    motion /= Math.ceil(luminance.length / 16);
  }

  const brightness = total / luminance.length;
  const contrast = max - min;
  const edgeDensity = edgeScore / ((ANALYSIS_WIDTH / 2) * (ANALYSIS_HEIGHT / 2));
  const brightEnough = brightness >= 72 && brightness <= 225;
  const contrastEnough = contrast >= 58;
  const documentLike = edgeDensity >= 0.025;
  const stable = !previousSample || motion < 9;

  let message = "Hold steady";
  if (!brightEnough) message = brightness < 72 ? "Move to better light" : "Reduce glare";
  else if (!contrastEnough || !documentLike) message = "Fill the guide with the document";
  else if (!stable) message = "Hold steady";
  else message = "Analyzing document";

  return {
    ready: brightEnough && contrastEnough && documentLike && stable,
    sample: luminance,
    message,
  };
}

function captureVideoFrame(video, maxWidth, quality, callback) {
  if (!video || video.readyState < 2) return false;
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return false;
  const scale = width > maxWidth ? maxWidth / width : 1;
  const outW = Math.round(width * scale);
  const outH = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(video, 0, 0, outW, outH);
  canvas.toBlob(
    (blob) => {
      if (blob) callback(blob, { width: outW, height: outH });
    },
    "image/jpeg",
    quality,
  );
  return true;
}

export default function LiveDocumentScanner({
  open,
  onClose,
  onCapture,
  guideRatio = DEFAULT_GUIDE_RATIO,
  maxWidth = 1280,
  autoCapture = true,
  title = "Scan document",
  hint = "Hold steady, fill the frame, ensure even lighting.",
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const analysisRef = useRef({ frame: 0, goodFrames: 0, sample: null, captured: false });
  const [stage, setStage] = useState("idle"); // idle | live | preview | error
  const [errorMsg, setErrorMsg] = useState("");
  const [analysisMsg, setAnalysisMsg] = useState("Starting camera...");
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [previewDims, setPreviewDims] = useState(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startStream = useCallback(async () => {
    setErrorMsg("");
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStage("error");
      setErrorMsg("Live camera is not supported by this browser. Use Upload instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const capabilities = typeof track.getCapabilities === "function" ? track.getCapabilities() : {};
      setTorchSupported(Boolean(capabilities?.torch));
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStage("live");
    } catch (error) {
      setStage("error");
      const message = error?.name === "NotAllowedError"
        ? "Camera permission denied. You can still upload a file."
        : (error?.message || "Unable to access camera.");
      setErrorMsg(message);
    }
  }, []);

  // Lifecycle
  useEffect(() => {
    if (!open) return undefined;
    setStage("idle");
    setPreviewUrl(null);
    setPreviewBlob(null);
    setPreviewDims(null);
    setTorchOn(false);
    setAnalysisMsg("Starting camera...");
    analysisRef.current = { frame: 0, goodFrames: 0, sample: null, captured: false };
    startStream();
    return () => {
      stopStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleToggleTorch = async () => {
    if (!torchSupported || !streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  const handleCapture = () => {
    const video = videoRef.current;
    captureVideoFrame(video, maxWidth, 0.82, (blob, dims) => {
      const url = URL.createObjectURL(blob);
      setPreviewBlob(blob);
      setPreviewUrl(url);
      setPreviewDims(dims);
      setStage("preview");
    });
  };

  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setPreviewDims(null);
    setStage("live");
  };

  const handleClose = useCallback(() => {
    stopStream();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    onClose?.();
  }, [onClose, previewUrl, stopStream]);

  const handleConfirm = () => {
    if (!previewBlob) return;
    const file = new File([previewBlob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" });
    onCapture?.(file, { ...previewDims, kind: "scan", autoAccepted: false });
    handleClose();
  };

  const handleAutoCapture = useCallback(() => {
    if (analysisRef.current.captured) return;
    const video = videoRef.current;
    const captured = captureVideoFrame(video, maxWidth, 0.78, (blob, dims) => {
      analysisRef.current.captured = true;
      const file = new File([blob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" });
      onCapture?.(file, { ...dims, kind: "scan", autoAccepted: true });
      handleClose();
    });
    if (captured) {
      setAnalysisMsg("Captured");
    }
  }, [handleClose, maxWidth, onCapture]);

  useEffect(() => {
    if (!open || stage !== "live" || !autoCapture) return undefined;
    let cancelled = false;

    function tick() {
      if (cancelled || analysisRef.current.captured) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        const result = analyzeFrame(video, analysisRef.current.sample);
        analysisRef.current.sample = result.sample || analysisRef.current.sample;
        analysisRef.current.goodFrames = result.ready ? analysisRef.current.goodFrames + 1 : 0;
        setAnalysisMsg(result.message);
        if (analysisRef.current.goodFrames >= AUTO_CAPTURE_GOOD_FRAMES) {
          handleAutoCapture();
          return;
        }
      }
      analysisRef.current.frame = window.setTimeout(tick, 140);
    }

    analysisRef.current.frame = window.setTimeout(tick, 260);
    return () => {
      cancelled = true;
      window.clearTimeout(analysisRef.current.frame);
    };
  }, [autoCapture, handleAutoCapture, open, stage]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={title}>
      <header className="flex items-center justify-between px-4 py-3 bg-black/70 backdrop-blur">
        <div>
          <div className="text-sm font-semibold tracking-wide uppercase">{title}</div>
          <div className="text-[11px] text-white/70 mt-0.5">{hint}</div>
        </div>
        <button onClick={handleClose} aria-label="Close scanner" className="rounded-full p-2 hover:bg-white/10">
          <X className="size-5" />
        </button>
      </header>

      <div className="relative flex-1 overflow-hidden">
        {stage === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <AlertTriangle className="size-10 text-amber-300 mb-3" />
            <p className="text-base font-medium">{errorMsg || "Camera unavailable"}</p>
            <p className="text-xs text-white/70 mt-2 max-w-sm">
              Switch to <strong>Upload from device</strong> to attach an existing photo or PDF.
            </p>
            <Button variant="secondary" className="mt-6" onClick={handleClose}>Close</Button>
          </div>
        ) : null}

        {stage !== "error" ? (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`absolute inset-0 h-full w-full object-cover ${stage === "preview" ? "opacity-0" : ""}`}
          />
        ) : null}

        {stage === "live" ? <GuideOverlay ratio={guideRatio} /> : null}
        {stage === "live" && autoCapture ? (
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/20 bg-black/55 px-3 py-2 text-xs text-white shadow-lg backdrop-blur">
            <Loader2 className="size-3.5 animate-spin" />
            <span>{analysisMsg}</span>
          </div>
        ) : null}

        {stage === "preview" && previewUrl ? (
          <img src={previewUrl} alt="Captured document preview" className="absolute inset-0 h-full w-full object-contain bg-black" />
        ) : null}
      </div>

      <footer className="px-4 py-4 bg-black/80 backdrop-blur flex items-center justify-between gap-3">
        {stage === "live" ? (
          <>
            <Button
              variant="ghost"
              className="text-white hover:bg-white/10"
              onClick={handleToggleTorch}
              disabled={!torchSupported}
              aria-pressed={torchOn}
              aria-label={torchOn ? "Turn torch off" : "Turn torch on"}
            >
              {torchOn ? <Flashlight className="size-5" /> : <FlashlightOff className="size-5" />}
            </Button>
            <button
              onClick={handleCapture}
              className="size-16 rounded-full bg-white border-4 border-white/40 active:scale-95 transition"
              aria-label="Capture"
            >
              <Camera className="size-6 text-black mx-auto" />
            </button>
            <Button variant="ghost" className="text-white hover:bg-white/10" onClick={handleClose}>Cancel</Button>
          </>
        ) : null}

        {stage === "preview" ? (
          <>
            <Button variant="outline" onClick={handleRetake} className="bg-transparent text-white border-white/40 hover:bg-white/10">
              <RotateCcw className="size-4 mr-1.5" /> Retake
            </Button>
            <Button onClick={handleConfirm} className="bg-white text-black hover:bg-white/90">
              <Check className="size-4 mr-1.5" /> Use this scan
            </Button>
          </>
        ) : null}

        {stage === "idle" ? (
          <div className="flex-1 text-center text-sm text-white/70">Starting camera…</div>
        ) : null}
      </footer>
    </div>
  );
}

function GuideOverlay({ ratio }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div
        className="relative border-2 border-white/80 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
        style={{
          width: "min(80vw, 540px)",
          aspectRatio: `${ratio} / 1`,
        }}
      >
        {[0, 1, 2, 3].map((corner) => {
          const positions = [
            "top-0 left-0 border-t-2 border-l-2",
            "top-0 right-0 border-t-2 border-r-2",
            "bottom-0 left-0 border-b-2 border-l-2",
            "bottom-0 right-0 border-b-2 border-r-2",
          ];
          return (
            <span
              key={corner}
              className={`absolute size-6 ${positions[corner]} border-white rounded-[2px]`}
            />
          );
        })}
      </div>
    </div>
  );
}
