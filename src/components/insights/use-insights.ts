import { useMemo } from "react";
import { useStore, todayKey } from "@/lib/store";
import { getWeekRange, isoOffset, type Insight } from "@/lib/intelligence";
import {
  compareSalahPeriods,
  generateSalahInsights,
  type SalahData,
  type SalahPeriodComparison,
} from "@/lib/salah-intelligence";
import {
  calculateBudgetAnalytics,
  generateBudgetInsights,
  type BudgetAnalytics,
  type ExpenseRecord,
} from "@/lib/budget-intelligence";
import {
  calculateMoodAnalytics,
  generateMoodInsights,
  type DailyActivityData,
  type MoodAnalytics,
} from "@/lib/mood-intelligence";
import { rankRecipes, type RecipeScore } from "@/lib/meal-intelligence";
import { weekKey } from "@/components/home/modules";
import { occursOn, type Recurrence } from "@/lib/recurrence";
import {
  useSelectedMember,
  useMemberSalah,
  useMemberCheckins,
  useMemberHabits,
  useMemberWater,
} from "@/lib/family-model";

/**
 * Presentation-only aggregator. It reads the existing stores and calls the
 * existing Phase 3 analytics APIs — no analytics, thresholds or scoring are
 * computed here.
 */
export interface InsightsData {
  week: string[];
  previousWeek: string[];
  monthPrefix: string;

  salah: {
    comparison: SalahPeriodComparison;
    insights: Insight[];
    hasData: boolean;
  };
  budget: {
    analytics: BudgetAnalytics;
    insights: Insight[];
    limits: Record<string, number>;
    hasData: boolean;
  };
  mood: {
    analytics: MoodAnalytics;
    insights: Insight[];
    hasData: boolean;
  };
  meals: {
    suggestions: RecipeScore[];
    hasData: boolean;
  };
  dueReminders: { id: string; title: string; time: string }[];
  family: { id: string; name: string; role: string }[];
  /** The most meaningful insights across every source, already prioritised. */
  headline: Insight[];
}

const SEVERITY_WEIGHT: Record<Insight["severity"], number> = {
  critical: 4,
  warning: 3,
  success: 2,
  info: 1,
};

/** Ordering only — picks which existing insights deserve the top of the page. */
export function prioritiseInsights(groups: Insight[][], limit = 5): Insight[] {
  const picked: Insight[] = [];
  const seen = new Set<string>();
  const titles = new Set<string>();

  const byWeight = (list: Insight[]) =>
    [...list].sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);

  // One insight per source first, so no single module dominates the summary.
  for (const group of groups) {
    const best = byWeight(group.filter((i) => !i.id.endsWith("insufficient")))[0];
    if (best && !seen.has(best.id) && !titles.has(best.title)) {
      seen.add(best.id);
      titles.add(best.title);
      picked.push(best);
    }
  }

  const rest = byWeight(
    groups.flat().filter((i) => !seen.has(i.id) && !i.id.endsWith("insufficient")),
  );
  for (const insight of rest) {
    if (picked.length >= limit) break;
    if (titles.has(insight.title)) continue;
    seen.add(insight.id);
    titles.add(insight.title);
    picked.push(insight);
  }

  return picked.slice(0, limit);
}

