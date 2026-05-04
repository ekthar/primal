/**
 * DocumentInputField — segmented "Scan with camera" vs "Upload from device" toggle.
 * Wraps a file input + LiveDocumentScanner. Emits the selected File via onChange,
 * along with a `capturedVia` telemetry tag ("scan" | "upload") on the file object.
 */
import { useRef, useState } from "react";
import LiveDocumentScanner from "./LiveDocumentScanner";
import { Camera, Upload, FileCheck } from "lucide-react";
import { useLocale } from "@/context/LocaleContext";

export default function DocumentInputField({
  value,                  // File | null
  onChange,               // (file: File | null) => void
  capturedVia,            // string | null
  onCapturedViaChange,    // (tag: "scan" | "upload") => void
  scannerOpen,
  onScannerOpenChange,
  accept = "image/*,application/pdf",
  label = "Document",
  scanTitle,
  scanHint,
  inputId,
  disabled,
}) {
  const locale = useLocale();
  const TABS = [
    { id: "scan", label: locale?.t("documentInput.scan", "Scan with camera") ?? "Scan with camera", icon: Camera },
    { id: "upload", label: locale?.t("documentInput.upload", "Upload from device") ?? "Upload from device", icon: Upload },
  ];
  const [tab, setTab] = useState(capturedVia === "scan" ? "scan" : "upload");
  const [internalScannerOpen, setInternalScannerOpen] = useState(false);
  const fileInputRef = useRef(null);
  const liveScannerOpen = scannerOpen ?? internalScannerOpen;

  const setScannerOpenState = (open) => {
    if (onScannerOpenChange) {
      onScannerOpenChange(open);
      return;
    }
    setInternalScannerOpen(open);
  };

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
            {locale?.t("documentInput.scanHint", "Use your phone's rear camera to scan this document live.") ?? "Use your phone's rear camera to scan this document live."}
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setScannerOpenState(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            <Camera className="size-4" /> {locale?.t("documentInput.openScanner", "Open scanner") ?? "Open scanner"}
          </button>
          {value ? (
            <div className="flex items-center gap-2 text-xs text-secondary-muted mt-1">
              <FileCheck className="size-4 text-emerald-600" /> {locale?.t("documentInput.captured", "Captured") ?? "Captured"}: {value.name} ({Math.round(value.size / 1024)} KB)
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
        open={liveScannerOpen}
        onClose={() => setScannerOpenState(false)}
        onCapture={handleScannerCapture}
        title={scanTitle || `${locale?.t("documentInput.scanPrefix", "Scan") ?? "Scan"} ${label.toLowerCase()}`}
        hint={scanHint}
      />
    </div>
  );
}
