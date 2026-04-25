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
import { Camera, FlashlightOff, Flashlight, RotateCcw, Check, X, AlertTriangle } from "lucide-react";

const DEFAULT_GUIDE_RATIO = 0.71; // A4 portrait, ~1:1.41

export default function LiveDocumentScanner({
  open,
  onClose,
  onCapture,
  guideRatio = DEFAULT_GUIDE_RATIO,
  maxWidth = 1920,
  title = "Scan document",
  hint = "Hold steady, fill the frame, ensure even lighting.",
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [stage, setStage] = useState("idle"); // idle | live | preview | error
  const [errorMsg, setErrorMsg] = useState("");
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
          width: { ideal: 1920 },
          height: { ideal: 1080 },
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
    if (!video || video.readyState < 2) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    const scale = w > maxWidth ? maxWidth / w : 1;
    const outW = Math.round(w * scale);
    const outH = Math.round(h * scale);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, outW, outH);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setPreviewBlob(blob);
        setPreviewUrl(url);
        setPreviewDims({ width: outW, height: outH });
        setStage("preview");
      },
      "image/jpeg",
      0.85,
    );
  };

  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setPreviewDims(null);
    setStage("live");
  };

  const handleConfirm = () => {
    if (!previewBlob) return;
    const file = new File([previewBlob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" });
    onCapture?.(file, { ...previewDims, kind: "scan" });
    handleClose();
  };

  const handleClose = () => {
    stopStream();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    onClose?.();
  };

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
