import { useCallback, useEffect, useMemo } from "react";
import { useStore, writeStore } from "./store";

export type FamilyRole = "admin" | "member" | "child" | "parent" | "other";
export type CanonicalFamilyRole = "admin" | "member" | "child";

export interface Chore {
  id: string;
  title: string;
  done: boolean;
  recur?: any;
  completions?: string[];
}

export interface FamilyMember {
  id: string;
  name: string;
  role: FamilyRole;
  age?: string | undefined;
  color?: string | undefined;
  avatar?: string | undefined;
  chores: Chore[]; // kept for backward compatibility with current routine workflows
}

/** Storage key for active perspective/view filter */
export const SELECTED_MEMBER_KEY = "selected_member_id";

/**
 * Programmatically resets the active perspective back to Household (undefined).
 */
export function resetSelectedMember(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(`veedu:${SELECTED_MEMBER_KEY}`);
  }
  writeStore<string | undefined>(SELECTED_MEMBER_KEY, undefined);
}

/**
 * Normalizes legacy and product roles to the canonical set: "admin" | "member" | "child".
 * Defaults safely to "member" if unspecified, or maps "parent" -> "admin".
 */
export function getCanonicalFamilyRole(role?: string | null): CanonicalFamilyRole {
  if (!role) return "member";
  const r = role.toLowerCase().trim();
  if (r === "admin" || r === "parent") return "admin";
  if (r === "child") return "child";
  return "member";
}

/**
 * Checks whether a given member ID corresponds to a child in the family list.
 */
export function isChildMember(memberId?: string | null, family?: FamilyMember[] | null): boolean {
  if (!memberId || !family) return false;
  const member = family.find((m) => m && m.id === memberId);
  return Boolean(member && getCanonicalFamilyRole(member.role) === "child");
}

/**
 * Reusable member-selection hook.
 * Returns [effectiveMemberId, setSelectedMemberId, activeFamilyMember].
 * Persists in local storage under `veedu:selected_member_id`.
 * 
 * Default Authenticated Experience:
 * - Fresh load / no stored preference: defaults to the primary authenticated FamilyMember (ME perspective).
 * - If no family or no primary member: defaults to undefined (Household).
 * - Explicit "household" selection: returns undefined (Household).
 * - Explicit member selection (e.g. child or spouse): returns that member's ID.
 * - NEVER defaults to a child automatically.
 */
export function useSelectedMember(): [
  string | undefined,
  (id: string | undefined) => void,
  FamilyMember | undefined
] {
  const [selectedId, setSelectedId] = useStore<string | undefined>(SELECTED_MEMBER_KEY, undefined);
  const [family] = useStore<FamilyMember[]>("family", []);
  const [profile] = useStore<{ name?: string }>("profile", {});

  const primaryMember = useMemo(
    () => getPrimaryFamilyMember(family, profile?.name),
    [family, profile?.name]
  );

  const activeMember = useMemo(() => {
    // If explicitly set to "household", user wants Household view
    if (selectedId === "household") {
      return undefined;
    }
    // If a specific valid member ID is selected
    if (selectedId) {
      const match = family.find((m) => m && m.id === selectedId);
      if (match) return match;
    }
    // If no preference stored (undefined): default to primary authenticated member
    if (selectedId === undefined) {
      return primaryMember;
    }
    return undefined;
  }, [selectedId, family, primaryMember]);

  const effectiveId = activeMember ? activeMember.id : undefined;

  const setMember = useCallback(
    (id: string | undefined) => {
      setSelectedId(id ? id : "household");
    },
    [setSelectedId]
  );

  return [effectiveId, setMember, activeMember];
}

/**
 * Extracts the authoritative assignee ID for a task, preferring `assignedTo` over legacy `assigneeId`.
 */
export function getTaskAssignee(task: { assignedTo?: string | undefined; assigneeId?: string | undefined } | null | undefined): string | undefined {
  if (!task) return undefined;
  return task.assignedTo ?? task.assigneeId ?? undefined;
}

/**
 * Extracts the authoritative owner ID for a routine, preferring `assignedTo` over `memberId`.
 */
export function getRoutineOwner(routine: { assignedTo?: string | undefined; memberId?: string | undefined } | null | undefined): string | undefined {
  if (!routine) return undefined;
  return routine.assignedTo ?? routine.memberId ?? undefined;
}

/**
 * Extracts the authoritative assignee ID for a routine step, preferring `assignedTo` over `assigneeId`.
 */
export function getRoutineStepAssignee(step: { assignedTo?: string | undefined; assigneeId?: string | undefined } | null | undefined): string | undefined {
  if (!step) return undefined;
  return step.assignedTo ?? step.assigneeId ?? undefined;
}

