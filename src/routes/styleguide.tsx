import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, ChevronRight, Flame, Home, ListChecks, BarChart3, Settings, Bell, Plus } from "lucide-react";

export const Route = createFileRoute("/styleguide")({
  head: () => ({
    meta: [
      { title: "Sunnah Home — Design System" },
      { name: "description", content: "Vibrant Sunnah Material 3 tokens and components for the Sunnah Home Android app." },
      { property: "og:title", content: "Sunnah Home — Design System" },
      { property: "og:description", content: "Color, type, shape and component tokens mapped to Jetpack Compose." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Styleguide,
});

const COLORS: [string, string, string, string, string][] = [
  // token, compose name, light, dark, on-token
  ["primary", "primary", "#006C4C", "#6CDBAC", "on-primary"],
  ["primary-container", "primaryContainer", "#89F8C7", "#005138", "on-primary-container"],
  ["secondary", "secondary", "#8A5A00", "#FFB94C", "on-secondary"],
  ["secondary-container", "secondaryContainer", "#FFDDB0", "#693C00", "on-secondary-container"],
  ["bg", "background", "#FBFDF9", "#191C1A", "on-surface"],
  ["container", "surfaceContainer", "#EEF3EE", "#232724", "on-surface"],
  ["surface-variant", "surfaceVariant", "#DCE5DD", "#404943", "on-surface-variant"],
  ["outline", "outline", "#707973", "#8A938C", "surface"],
  ["success", "custom.success", "#1B7F3B", "#7EDB95", "surface"],
  ["warning", "custom.warning", "#9A6700", "#FFC65C", "surface"],
  ["error", "error", "#BA1A1A", "#FFB4AB", "on-error"],
];
const TYPE = [
  ["sh-display", "Display", "36 / 44 · 600"],
  ["sh-headline", "Headline", "28 / 36 · 600"],
  ["sh-title", "Title", "20 / 28 · 600"],
  ["sh-body", "Body", "16 / 24 · 400"],
  ["sh-label", "Label", "14 / 20 · 500"],
];
const T = {
  en: { today: "Today", morning: "Morning adhkar", duha: "Duha prayer", quran: "Read 1 page of Quran", streak: "day streak", done: "Done", add: "Add habit", cancel: "Cancel", name: "Habit name", fast: "Fast Monday" },
  ar: { today: "اليوم", morning: "أذكار الصباح", duha: "صلاة الضحى", quran: "قراءة صفحة من القرآن", streak: "يوم متتالي", done: "تم", add: "إضافة عادة", cancel: "إلغاء", name: "اسم العادة", fast: "صيام الاثنين" },
};

function Styleguide() {
  const [dark, setDark] = useState(false);
  const [rtl, setRtl] = useState(false);
  const t = rtl ? T.ar : T.en;
  return (
    <div className={`sh ${dark ? "sh-dark" : ""} min-h-screen`} dir={rtl ? "rtl" : "ltr"} lang={rtl ? "ar" : "en"}>
      <header className="sticky top-0 z-10 bg-sh-container px-4 py-3 flex flex-wrap items-center gap-2 border-b border-sh-outline-variant">
        <div className="flex-1 min-w-0">
          <p className="sh-label-sm text-sh-on-surface-variant uppercase">Sunnah Home · Vibrant Sunnah</p>
          <h1 className="sh-title">Design system</h1>
        </div>
        <Chip selected={dark} onClick={() => setDark(!dark)}>{dark ? "Dark" : "Light"}</Chip>
        <Chip selected={rtl} onClick={() => setRtl(!rtl)}>{rtl ? "العربية RTL" : "English LTR"}</Chip>
      </header>

      <main className="mx-auto max-w-[430px] px-4 py-6 space-y-10">
        <Section title="Color roles" note="Compose: lightColorScheme / darkColorScheme. Hex shown light → dark.">
          <div className="grid grid-cols-2 gap-3">
            {COLORS.map(([tok, compose, l, d]) => (
              <div key={tok} className="sh-r-md border border-sh-outline-variant overflow-hidden">
                <div className={`h-14 bg-sh-${tok}`} />
                <div className="p-2">
                  <p className="sh-label">{tok}</p>
                  <p className="sh-label-sm text-sh-on-surface-variant">{compose}</p>
                  <p className="sh-label-sm text-sh-on-surface-variant" dir="ltr">{l} → {d}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type scale" note="Latin: Plus Jakarta Sans. Arabic: Noto Naskh Arabic (full tashkeel). Sizes in sp.">
          <div className="space-y-3">
            {TYPE.map(([cls, name, spec]) => (
              <div key={name} className="border-b border-sh-outline-variant pb-2">
                <p className={cls}>{rtl ? "سنة كل يوم" : name}</p>
                <p className="sh-label-sm text-sh-on-surface-variant" dir="ltr">{name} · {spec}</p>
              </div>
            ))}
            <p className="sh-arabic text-sh-primary" lang="ar" dir="rtl">سُبْحَانَ اللَّهِ وَبِحَمْدِهِ</p>
          </div>
        </Section>

        <Section title="Spacing, shape, elevation" note="4dp grid · MaterialTheme.shapes · tonal elevation 1–3.">
          <div className="flex items-end gap-2 mb-4">
            {[4, 8, 12, 16, 24, 32].map((s) => (
              <div key={s} className="text-center"><div className="bg-sh-primary sh-r-xs" style={{ width: s, height: s }} /><p className="sh-label-sm mt-1">{s}</p></div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[["sh-r-xs", "XS 4"], ["sh-r-sm", "S 8"], ["sh-r-md", "M 12"], ["sh-r-lg", "L 16"], ["sh-r-xl", "XL 28"], ["sh-r-full", "Full"]].map(([c, n]) => (
              <div key={n} className={`${c} h-14 bg-sh-primary-container text-sh-on-primary-container grid place-items-center sh-label`}>{n}</div>
            ))}
            {["sh-elev-1", "sh-elev-2", "sh-elev-3"].map((e, i) => (
              <div key={e} className={`${e} sh-r-md h-14 bg-sh-surface grid place-items-center sh-label`}>Level {i + 1}</div>
            ))}
          </div>
          <p className="sh-body-sm text-sh-on-surface-variant mt-3">Icons: Material Symbols Rounded, 24dp, 2dp stroke equivalent. Directional icons mirror in RTL.</p>
        </Section>

        <Section title="Buttons" note="Button · FilledTonalButton · OutlinedButton · TextButton · FAB. Min height 48dp.">
          <div className="flex flex-wrap gap-3">
            <button className="sh-touch sh-r-full px-6 bg-sh-primary text-sh-on-primary sh-label">{t.add}</button>
            <button className="sh-touch sh-r-full px-6 bg-sh-secondary-container text-sh-on-secondary-container sh-label">{t.done}</button>
            <button className="sh-touch sh-r-full px-6 border border-sh-outline text-sh-primary sh-label">{t.cancel}</button>
            <button className="sh-touch sh-r-full px-4 text-sh-primary sh-label">{t.cancel}</button>
            <button aria-label={t.add} className="h-14 w-14 sh-r-lg sh-elev-3 bg-sh-primary-container text-sh-on-primary-container grid place-items-center"><Plus /></button>
          </div>
        </Section>

        <Section title="Habit tile + progress ring" note="ElevatedCard + Checkbox · CircularProgressIndicator (determinate).">
          <div className="flex items-center gap-4 bg-sh-primary-container text-sh-on-primary-container sh-r-xl p-4 mb-3">
            <Ring value={3} total={5} />
            <div>
              <p className="sh-title">{t.today}</p>
              <p className="sh-body-sm flex items-center gap-1"><Flame className="size-4 text-sh-secondary" /> 12 {t.streak}</p>
            </div>
          </div>
          <div className="space-y-2">
            <HabitTile title={t.morning} time="05:40" streak={12} done />
            <HabitTile title={t.duha} time="09:15" streak={4} />
            <HabitTile title={t.quran} time="21:00" streak={30} />
          </div>
        </Section>

        <Section title="Inputs & selection" note="OutlinedTextField · Switch · FilterChip.">
          <label className="block mb-4">
            <span className="sh-label-sm text-sh-primary px-1">{t.name}</span>
            <input defaultValue={t.fast} className="mt-1 w-full sh-touch sh-r-xs border-2 border-sh-primary bg-transparent px-4 sh-body outline-none" />
          </label>
          <Toggle label={rtl ? "التذكيرات" : "Reminders"} />
          <div className="flex flex-wrap gap-2 mt-3">
            {(rtl ? ["الصباح", "المساء", "الصلاة", "الصيام"] : ["Morning", "Evening", "Prayer", "Fasting"]).map((c, i) => <Chip key={c} selected={i === 0}>{c}</Chip>)}
          </div>
        </Section>

        <Section title="Bottom sheet & dialog" note="ModalBottomSheet · AlertDialog.">
          <div className="bg-sh-container sh-r-xl p-4 pt-2 sh-elev-1">
            <div className="mx-auto h-1 w-8 sh-r-full bg-sh-outline mb-4" />
            <p className="sh-title mb-1">{t.add}</p>
            <p className="sh-body-sm text-sh-on-surface-variant mb-3">{rtl ? "اختر عادة من السنة" : "Choose a Sunnah to build"}</p>
            <button className="w-full sh-touch sh-r-full bg-sh-primary text-sh-on-primary sh-label">{t.add}</button>
          </div>
          <div className="bg-sh-container sh-r-xl p-6 sh-elev-3 mt-4">
            <p className="sh-headline mb-2" style={{ fontSize: 24, lineHeight: "32px" }}>{rtl ? "حذف العادة؟" : "Delete habit?"}</p>
            <p className="sh-body-sm text-sh-on-surface-variant mb-4">{rtl ? "سيتم حذف السجل." : "Its history will be removed."}</p>
            <div className="flex justify-end gap-2">
              <button className="sh-touch px-3 text-sh-primary sh-label">{t.cancel}</button>
              <button className="sh-touch px-3 text-sh-error sh-label">{rtl ? "حذف" : "Delete"}</button>
            </div>
          </div>
        </Section>

        <Section title="Top app bar & navigation" note="CenterAlignedTopAppBar · NavigationBar (4 destinations, 80dp).">
          <div className="border border-sh-outline-variant sh-r-lg overflow-hidden">
            <div className="h-16 flex items-center px-1 bg-sh-surface">
              <button aria-label="Back" className="sh-touch grid place-items-center"><ChevronRight className="rotate-180 rtl:rotate-0" /></button>
              <p className="flex-1 text-center sh-title">{t.today}</p>
              <button aria-label="Notifications" className="sh-touch grid place-items-center"><Bell /></button>
            </div>
            <div className="h-48 bg-sh-bg" />
            <nav className="h-20 grid grid-cols-4 bg-sh-container">
              {[[Home, t.today], [ListChecks, rtl ? "العادات" : "Habits"], [BarChart3, rtl ? "التقدم" : "Progress"], [Settings, rtl ? "الإعدادات" : "Settings"]].map(([I, l], i) => {
                const Icon = I as typeof Home;
                return (
                  <button key={i} className="flex flex-col items-center justify-center gap-1">
                    <span className={`h-8 w-16 sh-r-full grid place-items-center ${i === 0 ? "bg-sh-secondary-container text-sh-on-secondary-container" : "text-sh-on-surface-variant"}`}><Icon className="size-5" /></span>
                    <span className="sh-label-sm">{l as string}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </Section>

        <Section title="Native build notes" note="">
          <ul className="sh-body-sm text-sh-on-surface-variant list-disc ps-5 space-y-1">
            <li>All tokens live in one theme file → Compose <code>Color.kt</code>, <code>Type.kt</code>, <code>Shape.kt</code>.</li>
            <li>Shadows here approximate M3 tonal elevation; on Android use <code>tonalElevation</code>, not drop shadows.</li>
            <li>Arabic numerals/dates: use <code>Locale("ar")</code> formatters; spacing uses start/end only.</li>
            <li>Dynamic color (Android 12+) should be disabled to keep brand green/gold.</li>
          </ul>
        </Section>
      </main>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="sh-title mb-1">{title}</h2>
      {note && <p className="sh-body-sm text-sh-on-surface-variant mb-4" dir="ltr">{note}</p>}
      {children}
    </section>
  );
}
function Chip({ selected, onClick, children }: { selected?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`h-12 flex items-center gap-1 px-4 sh-r-sm sh-label border ${selected ? "bg-sh-secondary-container text-sh-on-secondary-container border-transparent" : "border-sh-outline text-sh-on-surface-variant"}`}>
      {selected && <Check className="size-4" />}{children}
    </button>
  );
}
function Ring({ value, total }: { value: number; total: number }) {
  const r = 28, c = 2 * Math.PI * r;
  return (
    <div className="relative size-[72px]">
      <svg viewBox="0 0 72 72" className="size-full -rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" strokeWidth="8" className="stroke-sh-surface" />
        <circle cx="36" cy="36" r={r} fill="none" strokeWidth="8" strokeLinecap="round" className="stroke-sh-primary" strokeDasharray={c} strokeDashoffset={c * (1 - value / total)} />
      </svg>
      <span className="absolute inset-0 grid place-items-center sh-label">{value}/{total}</span>
    </div>
  );
}
function HabitTile({ title, time, streak, done: d0 }: { title: string; time: string; streak: number; done?: boolean }) {
  const [done, setDone] = useState(!!d0);
  return (
    <div className="flex items-center gap-3 bg-sh-surface sh-elev-1 sh-r-lg ps-4 pe-1 py-2">
      <div className="flex-1 min-w-0">
        <p className={`sh-title-sm ${done ? "line-through text-sh-on-surface-variant" : ""}`}>{title}</p>
        <p className="sh-label-sm text-sh-on-surface-variant flex items-center gap-2"><span dir="ltr">{time}</span><Flame className="size-3 text-sh-secondary" />{streak}</p>
      </div>
      <button role="checkbox" aria-checked={done} aria-label={title} onClick={() => setDone(!done)} className="sh-touch grid place-items-center">
        <span className={`size-7 sh-r-full grid place-items-center border-2 ${done ? "bg-sh-primary border-sh-primary text-sh-on-primary" : "border-sh-outline"}`}>{done && <Check className="size-4" />}</span>
      </button>
    </div>
  );
}
function Toggle({ label }: { label: string }) {
  const [on, setOn] = useState(true);
  return (
    <button role="switch" aria-checked={on} onClick={() => setOn(!on)} className="w-full sh-touch flex items-center justify-between">
      <span className="sh-body">{label}</span>
      <span className={`h-8 w-[52px] sh-r-full flex items-center px-1 border-2 ${on ? "bg-sh-primary border-sh-primary justify-end" : "bg-sh-surface-variant border-sh-outline justify-start"}`}>
        <span className={`sh-r-full ${on ? "size-6 bg-sh-on-primary" : "size-4 bg-sh-outline"}`} />
      </span>
    </button>
  );
}
