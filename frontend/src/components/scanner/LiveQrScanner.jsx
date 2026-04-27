/**
 * LiveQrScanner — cross-browser live QR camera + photo decoder.
 *
 * Uses the `qr-scanner` library (worker-based, ~14KB gzipped) instead of
 * the browser-native `BarcodeDetector` API which is not available in
 * iOS Safari or Firefox. This component is purely the engine: it renders
 * the <video> + a small set of camera controls (torch, photo-pick), and
 * raises detected QR text via `onScan(rawValue)`. The parent owns the
 * surrounding modal, the result/error UI, and the manual-paste fallback.
 *
 * Props:
 *   active        boolean   — when true, the camera stream is started.
 *   onScan(text)  required  — invoked with the decoded QR string.
 *   onError(msg)  optional  — invoked when camera/decoder reports an error.
 *                            When provided, the component will NOT render an
 *                            internal error banner; the parent owns the UI.
 *   className     optional  — wrapper styling.
 *   videoClassName optional — styling for the <video> element.
 *   showPhotoPick boolean   — show the "Scan QR photo" button (default true).
 *   feedback      boolean   — vibrate + small beep on success (default true).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Flashlight, FlashlightOff, ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

let QrScannerCtor = null;
async function loadQrScanner() {
  if (QrScannerCtor) return QrScannerCtor;
  const mod = await import("qr-scanner");
  QrScannerCtor = mod.default || mod;
  return QrScannerCtor;
}

function vibrate() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([60, 40, 60]);
    }
  } catch {
    // navigator.vibrate may throw on some embedded webviews; ignore.
  }
}

function beep() {
  try {
    if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return;
    const ctx = new window.AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    setTimeout(() => ctx.close().catch(() => {}), 300);
  } catch {
    // AudioContext may be blocked by autoplay policies; ignore silently.
  }
}

export default function LiveQrScanner({
  active,
  onScan,
  onError,
  className = "",
  videoClassName = "",
  showPhotoPick = true,
  feedback = true,
}) {
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const scannerRef = useRef(null);
  const consumedRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState(false);
  const [hasFlash, setHasFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  const handleScanResult = useCallback(
    (result) => {
      if (consumedRef.current) return;
      const raw = typeof result === "string" ? result : result?.data;
      if (!raw) return;
      consumedRef.current = true;
      if (feedback) {
        vibrate();
        beep();
      }
      onScan?.(raw);
    },
    [onScan, feedback],
  );

  // When the parent provides onError, it owns the error UI and we suppress
  // the internal error banner so the same message is not displayed twice.
  const reportError = useCallback(
    (message) => {
      if (!onError) {
        setLocalError(message);
      }
      onError?.(message);
    },
    [onError],
  );

  const stop = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      await scanner.stop();
    } catch {
      // already stopped
    }
    try {
      scanner.destroy();
    } catch {
      // already destroyed
    }
    scannerRef.current = null;
    setRunning(false);
    setFlashOn(false);
    setHasFlash(false);
  }, []);

  const start = useCallback(async () => {
    if (!videoRef.current) return;
    setLocalError("");
    consumedRef.current = false;
    setStarting(true);
    try {
      const QrScanner = await loadQrScanner();
      // Some browsers (older Safari) need user gesture before getUserMedia;
      // the parent only sets active=true after the user has clicked, so we
      // can attempt directly. If not allowed, we surface the error.
      const supported = await QrScanner.hasCamera();
      if (!supported) {
        reportError(
          "No camera detected on this device. Use \"Scan QR photo\" or paste the verification URL instead.",
        );
        setStarting(false);
        return;
      }
      const scanner = new QrScanner(videoRef.current, handleScanResult, {
        preferredCamera: "environment",
        highlightScanRegion: true,
        highlightCodeOutline: true,
        maxScansPerSecond: 8,
        returnDetailedScanResult: true,
      });
      scannerRef.current = scanner;
      await scanner.start();
      const flashAvailable = await scanner.hasFlash().catch(() => false);
      setHasFlash(Boolean(flashAvailable));
      setRunning(true);
      setStarting(false);
    } catch (error) {
      setStarting(false);
      const name = error?.name;
      let message;
      if (name === "NotAllowedError" || name === "SecurityError") {
        message = "Camera permission denied. Allow camera access or paste the verification URL instead.";
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        message = "No usable camera found. Try \"Scan QR photo\" or paste the verification URL.";
      } else {
        message = error?.message || "Could not start the camera scanner.";
      }
      reportError(message);
    }
  }, [handleScanResult, reportError]);

  useEffect(() => {
    if (active) {
      start();
    } else {
      stop();
    }
    return () => {
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const toggleFlash = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner || !hasFlash) return;
    try {
      await scanner.toggleFlash();
      const isOn = scanner.isFlashOn?.() ?? !flashOn;
      setFlashOn(Boolean(isOn));
    } catch {
      setHasFlash(false);
    }
  }, [hasFlash, flashOn]);

  async function handlePhotoPick(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    // Each photo pick is a fresh, deliberate scan attempt: clear the
    // single-shot guard so a previously consumed scan doesn't silently
    // suppress this one. Without this, after the first successful decode
    // every subsequent photo pick would no-op until the camera is restarted.
    consumedRef.current = false;
    setPhotoBusy(true);
    setLocalError("");
    try {
      const QrScanner = await loadQrScanner();
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
      handleScanResult(result);
    } catch (error) {
      const message = error?.message || (typeof error === "string" ? error : "");
      reportError(message || "No QR code was found in that image.");
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="relative overflow-hidden rounded-2xl border border-border bg-black">
        <video
          ref={videoRef}
          className={`aspect-square w-full bg-black object-cover ${videoClassName}`}
          muted
          playsInline
        />
        {!running && !starting ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/65 text-center text-xs text-white/80">
            <Camera className="size-6" />
            <div>{active ? "Camera off" : "Ready to scan"}</div>
          </div>
        ) : null}
        {starting ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-center text-xs text-white">
            <Loader2 className="size-6 animate-spin" />
            <div>Starting camera...</div>
          </div>
        ) : null}
        {hasFlash ? (
          <button
            type="button"
            onClick={toggleFlash}
            className="absolute right-3 top-3 inline-flex size-10 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur"
            aria-label={flashOn ? "Turn flashlight off" : "Turn flashlight on"}
          >
            {flashOn ? <Flashlight className="size-4" /> : <FlashlightOff className="size-4" />}
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => (running ? stop() : start())}
          disabled={starting}
        >
          <Camera className="size-4" />
          {starting ? "Starting..." : running ? "Stop camera" : "Start camera"}
        </Button>
        {showPhotoPick ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={photoBusy}
          >
            {photoBusy ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
            {photoBusy ? "Decoding..." : "Scan QR photo"}
          </Button>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoPick}
        className="hidden"
      />

      {localError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {localError}
        </div>
      ) : null}
    </div>
  );
}