/**
 * Checks if a task is unassigned / household-wide.
 */
export function isTaskHousehold(task: { assignedTo?: string | undefined; assigneeId?: string | undefined }): boolean {
  return getTaskAssignee(task) === undefined;
}

/**
 * Checks if a task is assigned to a specific family member.
 */
export function isTaskAssignedTo(
  task: { assignedTo?: string | undefined; assigneeId?: string | undefined },
  memberId?: string | undefined
): boolean {
  const assignee = getTaskAssignee(task);
  if (!memberId) {
    return assignee === undefined;
  }
  return assignee === memberId;
}

export interface MemberFilterOptions {
  includeUnassigned?: boolean | undefined;
}

/**
 * Filters a list of tasks for a given member perspective:
 * - If memberId is undefined: returns all tasks (household aggregate view).
 * - If memberId is provided: returns tasks assigned to that member + unassigned/household tasks (if includeUnassigned is true, default true).
 */
export function filterTasksForMember<T extends { assignedTo?: string | undefined; assigneeId?: string | undefined }>(
  tasks: T[],
  memberId?: string | undefined,
  options?: MemberFilterOptions | undefined
): T[] {
  if (!memberId) return [...tasks];
  const includeUnassigned = options?.includeUnassigned ?? true;

  return tasks.filter((t) => {
    const assignee = getTaskAssignee(t);
    if (assignee === memberId) return true;
    if (includeUnassigned && assignee === undefined) return true;
    return false;
  });
}

/**
 * Filters a list of routines for a given member perspective:
 * - If memberId is undefined: returns all routines (household aggregate view).
 * - If memberId is provided: returns routines owned by that member, or with steps assigned to that member,
 *   or unassigned household routines (if includeUnassigned is true, default true).
 */
export function filterRoutinesForMember<
  T extends {
    assignedTo?: string | undefined;
    memberId?: string | undefined;
    steps?: { assignedTo?: string | undefined; assigneeId?: string | undefined }[] | undefined;
  }
>(
  routines: T[],
  memberId?: string | undefined,
  options?: MemberFilterOptions | undefined
): T[] {
  if (!memberId) return [...routines];
  const includeUnassigned = options?.includeUnassigned ?? true;

  return routines.filter((r) => {
    const owner = getRoutineOwner(r);
    if (owner === memberId) return true;

    const hasStepAssigned = (r.steps ?? []).some((s) => getRoutineStepAssignee(s) === memberId);
    if (hasStepAssigned) return true;

    // Household routine with no owner and no steps explicitly owned by other specific members
    if (includeUnassigned && owner === undefined) {
      const allStepsUnassignedOrSelf = (r.steps ?? []).every((s) => {
        const stepAssignee = getRoutineStepAssignee(s);
        return stepAssignee === undefined || stepAssignee === memberId;
      });
      if (allStepsUnassignedOrSelf) return true;
    }

    return false;
  });
}

/**
 * Filters calendar events for a member perspective.
 */
export function filterEventsForMember<T extends { assignedTo?: string | undefined; assigneeId?: string | undefined }>(
  events: T[],
  memberId?: string | undefined,
  options?: MemberFilterOptions | undefined
): T[] {
  if (!memberId) return [...events];
  const includeUnassigned = options?.includeUnassigned ?? true;

  return events.filter((e) => {
    const assignee = getTaskAssignee(e);
    if (assignee === memberId) return true;
    if (includeUnassigned && assignee === undefined) return true;
    return false;
  });
}

/** Returns only unassigned household tasks */
export function getHouseholdTasks<T extends { assignedTo?: string | undefined; assigneeId?: string | undefined }>(tasks: T[]): T[] {
  return tasks.filter(isTaskHousehold);
}

/** Returns tasks strictly assigned to a specific member */
export function getMemberTasks<T extends { assignedTo?: string | undefined; assigneeId?: string | undefined }>(tasks: T[], memberId: string): T[] {
  return tasks.filter((t) => getTaskAssignee(t) === memberId);
}

/** Returns only unassigned household routines */
export function getHouseholdRoutines<T extends { assignedTo?: string | undefined; memberId?: string | undefined }>(routines: T[]): T[] {
  return routines.filter((r) => getRoutineOwner(r) === undefined);
}

/** Returns routines owned by or with steps assigned to a specific member */
export function getMemberRoutines<
  T extends {
    assignedTo?: string | undefined;
    memberId?: string | undefined;
    steps?: { assignedTo?: string | undefined; assigneeId?: string | undefined }[] | undefined;
  }
>(routines: T[], memberId: string): T[] {
  return routines.filter((r) => {
    if (getRoutineOwner(r) === memberId) return true;
    return (r.steps ?? []).some((s) => getRoutineStepAssignee(s) === memberId);
  });
}

