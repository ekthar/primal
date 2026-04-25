/**
 * DocumentInputField — segmented "Scan with camera" vs "Upload from device" toggle.
 * Wraps a file input + LiveDocumentScanner. Emits the selected File via onChange,
 * along with a `capturedVia` telemetry tag ("scan" | "upload") on the file object.
 */
import { useRef, useState } from "react";
import LiveDocumentScanner from "./LiveDocumentScanner";
import { Camera, Upload, FileCheck } from "lucide-react";

const TABS = [
  { id: "scan", label: "Scan with camera", icon: Camera },
  { id: "upload", label: "Upload from device", icon: Upload },
];

export default function DocumentInputField({
  value,                  // File | null
  onChange,               // (file: File | null) => void
  capturedVia,            // string | null
  onCapturedViaChange,    // (tag: "scan" | "upload") => void
  accept = "image/*,application/pdf",
  label = "Document",
  scanTitle,
  scanHint,
  inputId,
  disabled,
}) {
  const [tab, setTab] = useState(capturedVia === "scan" ? "scan" : "upload");
  const [scannerOpen, setScannerOpen] = useState(false);
  const fileInputRef = useRef(null);

  const handleScannerCapture = (file) => {
    onChange?.(file);
    onCapturedViaChange?.("scan");
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    onChange?.(file);
    onCapturedViaChange?.(file ? "upload" : null);
  };

  return (
    <div className="space-y-2">
      <div role="tablist" aria-label={`${label} input mode`} className="inline-flex rounded-xl border border-border bg-surface-muted/40 p-1 text-xs">
        {TABS.map(({ id, label: tabLabel, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            disabled={disabled}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              tab === id
                ? "bg-foreground text-background shadow-sm"
                : "text-secondary-muted hover:text-foreground"
            }`}
          >
            <Icon className="size-3.5" />
            <span>{tabLabel}</span>
          </button>
        ))}
      </div>

      {tab === "scan" ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-sm text-secondary-muted">
            <Camera className="size-4 text-foreground" />
            Use your phone&apos;s rear camera to scan this document live.
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setScannerOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            <Camera className="size-4" /> Open scanner
          </button>
          {value ? (
            <div className="flex items-center gap-2 text-xs text-secondary-muted mt-1">
              <FileCheck className="size-4 text-emerald-600" /> Captured: {value.name} ({Math.round(value.size / 1024)} KB)
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-3">
          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            accept={accept}
            disabled={disabled}
            onChange={handleFileChange}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-foreground file:px-3 file:py-2 file:text-background hover:file:bg-foreground/90"
          />
          {value ? (
            <div className="flex items-center gap-2 text-xs text-secondary-muted mt-2">
              <FileCheck className="size-4 text-emerald-600" /> {value.name}
            </div>
          ) : null}
        </div>
      )}

      <LiveDocumentScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onCapture={handleScannerCapture}
        title={scanTitle || `Scan ${label.toLowerCase()}`}
        hint={scanHint}
      />
    </div>
  );
}