export function useInsights(memberId?: string): InsightsData {
  const [selectedMemberId] = useSelectedMember();
  const effectiveId = memberId !== undefined ? memberId : selectedMemberId;
  const isHousehold = effectiveId === undefined;

  const week = useMemo(() => getWeekRange(new Date()), []);
  const previousWeek = useMemo(
    () => [...Array(7)].map((_, i) => isoOffset(new Date(), -(13 - i))),
    [],
  );
  const monthDays = useMemo(
    () => [...Array(30)].map((_, i) => isoOffset(new Date(), -(29 - i))),
    [],
  );
  const monthPrefix = todayKey().slice(0, 7);

  const [salahLog] = useMemberSalah(effectiveId);
  const [expenses] = useStore<ExpenseRecord[]>("expenses", []);
  const [limits] = useStore<Record<string, number>>("limits", {});
  const [checkins] = useMemberCheckins(effectiveId);
  const [health] = useStore<Record<string, { weight?: string; sleep: string }>>("health", {});
  const [habits] = useMemberHabits(effectiveId);
  const [waterLog] = useMemberWater(effectiveId);
  const [recipes] = useStore<{ id: string; name: string; items: string }[]>("recipes", []);
  const [mealsHistory] = useStore<Record<string, Record<string, string>>>("mealsHistory", {});
  const [reminders] = useStore<{ id: string; title: string; time: string; recur: Recurrence }[]>(
    "reminders",
    [],
  );
  const [family] = useStore<{ id: string; name: string; role: string }[]>("family", []);

  const comparison = useMemo(
    () => (isHousehold ? compareSalahPeriods({}, week, previousWeek) : compareSalahPeriods(salahLog as SalahData, week, previousWeek)),
    [isHousehold, salahLog, week, previousWeek],
  );
  const salahInsights = useMemo(
    () => (isHousehold ? [] : generateSalahInsights(comparison)),
    [isHousehold, comparison],
  );

  const budgetAnalytics = useMemo(
    () => calculateBudgetAnalytics(expenses, monthPrefix),
    [expenses, monthPrefix],
  );
  const budgetInsights = useMemo(
    () => generateBudgetInsights(budgetAnalytics, limits),
    [budgetAnalytics, limits],
  );

  const activity: DailyActivityData[] = useMemo(
    () =>
      isHousehold
        ? []
        : monthDays.map((date) => {
            const day = (salahLog as Record<string, Record<string, string>>)[date] ?? {};
            const logged = Object.keys(day).length;
            const onTime = Object.values(day).filter((s) => s === "ontime").length;
            const h = health[date];
            const w = waterLog[date]?.water ?? 0;
            const entry: DailyActivityData = {
              date,
              waterGlasses: w,
              habitsCompleted: habits.filter((x: { days: string[] }) => x.days.includes(date)).length,
            };
            if (checkins[date]) entry.mood = checkins[date];
            if (h?.sleep && Number(h.sleep) > 0) entry.sleepHours = Number(h.sleep);
            if (logged > 0) entry.salahOnTimePct = (onTime / logged) * 100;
            return entry;
          }),
    [isHousehold, monthDays, salahLog, health, waterLog, habits, checkins],
  );

  const moodAnalytics = useMemo(
    () => (isHousehold ? calculateMoodAnalytics([]) : calculateMoodAnalytics(activity)),
    [isHousehold, activity],
  );
  const moodInsights = useMemo(() => {
    if (isHousehold) return [];
    const generated = generateMoodInsights(moodAnalytics);
    // Several correlations can share a title; show each distinct message once.
    const byTitle = new Map<string, Insight>();
    for (const i of generated) if (!byTitle.has(i.explanation)) byTitle.set(i.explanation, i);
    return [...byTitle.values()];
  }, [isHousehold, moodAnalytics]);

  const suggestions = useMemo(
    () => rankRecipes(recipes, mealsHistory, weekKey(0)).slice(0, 3),
    [recipes, mealsHistory],
  );

  const dueReminders = useMemo(
    () =>
      reminders
        .filter((r) => occursOn(r.recur, todayKey()))
        .sort((a, b) => a.time.localeCompare(b.time))
        .slice(0, 3)
        .map(({ id, title, time }) => ({ id, title, time })),
    [reminders],
  );

  const headline = useMemo(
    () => (isHousehold ? budgetInsights.slice(0, 3) : prioritiseInsights([salahInsights, budgetInsights, moodInsights])),
    [isHousehold, salahInsights, budgetInsights, moodInsights],
  );

  return {
    week,
    previousWeek,
    monthPrefix,
    salah: { comparison, insights: salahInsights, hasData: comparison.current.totalLogged > 0 },
    budget: {
      analytics: budgetAnalytics,
      insights: budgetInsights,
      limits,
      hasData: budgetAnalytics.currentMonthTotal > 0 || budgetAnalytics.previousMonthTotal > 0,
    },
    mood: {
      analytics: moodAnalytics,
      insights: moodInsights,
      hasData: moodAnalytics.totalLoggedDays >= 5,
    },
    meals: { suggestions, hasData: suggestions.length > 0 },
    dueReminders,
    family,
    headline,
  };
}
