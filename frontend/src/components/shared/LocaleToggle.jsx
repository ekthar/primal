import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/LocaleContext";

export default function LocaleToggle({ compact = false }) {
  const locale = useLocale();
  if (!locale) return null;

  const nextLocale = locale.locale === "hi" ? "en" : "hi";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => locale.setLocale(nextLocale)}
      className={compact ? "h-9 px-3" : "h-10 px-3"}
    >
      <span className="text-[11px] uppercase tracking-[0.14em] text-secondary-muted mr-2">
        {locale.t("common.language", "Language")}
      </span>
      <span className="font-medium">{locale.locale === "hi" ? locale.t("common.hindi", "Hindi") : locale.t("common.english", "English")}</span>
    </Button>
  );
}