// -----------------------------------------------------------------------------
// MEMBER-SCOPED STORAGE INFRASTRUCTURE (H2.5-A)
// -----------------------------------------------------------------------------

export const MEMBER_PERSONAL_DOMAINS = [
  "salah",
  "fasting",
  "quran",
  "hifz",
  "habits",
  "water",
] as const;

export type MemberPersonalDomain = (typeof MEMBER_PERSONAL_DOMAINS)[number];

/**
 * Deterministic storage key generator for member-scoped personal data.
 * When passed to store methods, prefix `veedu:` is automatically applied,
 * resulting in `veedu:mem_<memberId>:<domain>`.
 */
export function getMemberStoreKey(memberId: string, domain: string): string {
  const cleanId = memberId.startsWith("mem_") ? memberId.slice(4) : memberId;
  return `mem_${cleanId}:${domain}`;
}

/**
 * Resolves the authenticated user's primary FamilyMember record.
 * Prioritizes:
 * 1. Matching profile name against an admin / parent or existing member.
 * 2. First member with canonical 'admin' role.
 * 3. First member in family list.
 */
export function getPrimaryFamilyMember(
  family?: FamilyMember[] | null,
  profileName?: string | null
): FamilyMember | undefined {
  if (!family || family.length === 0) return undefined;

  if (profileName && profileName.trim()) {
    const norm = profileName.trim().toLowerCase();
    // 1. Try matching admin/parent first
    const adminNameMatch = family.find(
      (m) =>
        m &&
        m.name &&
        m.name.trim().toLowerCase() === norm &&
        getCanonicalFamilyRole(m.role) === "admin"
    );
    if (adminNameMatch) return adminNameMatch;

    // 2. Try matching any adult/non-child member by name
    const adultNameMatch = family.find(
      (m) =>
        m &&
        m.name &&
        m.name.trim().toLowerCase() === norm &&
        getCanonicalFamilyRole(m.role) !== "child"
    );
    if (adultNameMatch) return adultNameMatch;

    // 3. Try matching any member by name
    const anyNameMatch = family.find(
      (m) => m && m.name && m.name.trim().toLowerCase() === norm
    );
    if (anyNameMatch) return anyNameMatch;
  }

  // 4. Fallback to first admin
  const firstAdmin = family.find(
    (m) => m && getCanonicalFamilyRole(m.role) === "admin"
  );
  if (firstAdmin) return firstAdmin;

  // 5. Fallback to first adult/non-child member
  const firstAdult = family.find(
    (m) => m && getCanonicalFamilyRole(m.role) !== "child"
  );
  if (firstAdult) return firstAdult;

  // Fallback to first member ONLY if no children in household or standalone
  const nonChildFallback = family.find((m) => getCanonicalFamilyRole(m.role) !== "child");
  return nonChildFallback;
}

/**
 * Convenience helper to get primary member ID.
 */
export function getPrimaryMemberId(
  family?: FamilyMember[] | null,
  profileName?: string | null
): string | undefined {
  return getPrimaryFamilyMember(family, profileName)?.id;
}

/**
 * Reads a member-scoped store directly (SSR-safe, local-first).
 * If memberId is undefined (Household), returns fallback.
 */
