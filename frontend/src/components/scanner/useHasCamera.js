import { useEffect, useState } from "react";

/**
 * useHasCamera — returns one of:
 *   "unknown"   — checking, or browser doesn't expose enumerateDevices
 *   "available" — at least one video input device was reported
 *   "missing"   — no video input devices reported
 *
 * Note: enumerateDevices() returns video input entries even before the user
 * grants camera permission, but their `label` will be empty. We only count
 * the presence of `kind === "videoinput"`, not the label, so this works on
 * desktops with no camera (returns missing) without needing permission.
 */
export function useHasCamera() {
  const [status, setStatus] = useState("unknown");

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const md = navigator.mediaDevices;
    if (!md || typeof md.enumerateDevices !== "function") {
      setStatus("unknown");
      return;
    }

    let cancelled = false;
    md.enumerateDevices()
      .then((devices) => {
        if (cancelled) return;
        const hasVideoInput = devices.some((device) => device.kind === "videoinput");
        setStatus(hasVideoInput ? "available" : "missing");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("unknown");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