export function readMemberStore<T>(
  domain: string,
  memberId: string | undefined,
  fallback: T
): T {
  if (!memberId || typeof window === "undefined") return fallback;
  const key = getMemberStoreKey(memberId, domain);
  try {
    const raw = window.localStorage.getItem(`veedu:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Writes to a member-scoped store directly.
 */
export function writeMemberStore<T>(
  domain: string,
  memberId: string | undefined,
  value: T
): void {
  if (!memberId || typeof window === "undefined") return;
  const key = getMemberStoreKey(memberId, domain);
  try {
    window.localStorage.setItem(`veedu:${key}`, JSON.stringify(value));
  } catch {
    /* quota — keep working in memory */
  }
}

/**
 * Reactive, hydration-safe persisted hook for member-scoped personal data.
 * - When `memberId === undefined` (Household view): strictly isolates and returns `fallback`.
 * - When `memberId` is provided: reactively loads and updates `veedu:mem_<memberId>:<domain>`.
 */
export function useMemberStore<T>(
  domain: string,
  memberId: string | undefined,
  fallback: T
): readonly [T, (next: T | ((prev: T) => T)) => void, boolean] {
  const effectiveKey = memberId ? getMemberStoreKey(memberId, domain) : `__noop__:${domain}`;
  const [storeVal, setStoreVal, ready] = useStore<T>(effectiveKey, fallback);

  const value = memberId !== undefined ? storeVal : fallback;

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      if (!memberId) return;
      setStoreVal(next);
    },
    [memberId, setStoreVal]
  );

  return [value, update, ready] as const;
}

// -----------------------------------------------------------------------------
// DOMAIN-SPECIFIC MEMBER HOOKS
// -----------------------------------------------------------------------------

export type SalahLog = Record<string, Record<string, "ontime" | "late">>;

export function useMemberSalah(memberId?: string) {
  return useMemberStore<SalahLog>("salah", memberId, {});
}

export function useMemberHifz(memberId?: string) {
  return useMemberStore<any[]>("hifz", memberId, []);
}

export function useMemberHabits(memberId?: string) {
  return useMemberStore<{ id: string; name: string; days: string[] }[]>("habits", memberId, []);
}

export function useMemberFasting(memberId?: string) {
  return useMemberStore<Record<string, string>>("fasting", memberId, {});
}

export function useMemberWater(memberId?: string) {
  return useMemberStore<Record<string, { water: number }>>("water", memberId, {});
}

export function useMemberCheckins(memberId?: string) {
  return useMemberStore<Record<string, string>>("checkins", memberId, {});
}

/**
 * Idempotently migrates legacy unpartitioned global personal data
 * into the primary member's scoped store partition.
 * Child members and other household members remain completely untouched.
 * Legacy global keys are preserved for backward compatibility and rollback safety.
 */
export function migrateMemberStores(primaryMemberId: string): void {
  if (typeof window === "undefined" || !primaryMemberId) return;

  // 1. Salah
  const salahKey = `veedu:${getMemberStoreKey(primaryMemberId, "salah")}`;
  if (!window.localStorage.getItem(salahKey)) {
    const legacy = window.localStorage.getItem("veedu:salah");
    if (legacy) window.localStorage.setItem(salahKey, legacy);
  }

  // 2. Fasting
  const fastingKey = `veedu:${getMemberStoreKey(primaryMemberId, "fasting")}`;
  if (!window.localStorage.getItem(fastingKey)) {
    const legacy = window.localStorage.getItem("veedu:fasting");
    if (legacy) window.localStorage.setItem(fastingKey, legacy);
  }

  // 3. Hifz
  const hifzKey = `veedu:${getMemberStoreKey(primaryMemberId, "hifz")}`;
  if (!window.localStorage.getItem(hifzKey)) {
    const legacy = window.localStorage.getItem("veedu:hifz");
    if (legacy) window.localStorage.setItem(hifzKey, legacy);
  }

  // 4. Habits
  const habitsKey = `veedu:${getMemberStoreKey(primaryMemberId, "habits")}`;
  if (!window.localStorage.getItem(habitsKey)) {
    const legacy = window.localStorage.getItem("veedu:habits");
    if (legacy) window.localStorage.setItem(habitsKey, legacy);
  }

  // 5. Water (extracted cleanly from legacy health without moving adult health records)
  const waterKey = `veedu:${getMemberStoreKey(primaryMemberId, "water")}`;
  if (!window.localStorage.getItem(waterKey)) {
    const legacyHealthRaw = window.localStorage.getItem("veedu:health");
    if (legacyHealthRaw) {
      try {
        const legacyHealth = JSON.parse(legacyHealthRaw) as Record<string, { water?: number }>;
        const waterRecord: Record<string, { water: number }> = {};
        let hasWater = false;
        for (const [date, val] of Object.entries(legacyHealth)) {
          if (val && typeof val.water === "number") {
            waterRecord[date] = { water: val.water };
            hasWater = true;
          }
        }
        if (hasWater) {
          window.localStorage.setItem(waterKey, JSON.stringify(waterRecord));
        }
      } catch {
        /* ignore parse error */
      }
    }
  }
}

/**
 * Migration hook.
 * 1. If user has kids data but no family data, migrates into family model.
 * 2. Migrates primary member personal stores to member-scoped partitions.
 */
export function useFamilyMigration() {
  const [kids] = useStore<any[]>("kids", []);
  const [family, setFamily] = useStore<FamilyMember[]>("family", []);
  const [profile] = useStore<{ name?: string }>("profile", {});

  useEffect(() => {
    let effectiveFamily = family;
    if (kids.length > 0 && family.length === 0) {
      const migrated: FamilyMember[] = kids.map((k) => ({
        id: k.id,
        name: k.name,
        role: "child",
        age: k.age || "",
        chores: k.chores || [],
      }));
      setFamily(migrated);
      effectiveFamily = migrated;
    }

    if (effectiveFamily.length > 0) {
      const primary = getPrimaryFamilyMember(effectiveFamily, profile?.name);
      if (primary) {
        migrateMemberStores(primary.id);
      }
    }
  }, [kids, family, profile?.name, setFamily]);
}
