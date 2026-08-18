import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  type FamilyMember,
  type FamilyRole,
  type CanonicalFamilyRole,
  getCanonicalFamilyRole,
  isChildMember,
  getTaskAssignee,
  getRoutineOwner,
  getRoutineStepAssignee,
  isTaskHousehold,
  isTaskAssignedTo,
  filterTasksForMember,
  filterRoutinesForMember,
  filterEventsForMember,
  getHouseholdTasks,
  getMemberTasks,
  getHouseholdRoutines,
  getMemberRoutines,
  getMemberStoreKey,
  getAuthenticatedFamilyMember,
  migrateAuthFamilyMemberLink,
  ensurePrimaryFamilyMember,
  getPrimaryFamilyMember,
  getPrimaryMemberId,
  readMemberStore,
  writeMemberStore,
  migrateMemberStores,
  MEMBER_PERSONAL_DOMAINS,
  resetSelectedMember,
  SELECTED_MEMBER_KEY,
} from "./family-model";
import { createRoutine } from "./routine-engine";
import { buildDailyThread, type DailySurfaceData, type TaskRecord, type CalEventRecord } from "./daily-surface";
import { buildDayRhythmFromSurfaceData } from "./rhythm-engine";

describe("Wave 2.0-A — Family Roles & Responsibility Assignment", () => {
  // ---------------------------------------------------------------------------
  // 1. FAMILY MEMBER ROLES
  // ---------------------------------------------------------------------------
  test("Family Roles — canonical resolution, typed representation & default mapping", () => {
    // Canonical roles
    assert.equal(getCanonicalFamilyRole("admin"), "admin");
    assert.equal(getCanonicalFamilyRole("member"), "member");
    assert.equal(getCanonicalFamilyRole("child"), "child");

    // Legacy role backward-compatibility
    assert.equal(getCanonicalFamilyRole("parent"), "admin");
    assert.equal(getCanonicalFamilyRole("other"), "member");
    assert.equal(getCanonicalFamilyRole(undefined), "member");
    assert.equal(getCanonicalFamilyRole(null), "member");
    assert.equal(getCanonicalFamilyRole(""), "member");

    // Typed FamilyMember structures
    const adminMember: FamilyMember = {
      id: "mem_admin",
      name: "Ameen",
      role: "admin",
      color: "#2b5a45",
      chores: [],
    };

    const generalMember: FamilyMember = {
      id: "mem_general",
      name: "Fatima",
      role: "member",
      color: "#b45309",
      chores: [],
    };

    const childMember: FamilyMember = {
      id: "mem_child",
      name: "Yusuf",
      role: "child",
      age: "6",
      color: "#3b82f6",
      chores: [{ id: "c1", title: "Tidy toys", done: false }],
    };

    // Legacy member
    const legacyMember: FamilyMember = {
      id: "mem_legacy",
      name: "Grandpa",
      role: "parent",
      chores: [],
    };

    assert.equal(adminMember.role, "admin");
    assert.equal(generalMember.role, "member");
    assert.equal(childMember.role, "child");
    assert.equal(getCanonicalFamilyRole(legacyMember.role), "admin");
  });

  // ---------------------------------------------------------------------------
  // 2. TASK ASSIGNMENT & NORMALIZATION
  // ---------------------------------------------------------------------------
  test("Task Assignment — assignedTo priority, fallback to assigneeId & household semantics", () => {
    const unassignedTask: TaskRecord = {
      id: "t_unassigned",
      title: "Buy groceries for house",
    };

    const newAssignedTask: TaskRecord = {
      id: "t_assigned",
      title: "Pick up dry cleaning",
      assignedTo: "mem_ameen",
    };

    const legacyAssignedTask: TaskRecord = {
      id: "t_legacy",
      title: "Fix kitchen faucet",
      assigneeId: "mem_fatima",
    };

    const bothAssignedTask: TaskRecord = {
      id: "t_both",
      title: "Prepare guest room",
      assignedTo: "mem_yusuf",
      assigneeId: "mem_ameen", // assignedTo takes precedence
    };

    // Assignee normalization
    assert.equal(getTaskAssignee(unassignedTask), undefined);
    assert.equal(getTaskAssignee(newAssignedTask), "mem_ameen");
    assert.equal(getTaskAssignee(legacyAssignedTask), "mem_fatima");
    assert.equal(getTaskAssignee(bothAssignedTask), "mem_yusuf");

    // Household semantics
    assert.equal(isTaskHousehold(unassignedTask), true);
    assert.equal(isTaskHousehold(newAssignedTask), false);
    assert.equal(isTaskHousehold(legacyAssignedTask), false);

    // Explicit assignment check
    assert.equal(isTaskAssignedTo(unassignedTask, undefined), true);
    assert.equal(isTaskAssignedTo(unassignedTask, "mem_ameen"), false);
    assert.equal(isTaskAssignedTo(newAssignedTask, "mem_ameen"), true);
    assert.equal(isTaskAssignedTo(newAssignedTask, "mem_fatima"), false);
    assert.equal(isTaskAssignedTo(legacyAssignedTask, "mem_fatima"), true);
  });

  // ---------------------------------------------------------------------------
  // 3. ROUTINE ASSIGNMENT & NORMALIZATION
  // ---------------------------------------------------------------------------
  test("Routine Assignment — routine owner & step assignee normalization", () => {
    const householdRoutine = createRoutine({
      id: "rt_house",
      name: "Family Fajr & Adhkar",
      steps: [
        { id: "s1", title: "Wake up" },
        { id: "s2", title: "Recite Adhkar together" },
      ],
    });

    const memberOwnedRoutine = createRoutine({
      id: "rt_yusuf",
      name: "Yusuf School Morning",
      assignedTo: "mem_yusuf",
      steps: [
        { id: "s1", title: "Brush teeth" },
        { id: "s2", title: "Uniform on" },
      ],
    });

    const multiAssigneeRoutine = createRoutine({
      id: "rt_multi",
      name: "Evening Kitchen Reset",
      steps: [
        { id: "s1", title: "Clear dining table", assignedTo: "mem_yusuf" },
        { id: "s2", title: "Load dishwasher", assigneeId: "mem_fatima" }, // legacy fallback
      ],
    });

    assert.equal(getRoutineOwner(householdRoutine), undefined);
    assert.equal(getRoutineOwner(memberOwnedRoutine), "mem_yusuf");
    assert.equal(getRoutineStepAssignee(multiAssigneeRoutine.steps[0]), "mem_yusuf");
    assert.equal(getRoutineStepAssignee(multiAssigneeRoutine.steps[1]), "mem_fatima");
  });

  // ---------------------------------------------------------------------------
  // 4. FILTERING API — TASKS, ROUTINES & EVENTS
  // ---------------------------------------------------------------------------
  test("Filtering API — household aggregate view vs member-specific view", () => {
    const tasks: TaskRecord[] = [
      { id: "t1", title: "Household milk" }, // unassigned
      { id: "t2", title: "Ameen work task", assignedTo: "mem_ameen" },
      { id: "t3", title: "Fatima clinic appointment", assignedTo: "mem_fatima" },
      { id: "t4", title: "Yusuf homework", assigneeId: "mem_yusuf" }, // legacy assigneeId
    ];

    const routines = [
      createRoutine({
        id: "r_shared",
        name: "Shared Household Morning",
        steps: [{ title: "Fajr" }],
      }),
      createRoutine({
        id: "r_ameen",
        name: "Ameen Gym",
        assignedTo: "mem_ameen",
        steps: [{ title: "Workout" }],
      }),
      createRoutine({
        id: "r_yusuf",
        name: "Yusuf Bedtime",
        assignedTo: "mem_yusuf",
        steps: [{ title: "Surah Mulk" }],
      }),
    ];

    // Household view (memberId: undefined) returns all items
    assert.equal(filterTasksForMember(tasks, undefined).length, 4);
    assert.equal(filterRoutinesForMember(routines, undefined).length, 3);
    assert.equal(getHouseholdTasks(tasks).length, 1);
    assert.equal(getHouseholdTasks(tasks)[0]?.id, "t1");
    assert.equal(getHouseholdRoutines(routines).length, 1);
    assert.equal(getHouseholdRoutines(routines)[0]?.id, "r_shared");

    // Member view for Ameen (includes assigned to Ameen + unassigned household tasks)
    const ameenTasks = filterTasksForMember(tasks, "mem_ameen");
    assert.equal(ameenTasks.length, 2);
    assert.ok(ameenTasks.some((t) => t.id === "t1")); // household
    assert.ok(ameenTasks.some((t) => t.id === "t2")); // Ameen's
    assert.ok(!ameenTasks.some((t) => t.id === "t3")); // Fatima's excluded
    assert.ok(!ameenTasks.some((t) => t.id === "t4")); // Yusuf's excluded

    // Strict member tasks (only assigned to Ameen)
    const ameenStrict = getMemberTasks(tasks, "mem_ameen");
    assert.equal(ameenStrict.length, 1);
    assert.equal(ameenStrict[0]?.id, "t2");

    // Member view for Yusuf (legacy assigneeId is handled properly)
    const yusufTasks = filterTasksForMember(tasks, "mem_yusuf");
    assert.equal(yusufTasks.length, 2);
    assert.ok(yusufTasks.some((t) => t.id === "t1")); // household
    assert.ok(yusufTasks.some((t) => t.id === "t4")); // Yusuf's

    // Member routines for Ameen
    const ameenRoutines = filterRoutinesForMember(routines, "mem_ameen");
    assert.equal(ameenRoutines.length, 2);
    assert.ok(ameenRoutines.some((r) => r.id === "r_shared"));
    assert.ok(ameenRoutines.some((r) => r.id === "r_ameen"));
    assert.ok(!ameenRoutines.some((r) => r.id === "r_yusuf"));

    // Member routines strict
    const ameenRoutinesStrict = getMemberRoutines(routines, "mem_ameen");
    assert.equal(ameenRoutinesStrict.length, 1);
    assert.equal(ameenRoutinesStrict[0]?.id, "r_ameen");
  });

  // ---------------------------------------------------------------------------
  // 5. DAILY SURFACE & RHYTHM ENGINE PREPARATION
  // ---------------------------------------------------------------------------
  test("Daily Surface & Rhythm Engine — member-scoped DayRhythm and DailyThread", () => {
    const prayers = [
      { id: "fajr", name: "Fajr", time: "05:15" },
      { id: "dhuhr", name: "Dhuhr", time: "12:30" },
      { id: "asr", name: "Asr", time: "15:45" },
      { id: "maghrib", name: "Maghrib", time: "18:30" },
      { id: "isha", name: "Isha", time: "19:45" },
    ];

    const today = "2026-08-18";

    const tasks: TaskRecord[] = [
      { id: "t_shared", title: "Common Household Water Filters", date: today },
      { id: "t_ameen", title: "Ameen Audit Documents", date: today, assignedTo: "mem_ameen" },
      { id: "t_fatima", title: "Fatima Dental Checkup", date: today, assignedTo: "mem_fatima" },
    ];

    const routines = [
      createRoutine({
        id: "rt_shared",
        name: "Morning Family Adhkar",
        relativeAnchor: "afterFajr",
        steps: [{ title: "Adhkar" }],
      }),
      createRoutine({
        id: "rt_fatima",
        name: "Fatima Morning Study",
        relativeAnchor: "afterFajr",
        assignedTo: "mem_fatima",
        steps: [{ title: "Study" }],
      }),
    ];

    const baseData: DailySurfaceData = {
      now: new Date("2026-08-18T08:00:00"),
      profile: { name: "Ameen" },
      prayers,
      nextPrayer: { next: { name: "Dhuhr", time: "12:30" }, hours: 4, mins: 30 },
      salahLog: {},
      hifzItems: [],
      isRamadan: false,
      ramadanDay: null,
      tasks,
      events: [
        { id: "ev_shared", title: "Family Dinner", date: today },
        { id: "ev_fatima", title: "Fatima Conference", date: today, assignedTo: "mem_fatima" },
      ],
      meals: {},
      grocery: [],
      habits: [],
      health: {},
      checkins: {},
      expenses: [],
      limits: {},
      routines,
    };

    // 1. Household DayRhythm (no memberId specified)
    const householdRhythm = buildDayRhythmFromSurfaceData(baseData);
    const householdItems = householdRhythm.blocks.flatMap((b) => b.items);
    assert.ok(householdItems.some((i) => i.id === "task-t_shared"));
    assert.ok(householdItems.some((i) => i.id === "task-t_ameen"));
    assert.ok(householdItems.some((i) => i.id === "task-t_fatima"));
    assert.ok(householdItems.some((i) => i.id === "routine-rt_shared"));
    assert.ok(householdItems.some((i) => i.id === "routine-rt_fatima"));

    // 2. Ameen-scoped DayRhythm (memberId: "mem_ameen")
    const ameenSurfaceData: DailySurfaceData = {
      ...baseData,
      memberId: "mem_ameen",
    };

    const ameenRhythm = buildDayRhythmFromSurfaceData(ameenSurfaceData);
    const ameenItems = ameenRhythm.blocks.flatMap((b) => b.items);

    assert.ok(ameenItems.some((i) => i.id === "task-t_shared"), "Household task is visible to Ameen");
    assert.ok(ameenItems.some((i) => i.id === "task-t_ameen"), "Ameen's task is visible to Ameen");
    assert.equal(ameenItems.some((i) => i.id === "task-t_fatima"), false, "Fatima's task is excluded from Ameen's view");
    assert.ok(ameenItems.some((i) => i.id === "routine-rt_shared"), "Household routine is visible to Ameen");
    assert.equal(ameenItems.some((i) => i.id === "routine-rt_fatima"), false, "Fatima's routine is excluded from Ameen's view");

    // 3. Ameen Daily Thread
    const ameenThread = buildDailyThread(ameenSurfaceData, today, ameenRhythm);
    assert.ok(ameenThread.some((i) => i.id === "task-t_shared"));
    assert.ok(ameenThread.some((i) => i.id === "task-t_ameen"));
    assert.equal(ameenThread.some((i) => i.id === "task-t_fatima"), false);
    assert.ok(ameenThread.some((i) => i.id === "event-ev_shared"));
    assert.equal(ameenThread.some((i) => i.id === "event-ev_fatima"), false);
  });

  // ---------------------------------------------------------------------------
  // 6. SERIALIZATION & BACKUP INTEGRITY
  // ---------------------------------------------------------------------------
  test("Serialization — JSON backup roundtrip and persistence safety", () => {
    const member: FamilyMember = {
      id: "mem_roundtrip",
      name: "Maryam",
      role: "child",
      age: "8",
      color: "#ec4899",
      chores: [{ id: "c_1", title: "Fold prayer mats", done: true }],
    };

    const task: TaskRecord = {
      id: "t_roundtrip",
      title: "Memorize Ayah 255",
      assignedTo: "mem_roundtrip",
      scheduleMode: "relativePrayer",
      relativeAnchor: "afterFajr",
    };

    const serializedMember = JSON.parse(JSON.stringify(member));
    const serializedTask = JSON.parse(JSON.stringify(task));

    assert.equal(serializedMember.id, "mem_roundtrip");
    assert.equal(serializedMember.role, "child");
    assert.equal(serializedTask.assignedTo, "mem_roundtrip");
    assert.equal(getTaskAssignee(serializedTask), "mem_roundtrip");
    assert.equal(getCanonicalFamilyRole(serializedMember.role), "child");
  });

  // ---------------------------------------------------------------------------
  // 7. WAVE 2.0-B: PER-MEMBER DAILY SURFACE & PERSPECTIVE SWITCHING
  // ---------------------------------------------------------------------------
  test("Wave 2.0-B — Household View vs Member View vs Child View Filtering", () => {
    const today = "2026-08-18";
    const prayers = [
      { id: "fajr", name: "Fajr", time: "05:15" },
      { id: "dhuhr", name: "Dhuhr", time: "12:30" },
      { id: "asr", name: "Asr", time: "15:45" },
      { id: "maghrib", name: "Maghrib", time: "18:30" },
      { id: "isha", name: "Isha", time: "19:45" },
    ];

    const family: FamilyMember[] = [
      { id: "m_admin", name: "Ameen", role: "admin", chores: [] },
      { id: "m_member", name: "Fatima", role: "member", chores: [] },
      { id: "m_child", name: "Yusuf", role: "child", age: "9", chores: [] },
      { id: "m_empty", name: "Guest", role: "other", chores: [] },
    ];

    assert.equal(isChildMember("m_child", family), true);
    assert.equal(isChildMember("m_admin", family), false);
    assert.equal(isChildMember("m_member", family), false);
    assert.equal(isChildMember(undefined, family), false);

    const tasks: TaskRecord[] = [
      { id: "t_unassigned", title: "Clean living room window", date: today }, // household
      { id: "t_admin", title: "Review quarterly tax invoice", date: today, assignedTo: "m_admin" },
      { id: "t_fatima", title: "Purchase pharmacy supplies", date: today, assignedTo: "m_member" },
      {
        id: "t_child_pr",
        title: "Yusuf Quran revision",
        date: today,
        assignedTo: "m_child",
        scheduleMode: "relativePrayer",
        relativeAnchor: "afterFajr",
      },
    ];

    const events: CalEventRecord[] = [
      { id: "ev_shared", title: "Family Dinner", date: today },
      { id: "ev_admin", title: "Ameen Work Meeting", date: today, assignedTo: "m_admin" },
      { id: "ev_child", title: "Yusuf Karate Class", date: today, assignedTo: "m_child" },
    ];

    const routines = [
      createRoutine({
        id: "r_shared",
        name: "Morning Family Adhkar",
        relativeAnchor: "afterFajr",
        steps: [{ title: "Dua" }],
      }),
      createRoutine({
        id: "r_admin",
        name: "Ameen Fitness Routine",
        assignedTo: "m_admin",
        steps: [{ title: "Pushups" }],
      }),
      createRoutine({
        id: "r_multi",
        name: "Evening Kitchen Cleanup",
        steps: [
          { title: "Wipe Counters", assignedTo: "m_member" },
          { title: "Put away toys", assignedTo: "m_child" },
        ],
      }),
    ];

    // Data with expenses causing budget alert (>80% of limit)
    const baseData: DailySurfaceData = {
      now: new Date("2026-08-18T08:00:00"),
      profile: { name: "Household", city: "Kozhikode" },
      prayers,
      nextPrayer: { next: { name: "Dhuhr", time: "12:30" }, hours: 4, mins: 30 },
      salahLog: {},
      hifzItems: [],
      isRamadan: false,
      ramadanDay: null,
      tasks,
      events,
      meals: { "Tue-Dinner": "Biryani" },
      grocery: [{ id: "g1", name: "Rice", got: false }],
      habits: [],
      health: { [today]: { water: 4 } },
      checkins: {},
      expenses: [{ amount: 900, category: "Home", date: "2026-08-10" }],
      limits: { Home: 1000 }, // 90% spent -> triggers budget alert for adults
      routines,
      familyMembers: family,
    };

    // 1. Household Perspective (memberId: undefined)
    const householdRhythm = buildDayRhythmFromSurfaceData({ ...baseData, memberId: undefined });
    const householdRhythmItems = householdRhythm.blocks.flatMap((b) => b.items);
    assert.ok(householdRhythmItems.some((i) => i.id === "task-t_unassigned"), "Household task present in household rhythm");
    assert.ok(householdRhythmItems.some((i) => i.id === "task-t_admin"), "Admin task present in household rhythm");
    assert.ok(householdRhythmItems.some((i) => i.id === "task-t_fatima"), "Fatima task present in household rhythm");
    assert.ok(householdRhythmItems.some((i) => i.id === "task-t_child_pr"), "Child prayer-relative task present in household rhythm");

    const householdThread = buildDailyThread({ ...baseData, memberId: undefined }, today, householdRhythm);
    assert.ok(householdThread.some((i) => i.id === "task-t_unassigned"), "Household task present in household thread");
    assert.ok(householdThread.some((i) => i.id === "event-ev_shared"), "Shared event present in household thread");
    assert.ok(householdThread.some((i) => i.id === "event-ev_admin"), "Admin event present in household thread");
    assert.ok(householdThread.some((i) => i.id === "budget-alert"), "Budget alert present in household/adult view");

    // 2. Admin Perspective (memberId: "m_admin")
    const adminThread = buildDailyThread({ ...baseData, memberId: "m_admin" });
    assert.ok(adminThread.some((i) => i.id === "task-t_unassigned"), "Household unassigned task visible to admin");
    assert.ok(adminThread.some((i) => i.id === "task-t_admin"), "Admin task visible to admin");
    assert.equal(adminThread.some((i) => i.id === "task-t_fatima"), false, "Fatima task excluded from admin view");
    assert.equal(adminThread.some((i) => i.id === "task-t_child_pr"), false, "Child task excluded from admin view");
    assert.ok(adminThread.some((i) => i.id === "budget-alert"), "Budget alert visible to admin");

    // 3. Child Perspective (memberId: "m_child")
    const childThread = buildDailyThread({ ...baseData, memberId: "m_child" });
    assert.ok(childThread.some((i) => i.id === "task-t_unassigned"), "Household unassigned task visible to child");
    assert.ok(childThread.some((i) => i.id === "task-t_child_pr"), "Child task visible to child");
    assert.equal(childThread.some((i) => i.id === "task-t_admin"), false, "Admin adult task excluded from child view");
    assert.equal(childThread.some((i) => i.id === "task-t_fatima"), false, "Fatima task excluded from child view");
    assert.ok(childThread.some((i) => i.id === "event-ev_child"), "Child event visible to child");
    assert.equal(childThread.some((i) => i.id === "event-ev_admin"), false, "Admin adult event excluded from child view");
    // Child privacy protection: budget alerts must NEVER appear in child view
    assert.equal(childThread.some((i) => i.id === "budget-alert"), false, "Budget alert suppressed for child");

    // 4. Multi-Member Shared Routine Step Filtering
    const fatimaThread = buildDailyThread({ ...baseData, memberId: "m_member" });
    assert.ok(fatimaThread.some((i) => i.id === "routine-r_multi"), "Multi-assignee routine visible to member who has a step");
    assert.ok(childThread.some((i) => i.id === "routine-r_multi"), "Multi-assignee routine visible to child who has a step");
    assert.equal(fatimaThread.some((i) => i.id === "routine-r_admin"), false, "Admin-only routine excluded from Fatima");

    // 5. Member with Zero Personal Assignments
    const emptyMemberThread = buildDailyThread({ ...baseData, memberId: "m_empty" });
    assert.ok(emptyMemberThread.some((i) => i.id === "task-t_unassigned"), "Household tasks visible to empty member");
    assert.equal(emptyMemberThread.some((i) => i.id === "task-t_admin"), false);
    assert.equal(emptyMemberThread.some((i) => i.id === "task-t_fatima"), false);
    assert.equal(emptyMemberThread.some((i) => i.id === "task-t_child_pr"), false);

    // 6. Data Immutability Guarantee: Switching perspectives does NOT mutate domain arrays or objects
    const tasksSnapshot = JSON.stringify(tasks);
    const routinesSnapshot = JSON.stringify(routines);
    const eventsSnapshot = JSON.stringify(events);

    buildDailyThread({ ...baseData, memberId: "m_admin" });
    buildDailyThread({ ...baseData, memberId: "m_child" });
    buildDailyThread({ ...baseData, memberId: undefined });

    assert.equal(JSON.stringify(tasks), tasksSnapshot, "Tasks array remained immutable across switches");
    assert.equal(JSON.stringify(routines), routinesSnapshot, "Routines array remained immutable across switches");
    assert.equal(JSON.stringify(events), eventsSnapshot, "Events array remained immutable across switches");
  });

  test("Wave 2.0-B — Prayer-Relative Task Placement in DayRhythm Across Perspectives", () => {
    const today = "2026-08-18";
    const prayers = [
      { id: "fajr", name: "Fajr", time: "05:15" },
      { id: "dhuhr", name: "Dhuhr", time: "12:30" },
      { id: "asr", name: "Asr", time: "15:45" },
      { id: "maghrib", name: "Maghrib", time: "18:30" },
      { id: "isha", name: "Isha", time: "19:45" },
    ];

    const tasks: TaskRecord[] = [
      {
        id: "t_yusuf_fajr",
        title: "Morning Quran Hifz",
        date: today,
        assignedTo: "mem_yusuf",
        scheduleMode: "relativePrayer",
        relativeAnchor: "afterFajr",
      },
      {
        id: "t_ameen_dhuhr",
        title: "Dhuhr Family Work Break",
        date: today,
        assignedTo: "mem_ameen",
        scheduleMode: "relativePrayer",
        relativeAnchor: "afterDhuhr",
      },
    ];

    const rhythmYusuf = buildDayRhythmFromSurfaceData({
      now: new Date("2026-08-18T08:00:00"),
      profile: { name: "Yusuf" },
      prayers,
      nextPrayer: null,
      salahLog: {},
      hifzItems: [],
      isRamadan: false,
      ramadanDay: null,
      tasks,
      events: [],
      meals: {},
      grocery: [],
      habits: [],
      health: {},
      checkins: {},
      expenses: [],
      limits: {},
      memberId: "mem_yusuf",
    });

    const morningItems = rhythmYusuf.blocks.find((b) => b.id === "morning")?.items ?? [];
    const afternoonItems = rhythmYusuf.blocks.find((b) => b.id === "afternoon")?.items ?? [];

    assert.ok(morningItems.some((i) => i.id === "task-t_yusuf_fajr"), "Yusuf afterFajr task placed in Morning block");
    assert.equal(afternoonItems.some((i) => i.id === "task-t_ameen_dhuhr"), false, "Ameen task excluded from Yusuf rhythm");
  });
});

describe("Wave H2.5-A — Member Data Ownership & Local Partitioning", () => {
  const mockFamily: FamilyMember[] = [
    { id: "mem_shahid", name: "Shahid", role: "admin", chores: [] },
    { id: "mem_fatima", name: "Fatima", role: "member", chores: [] },
    { id: "mem_usman", name: "Usman", role: "child", age: "7", chores: [] },
  ];

  // Mock localStorage in Node test environment
  const mockStorage = new Map<string, string>();
  const originalWindow = globalThis.window;

  // Setup mock window before tests
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => mockStorage.get(key) ?? null,
      setItem: (key: string, val: string) => mockStorage.set(key, val),
      removeItem: (key: string) => mockStorage.delete(key),
      clear: () => mockStorage.clear(),
    } as any,
  } as any;

  test("1. Member key generation — deterministic naming", () => {
    assert.equal(getMemberStoreKey("mem_usman", "salah"), "mem_usman:salah");
    assert.equal(getMemberStoreKey("mem_shahid", "hifz"), "mem_shahid:hifz");
    assert.equal(getMemberStoreKey("mem_usman", "habits"), "mem_usman:habits");
    assert.equal(getMemberStoreKey("mem_usman", "water"), "mem_usman:water");
    assert.equal(getMemberStoreKey("mem_usman", "fasting"), "mem_usman:fasting");
  });

  test("2. Primary member resolution — name match, admin fallback, list fallback", () => {
    // Exact name match to admin
    const primaryByName = getPrimaryFamilyMember(mockFamily, "Shahid");
    assert.equal(primaryByName?.id, "mem_shahid");

    // Case-insensitive name match
    const primaryCase = getPrimaryFamilyMember(mockFamily, "shahid");
    assert.equal(primaryCase?.id, "mem_shahid");

    // No profile name provided -> falls back to first admin
    const primaryAdmin = getPrimaryFamilyMember(mockFamily, undefined);
    assert.equal(primaryAdmin?.id, "mem_shahid");

    // No admin in list -> falls back to first member
    const nonAdminFamily: FamilyMember[] = [
      { id: "mem_a", name: "A", role: "member", chores: [] },
      { id: "mem_b", name: "B", role: "member", chores: [] },
    ];
    assert.equal(getPrimaryFamilyMember(nonAdminFamily, "")?.id, "mem_a");

    // Empty list
    assert.equal(getPrimaryFamilyMember([], "Shahid"), undefined);
    assert.equal(getPrimaryMemberId(mockFamily, "Shahid"), "mem_shahid");
  });

  test("3. Father member store isolation & writing adult data", () => {
    mockStorage.clear();
    const fatherSalah = { "2026-08-18": { fajr: "ontime", dhuhr: "ontime" } };
    writeMemberStore("salah", "mem_shahid", fatherSalah);

    const readBack = readMemberStore<any>("salah", "mem_shahid", {});
    assert.deepEqual(readBack, fatherSalah);

    // Verify key in storage
    assert.ok(mockStorage.has("veedu:mem_shahid:salah"));
  });

  test("4. Child member store isolation & empty child stores", () => {
    // Child starts with clean empty partition
    const childSalah = readMemberStore<any>("salah", "mem_usman", {});
    assert.deepEqual(childSalah, {});

    const childHifz = readMemberStore<any[]>("hifz", "mem_usman", []);
    assert.deepEqual(childHifz, []);

    const childHabits = readMemberStore<any[]>("habits", "mem_usman", []);
    assert.deepEqual(childHabits, []);
  });

  test("5. Writing child Salah does NOT mutate father Salah", () => {
    mockStorage.clear();
    const fatherSalah = { "2026-08-18": { fajr: "ontime", dhuhr: "ontime", asr: "ontime", maghrib: "ontime", isha: "ontime" } };
    const usmanSalah = { "2026-08-18": { asr: "ontime" } };

    writeMemberStore("salah", "mem_shahid", fatherSalah);
    writeMemberStore("salah", "mem_usman", usmanSalah);

    // Assert father store remains 5 prayers
    assert.deepEqual(readMemberStore("salah", "mem_shahid", {}), fatherSalah);
    // Assert child store has only 1 prayer
    assert.deepEqual(readMemberStore("salah", "mem_usman", {}), usmanSalah);
    // Assert stores are distinct in storage
    assert.notEqual(
      mockStorage.get("veedu:mem_shahid:salah"),
      mockStorage.get("veedu:mem_usman:salah")
    );
  });

  test("6. Writing child Hifz does NOT mutate father Hifz", () => {
    mockStorage.clear();
    const fatherHifz = [{ id: "h_dad", surah: "Al-Baqarah", pct: 100 }];
    const childHifz = [{ id: "h_usman", surah: "An-Naba", pct: 80 }];

    writeMemberStore("hifz", "mem_shahid", fatherHifz);
    writeMemberStore("hifz", "mem_usman", childHifz);

    assert.deepEqual(readMemberStore("hifz", "mem_shahid", []), fatherHifz);
    assert.deepEqual(readMemberStore("hifz", "mem_usman", []), childHifz);
  });

  test("7. Household perspective (undefined memberId) returns fallback with zero leakage", () => {
    // Household perspective should return fallback
    assert.deepEqual(readMemberStore("salah", undefined, {}), {});
    assert.deepEqual(readMemberStore("hifz", undefined, []), []);
    assert.deepEqual(readMemberStore("habits", undefined, []), []);
    assert.deepEqual(readMemberStore("water", undefined, {}), {});

    // Writing with undefined memberId is a safe no-op
    writeMemberStore("salah", undefined, { "2026-08-18": { fajr: "ontime" } });
    assert.equal(mockStorage.has("veedu:mem_undefined:salah"), false);
  });

  test("8. Legacy global key compatibility & idempotent migration", () => {
    mockStorage.clear();

    // Setup legacy un-scoped data
    const legacySalah = { "2026-08-18": { fajr: "ontime", dhuhr: "ontime", asr: "ontime" } };
    const legacyHifz = [{ id: "h_legacy", surah: "Yaseen", pct: 100 }];
    const legacyHabits = [{ id: "hab_1", name: "Read Quran", days: ["2026-08-18"] }];
    const legacyHealth = { "2026-08-18": { water: 5, weight: "74.0", sleep: "7.0" } };

    mockStorage.set("veedu:salah", JSON.stringify(legacySalah));
    mockStorage.set("veedu:hifz", JSON.stringify(legacyHifz));
    mockStorage.set("veedu:habits", JSON.stringify(legacyHabits));
    mockStorage.set("veedu:health", JSON.stringify(legacyHealth));

    // Run migration for primary member (Shahid)
    migrateMemberStores("mem_shahid");

    // Verify Shahid partition received legacy data
    assert.deepEqual(readMemberStore("salah", "mem_shahid", {}), legacySalah);
    assert.deepEqual(readMemberStore("hifz", "mem_shahid", []), legacyHifz);
    assert.deepEqual(readMemberStore("habits", "mem_shahid", []), legacyHabits);
    assert.deepEqual(readMemberStore("water", "mem_shahid", {}), { "2026-08-18": { water: 5 } });

    // Verify child (Usman) did NOT receive legacy data
    assert.deepEqual(readMemberStore("salah", "mem_usman", {}), {});
    assert.deepEqual(readMemberStore("hifz", "mem_usman", []), []);

    // Verify legacy keys were preserved
    assert.ok(mockStorage.has("veedu:salah"));
    assert.ok(mockStorage.has("veedu:health"));

    // Verify adult-sensitive health (weight, sleep) was NOT placed in member water
    const migratedWater = readMemberStore<any>("water", "mem_shahid", {});
    assert.equal(migratedWater["2026-08-18"].weight, undefined);
    assert.equal(migratedWater["2026-08-18"].sleep, undefined);
    assert.equal(migratedWater["2026-08-18"].water, 5);

    // Migration idempotency — running again preserves existing partition
    writeMemberStore("salah", "mem_shahid", { "2026-08-18": { fajr: "ontime", dhuhr: "ontime", asr: "ontime", maghrib: "ontime" } });
    migrateMemberStores("mem_shahid");
    assert.equal(Object.keys(readMemberStore<any>("salah", "mem_shahid", {})["2026-08-18"]).length, 4);
  });

  test("9. Member switching sequence Father -> Usman -> Household -> Father preserves data integrity", () => {
    mockStorage.clear();
    writeMemberStore("salah", "mem_shahid", { "2026-08-18": { fajr: "ontime", dhuhr: "ontime" } });
    writeMemberStore("salah", "mem_usman", { "2026-08-18": { fajr: "ontime" } });

    // 1. View Father
    let current = readMemberStore<Record<string, Record<string, string>>>("salah", "mem_shahid", {});
    assert.equal(Object.keys(current["2026-08-18"] ?? {}).length, 2);

    // 2. Switch to Usman
    current = readMemberStore<Record<string, Record<string, string>>>("salah", "mem_usman", {});
    assert.equal(Object.keys(current["2026-08-18"] ?? {}).length, 1);

    // 3. Switch to Household
    current = readMemberStore<Record<string, Record<string, string>>>("salah", undefined, {});
    assert.deepEqual(current, {});

    // 4. Switch back to Father
    current = readMemberStore<Record<string, Record<string, string>>>("salah", "mem_shahid", {});
    assert.equal(Object.keys(current["2026-08-18"] ?? {}).length, 2);
  });

  test("10. Fresh user defaults to Household (undefined) and resetSelectedMember clears perspective", () => {
    mockStorage.clear();

    // 1. Fresh state: key does not exist
    assert.equal(mockStorage.has("veedu:selected_member_id"), false);

    // 2. Set an old child perspective
    mockStorage.set("veedu:selected_member_id", JSON.stringify("mem_usman"));
    assert.equal(mockStorage.get("veedu:selected_member_id"), JSON.stringify("mem_usman"));

    // 3. Reset perspective to Household
    resetSelectedMember();
    assert.equal(mockStorage.has("veedu:selected_member_id"), false);

    // 4. Household is strictly undefined
    assert.equal(readMemberStore("salah", undefined, undefined), undefined);
  });

  test("11. Household aggregate verification — shows tasks, routines, and events, suppresses personal domains", () => {
    const tasks: TaskRecord[] = [
      { id: "t_unassigned", title: "Buy groceries", done: false, date: "2026-08-18" },
      { id: "t_shahid", title: "Pay utility bill", done: false, date: "2026-08-18", assignedTo: "mem_shahid" },
      { id: "t_usman", title: "Fold clothes", done: false, date: "2026-08-18", assignedTo: "mem_usman" },
    ];
    const events: CalEventRecord[] = [
      { id: "ev_1", title: "Family Dinner", date: "2026-08-18", time: "19:00" },
    ];

    // Household perspective (memberId: undefined)
    const householdTasks = filterTasksForMember(tasks, undefined);
    assert.equal(householdTasks.length, 3, "Household view includes all household tasks");

    const householdEvents = filterEventsForMember(events, undefined);
    assert.equal(householdEvents.length, 1, "Household view includes household events");

    // Member perspective (Usman)
    const usmanTasks = filterTasksForMember(tasks, "mem_usman");
    assert.equal(usmanTasks.length, 2, "Usman sees assigned task + unassigned household task");
    assert.equal(usmanTasks.some((t) => t.id === "t_shahid"), false, "Usman does NOT see Shahid's personal task");

    // Personal domains in Household perspective are empty
    assert.deepEqual(readMemberStore("salah", undefined, {}), {});
    assert.deepEqual(readMemberStore("hifz", undefined, []), []);
    assert.deepEqual(readMemberStore("habits", undefined, []), []);
    assert.deepEqual(readMemberStore("water", undefined, {}), {});
  });
});

describe("Wave 2.5 Fix B — Default Authenticated Member Perspective (ME / Household / Other)", () => {
  const mockStorage = new Map<string, string>();

  const family: FamilyMember[] = [
    { id: "mem_shahid", name: "Shahid", role: "admin", chores: [] },
    { id: "mem_fatima", name: "Fatima", role: "member", chores: [] },
    { id: "mem_usman", name: "Usman", role: "child", age: "7", chores: [] },
  ];

  test("1. Shahid login / first load resolves Shahid as primary member (NEVER Usman)", () => {
    // 1. Shahid profile with family -> resolves Shahid (admin)
    const primary = getPrimaryFamilyMember(family, "Shahid");
    assert.ok(primary);
    assert.equal(primary.id, "mem_shahid");
    assert.equal(primary.name, "Shahid");
    assert.notEqual(primary.id, "mem_usman", "Primary member MUST NOT be a child");

    // 2. Case-insensitive profile name
    const primaryLower = getPrimaryFamilyMember(family, "shahid");
    assert.equal(primaryLower?.id, "mem_shahid");

    // 3. Admin fallback when profile name is empty -> resolves Shahid (first admin)
    const primaryAdmin = getPrimaryFamilyMember(family, "");
    assert.equal(primaryAdmin?.id, "mem_shahid");
  });

  test("2. Standalone user or child-only household safely falls back without selecting child", () => {
    // Standalone (no family members)
    assert.equal(getPrimaryFamilyMember([], "Shahid"), undefined);
    assert.equal(getPrimaryFamilyMember(undefined, "Shahid"), undefined);

    // Child-only family list -> MUST NOT return child as authenticated primary user
    const childOnlyFamily: FamilyMember[] = [
      { id: "mem_child_1", name: "Usman", role: "child", chores: [] },
    ];
    assert.equal(getPrimaryFamilyMember(childOnlyFamily, "Shahid"), undefined);
  });

  test("3. Missing Shahid member falls back safely to adult member", () => {
    const otherFamily: FamilyMember[] = [
      { id: "mem_fatima", name: "Fatima", role: "member", chores: [] },
      { id: "mem_usman", name: "Usman", role: "child", chores: [] },
    ];
    const resolved = getPrimaryFamilyMember(otherFamily, "Shahid");
    assert.equal(resolved?.id, "mem_fatima");
  });

  test("4. Explicit member selection vs explicit Household selection semantics", () => {
    window.localStorage.clear();

    // 1. Explicit selection of Usman
    window.localStorage.setItem("veedu:selected_member_id", JSON.stringify("mem_usman"));
    assert.equal(JSON.parse(window.localStorage.getItem("veedu:selected_member_id")!), "mem_usman");

    // 2. Explicit selection of Household (stored as "household")
    window.localStorage.setItem("veedu:selected_member_id", JSON.stringify("household"));
    assert.equal(JSON.parse(window.localStorage.getItem("veedu:selected_member_id")!), "household");

    // 3. Reset perspective removes storage
    resetSelectedMember();
    assert.equal(window.localStorage.getItem("veedu:selected_member_id"), null);
  });

  test("5. Logout clears active perspective and does not bleed into different authenticated user", () => {
    window.localStorage.clear();

    // User A (Shahid) had explicitly selected Usman
    window.localStorage.setItem("veedu:selected_member_id", JSON.stringify("mem_usman"));

    // User logs out -> resetSelectedMember removes persisted selection
    resetSelectedMember();
    assert.equal(window.localStorage.getItem("veedu:selected_member_id"), null);

    // User B (Fatima) logs in -> fresh resolution resolves Fatima's primary member
    const fatimaPrimary = getPrimaryFamilyMember(family, "Fatima");
    assert.equal(fatimaPrimary?.id, "mem_fatima");
    assert.notEqual(fatimaPrimary?.id, "mem_usman");
  });

  test("6. Personal Salah isolation across Shahid, Household, and Usman perspectives", () => {
    window.localStorage.clear();

    const shahidSalah = { "2026-08-18": { fajr: "ontime", dhuhr: "ontime", asr: "ontime", maghrib: "ontime", isha: "ontime" } };
    const usmanSalah = { "2026-08-18": { asr: "ontime" } };

    writeMemberStore("salah", "mem_shahid", shahidSalah);
    writeMemberStore("salah", "mem_usman", usmanSalah);

    // 1. Shahid view -> sees Shahid's 5 prayers
    const readShahid = readMemberStore<Record<string, Record<string, string>>>("salah", "mem_shahid", {});
    assert.deepEqual(readShahid, shahidSalah);
    assert.equal(Object.keys(readShahid["2026-08-18"]).length, 5);

    // 2. Household view (undefined) -> strictly isolated (empty fallback)
    const readHousehold = readMemberStore<Record<string, Record<string, string>>>("salah", undefined, {});
    assert.deepEqual(readHousehold, {});

    // 3. Usman view -> sees Usman's 1 prayer, Shahid's prayers hidden
    const readUsman = readMemberStore<Record<string, Record<string, string>>>("salah", "mem_usman", {});
    assert.deepEqual(readUsman, usmanSalah);
    assert.equal(Object.keys(readUsman["2026-08-18"]).length, 1);
  });

  test("7. Canonical Auth → FamilyMember identity resolver (linkedUserId) and array invariance", () => {
    const authFamily: FamilyMember[] = [
      { id: "mem_usman", name: "Usman", role: "child", chores: [] },
      { id: "mem_fatima", name: "Fatima", role: "member", chores: [] },
      { id: "mem_shahid", name: "Shahid", role: "admin", linkedUserId: "usr_shahid_123", chores: [] },
    ];

    // 1. Exact linkedUserId match returns Shahid regardless of Usman being first in array
    const resolved = getAuthenticatedFamilyMember(authFamily, "usr_shahid_123");
    assert.ok(resolved);
    assert.equal(resolved.id, "mem_shahid");
    assert.equal(resolved.name, "Shahid");

    // 2. Unlinked auth user -> returns undefined (Household fallback)
    assert.equal(getAuthenticatedFamilyMember(authFamily, "usr_unknown_456"), undefined);
    assert.equal(getAuthenticatedFamilyMember(authFamily, null), undefined);
    assert.equal(getAuthenticatedFamilyMember(authFamily, undefined), undefined);
  });

  test("8. Deterministic legacy migration: links single clear candidate, rejects ambiguity and children", () => {
    // 1. Clear candidate with profile name match
    const legacyFamily: FamilyMember[] = [
      { id: "mem_usman", name: "Usman", role: "child", chores: [] },
      { id: "mem_shahid", name: "Shahid", role: "admin", chores: [] },
    ];
    const { family: migrated1, linkedMember: linked1 } = migrateAuthFamilyMemberLink(
      legacyFamily,
      "usr_shahid_123",
      "Shahid"
    );
    assert.ok(linked1);
    assert.equal(linked1.id, "mem_shahid");
    assert.equal(linked1.linkedUserId, "usr_shahid_123");
    assert.equal(migrated1.find((m) => m.id === "mem_usman")?.linkedUserId, undefined, "Usman is never linked");

    // 2. Idempotency test — running again yields same result
    const { linkedMember: linkedAgain } = migrateAuthFamilyMemberLink(
      migrated1,
      "usr_shahid_123",
      "Shahid"
    );
    assert.equal(linkedAgain?.id, "mem_shahid");

    // 3. Ambiguous household (multiple admins, empty profile name) -> do NOT guess
    const ambiguousFamily: FamilyMember[] = [
      { id: "mem_admin_1", name: "Parent 1", role: "admin", chores: [] },
      { id: "mem_admin_2", name: "Parent 2", role: "admin", chores: [] },
    ];
    const { linkedMember: linkedAmbiguous } = migrateAuthFamilyMemberLink(
      ambiguousFamily,
      "usr_new",
      ""
    );
    assert.equal(linkedAmbiguous, undefined, "Ambiguous candidates must not be guessed");

    // 4. Child-only household -> returns unlinked (never link a child)
    const childOnly: FamilyMember[] = [
      { id: "mem_child", name: "Usman", role: "child", chores: [] },
    ];
    const { linkedMember: linkedChild } = migrateAuthFamilyMemberLink(
      childOnly,
      "usr_new",
      "Shahid"
    );
    assert.equal(linkedChild, undefined, "Child must never be linked as authenticated user");
  });

  test("9. JSON serialization, backup, and restore preserves linkedUserId", () => {
    const originalMember: FamilyMember = {
      id: "mem_shahid",
      name: "Shahid",
      role: "admin",
      linkedUserId: "usr_auth_999",
      chores: [],
    };
    const serialized = JSON.stringify([originalMember]);
    const restored: FamilyMember[] = JSON.parse(serialized);

    assert.equal(restored[0]?.linkedUserId, "usr_auth_999");
    const resolved = getAuthenticatedFamilyMember(restored, "usr_auth_999");
    assert.equal(resolved?.id, "mem_shahid");
  });

  test("10. Task creation assignment scoping in ME vs Household vs Child contexts", () => {
    const tasks: TaskRecord[] = [];

    // 1. Task created in Shahid context (assignedTo: mem_shahid)
    const taskShahid: TaskRecord = {
      id: "t_1",
      title: "Review work reports",
      done: false,
      date: "2026-08-18",
      assignedTo: "mem_shahid",
    };

    // 2. Task created in Household context (assignedTo: undefined)
    const taskHousehold: TaskRecord = {
      id: "t_2",
      title: "Buy whole milk",
      done: false,
      date: "2026-08-18",
    };

    // 3. Task created in Usman context (assignedTo: mem_usman)
    const taskUsman: TaskRecord = {
      id: "t_3",
      title: "Clean study desk",
      done: false,
      date: "2026-08-18",
      assignedTo: "mem_usman",
    };

    tasks.push(taskShahid, taskHousehold, taskUsman);

    // Household perspective sees all 3 tasks
    assert.equal(filterTasksForMember(tasks, undefined).length, 3);

    // Shahid perspective sees his own task + household task (2 tasks)
    const shahidTasks = filterTasksForMember(tasks, "mem_shahid");
    assert.equal(shahidTasks.length, 2);
    assert.ok(shahidTasks.some((t) => t.id === "t_1"));
    assert.ok(shahidTasks.some((t) => t.id === "t_2"));
    assert.equal(shahidTasks.some((t) => t.id === "t_3"), false);

    // Usman perspective sees his own task + household task (2 tasks)
    const usmanTasks = filterTasksForMember(tasks, "mem_usman");
    assert.equal(usmanTasks.length, 2);
    assert.ok(usmanTasks.some((t) => t.id === "t_3"));
    assert.ok(usmanTasks.some((t) => t.id === "t_2"));
    assert.equal(usmanTasks.some((t) => t.id === "t_1"), false);
  });

  test("11. H2.5-B: Complete Member-Scoped Personal Data Isolation across all domains", () => {
    window.localStorage.clear();

    // 1. Hifz portions isolation
    const shahidHifz = [{ id: "h1", surah: "Al-Baqarah", range: "1-20" }];
    const usmanHifz = [{ id: "h2", surah: "An-Naba", range: "1-40" }];
    writeMemberStore("hifz", "mem_shahid", shahidHifz);
    writeMemberStore("hifz", "mem_usman", usmanHifz);

    assert.deepEqual(readMemberStore("hifz", "mem_shahid", []), shahidHifz);
    assert.deepEqual(readMemberStore("hifz", "mem_usman", []), usmanHifz);
    assert.deepEqual(readMemberStore("hifz", undefined, []), []);

    // 2. Quran bookmarks & sessions isolation
    const shahidBookmarks = ["2", "36", "67"];
    const usmanBookmarks = ["1", "112", "114"];
    writeMemberStore("quran-bookmarks", "mem_shahid", shahidBookmarks);
    writeMemberStore("quran-bookmarks", "mem_usman", usmanBookmarks);

    assert.deepEqual(readMemberStore("quran-bookmarks", "mem_shahid", []), shahidBookmarks);
    assert.deepEqual(readMemberStore("quran-bookmarks", "mem_usman", []), usmanBookmarks);
    assert.deepEqual(readMemberStore("quran-bookmarks", undefined, []), []);

    // 3. Habits isolation
    const shahidHabits = [{ id: "hab1", name: "Read Tahajjud", days: ["2026-08-18"] }];
    const usmanHabits = [{ id: "hab2", name: "Math practice", days: ["2026-08-18"] }];
    writeMemberStore("habits", "mem_shahid", shahidHabits);
    writeMemberStore("habits", "mem_usman", usmanHabits);

    assert.deepEqual(readMemberStore("habits", "mem_shahid", []), shahidHabits);
    assert.deepEqual(readMemberStore("habits", "mem_usman", []), usmanHabits);
    assert.deepEqual(readMemberStore("habits", undefined, []), []);

    // 4. Water isolation
    const shahidWater = { "2026-08-18": { water: 8 } };
    const usmanWater = { "2026-08-18": { water: 4 } };
    writeMemberStore("water", "mem_shahid", shahidWater);
    writeMemberStore("water", "mem_usman", usmanWater);

    assert.deepEqual(readMemberStore("water", "mem_shahid", {}), shahidWater);
    assert.deepEqual(readMemberStore("water", "mem_usman", {}), usmanWater);
    assert.deepEqual(readMemberStore("water", undefined, {}), {});

    // 5. Checkins / Mood isolation
    const shahidCheckin = { "2026-08-18": "bright" };
    const usmanCheckin = { "2026-08-18": "tired" };
    writeMemberStore("checkins", "mem_shahid", shahidCheckin);
    writeMemberStore("checkins", "mem_usman", usmanCheckin);

    assert.deepEqual(readMemberStore("checkins", "mem_shahid", {}), shahidCheckin);
    assert.deepEqual(readMemberStore("checkins", "mem_usman", {}), usmanCheckin);
    assert.deepEqual(readMemberStore("checkins", undefined, {}), {});

    // 6. Fasting isolation
    const shahidFasting = { "2026-08-18": "voluntary" };
    const usmanFasting = {};
    writeMemberStore("fasting", "mem_shahid", shahidFasting);
    writeMemberStore("fasting", "mem_usman", usmanFasting);

    assert.deepEqual(readMemberStore("fasting", "mem_shahid", {}), shahidFasting);
    assert.deepEqual(readMemberStore("fasting", "mem_usman", {}), {});
    assert.deepEqual(readMemberStore("fasting", undefined, {}), {});
  });

  test("12. H2.5-B: Comprehensive Legacy Migration for all 8 domains", () => {
    window.localStorage.clear();

    // Populate legacy unpartitioned storage
    window.localStorage.setItem("veedu:salah", JSON.stringify({ "2026-08-18": { fajr: "ontime" } }));
    window.localStorage.setItem("veedu:fasting", JSON.stringify({ "2026-08-18": "obligatory" }));
    window.localStorage.setItem("veedu:hifz", JSON.stringify([{ id: "h_leg", surah: "Yasin" }]));
    window.localStorage.setItem("veedu:habits", JSON.stringify([{ id: "hab_leg", name: "Walk", days: [] }]));
    window.localStorage.setItem("veedu:health", JSON.stringify({ "2026-08-18": { water: 6, weight: "72", sleep: "7" } }));
    window.localStorage.setItem("veedu:checkins", JSON.stringify({ "2026-08-18": "grateful" }));
    window.localStorage.setItem("veedu:quran-bookmarks", JSON.stringify(["18", "36"]));
    window.localStorage.setItem("veedu:quran-log", JSON.stringify([{ id: "s1", surah: "Al-Mulk", date: "2026-08-18" }]));

    // Run migration for primary admin (Shahid)
    migrateMemberStores("mem_shahid");

    // Verify all 8 domains migrated to mem_shahid partition
    assert.deepEqual(readMemberStore("salah", "mem_shahid", {}), { "2026-08-18": { fajr: "ontime" } });
    assert.deepEqual(readMemberStore("fasting", "mem_shahid", {}), { "2026-08-18": "obligatory" });
    assert.deepEqual(readMemberStore("hifz", "mem_shahid", []), [{ id: "h_leg", surah: "Yasin" }]);
    assert.deepEqual(readMemberStore("habits", "mem_shahid", []), [{ id: "hab_leg", name: "Walk", days: [] }]);
    assert.deepEqual(readMemberStore("water", "mem_shahid", {}), { "2026-08-18": { water: 6 } });
    assert.deepEqual(readMemberStore("checkins", "mem_shahid", {}), { "2026-08-18": "grateful" });
    assert.deepEqual(readMemberStore("quran-bookmarks", "mem_shahid", []), ["18", "36"]);
    assert.deepEqual(readMemberStore("quran-sessions", "mem_shahid", []), [{ id: "s1", surah: "Al-Mulk", date: "2026-08-18" }]);

    // Verify Usman store remains clean
    assert.deepEqual(readMemberStore("salah", "mem_usman", {}), {});
    assert.deepEqual(readMemberStore("hifz", "mem_usman", []), []);
    assert.deepEqual(readMemberStore("habits", "mem_usman", []), []);

    // Verify Idempotency — running again doesn't corrupt or overwrite modified member data
    writeMemberStore("habits", "mem_shahid", [{ id: "hab_new", name: "Run", days: [] }]);
    migrateMemberStores("mem_shahid");
    assert.deepEqual(readMemberStore("habits", "mem_shahid", []), [{ id: "hab_new", name: "Run", days: [] }]);
  });
});

describe("Wave 2.5 Fix C — Self Member in Family Roster & Perspective Defaults", () => {
  const authUserId = "auth_usr_shahid_99";

  test("1. Authenticated user without linked FamilyMember automatically creates/ensures primary FamilyMember", () => {
    // Household where family only had Usman (e.g. from previous child-only onboarding)
    const childOnlyFamily: FamilyMember[] = [
      { id: "mem_usman", name: "Usman", role: "child", chores: [] },
    ];

    const { family: reconciled, primaryMember, created } = ensurePrimaryFamilyMember(
      childOnlyFamily,
      authUserId,
      "Shahid"
    );

    assert.equal(created, true);
    assert.equal(reconciled.length, 2);

    // Primary member is Shahid with admin role and linked auth ID
    assert.equal(primaryMember.id, "mem_shahid");
    assert.equal(primaryMember.name, "Shahid");
    assert.equal(primaryMember.role, "admin");
    assert.equal(primaryMember.linkedUserId, authUserId);

    // Usman remains untouched as separate child member
    const usman = reconciled.find((m) => m.id === "mem_usman");
    assert.ok(usman);
    assert.equal(usman.role, "child");
    assert.equal(usman.linkedUserId, undefined);
  });

  test("2. Idempotency: Repeated runs NEVER create duplicate Shahid members", () => {
    const initialFamily: FamilyMember[] = [
      { id: "mem_usman", name: "Usman", role: "child", chores: [] },
    ];

    const run1 = ensurePrimaryFamilyMember(initialFamily, authUserId, "Shahid");
    assert.equal(run1.created, true);
    assert.equal(run1.family.length, 2);

    const run2 = ensurePrimaryFamilyMember(run1.family, authUserId, "Shahid");
    assert.equal(run2.created, false);
    assert.equal(run2.family.length, 2);
    assert.equal(run2.family.filter((m) => m.name === "Shahid").length, 1);

    const run3 = ensurePrimaryFamilyMember(run2.family, authUserId, "Shahid");
    assert.equal(run3.created, false);
    assert.equal(run3.family.length, 2);
  });

  test("3. Links existing unlinked Shahid member instead of creating a second one", () => {
    const unlinkedFamily: FamilyMember[] = [
      { id: "mem_existing_shahid", name: "Shahid", role: "admin", chores: [] },
      { id: "mem_usman", name: "Usman", role: "child", chores: [] },
    ];

    const { family: reconciled, primaryMember, created } = ensurePrimaryFamilyMember(
      unlinkedFamily,
      authUserId,
      "Shahid"
    );

    assert.equal(created, false, "Must link existing member, not create a new one");
    assert.equal(reconciled.length, 2);
    assert.equal(primaryMember.id, "mem_existing_shahid");
    assert.equal(primaryMember.linkedUserId, authUserId);
  });

  test("4. Selector resolution presents YOU (Shahid), HOUSEHOLD, and USMAN (Child)", () => {
    const family: FamilyMember[] = [
      { id: "mem_shahid", name: "Shahid", role: "admin", linkedUserId: authUserId, chores: [] },
      { id: "mem_usman", name: "Usman", role: "child", chores: [] },
    ];

    const authMember = getAuthenticatedFamilyMember(family, authUserId);
    assert.ok(authMember);
    assert.equal(authMember.id, "mem_shahid");
    assert.equal(authMember.name, "Shahid");

    const otherMembers = family.filter((m) => m.id !== authMember.id);
    assert.equal(otherMembers.length, 1);
    const firstOther = otherMembers[0];
    assert.ok(firstOther);
    assert.equal(firstOther.id, "mem_usman");
    assert.equal(firstOther.name, "Usman");
    assert.equal(getCanonicalFamilyRole(firstOther.role), "child");
  });

  test("5. Default perspective on first authenticated load is Shahid (NOT Usman, NOT Household)", () => {
    const family: FamilyMember[] = [
      { id: "mem_shahid", name: "Shahid", role: "admin", linkedUserId: authUserId, chores: [] },
      { id: "mem_usman", name: "Usman", role: "child", chores: [] },
    ];

    // 1. Authenticated lookup resolves Shahid
    const authMember = getAuthenticatedFamilyMember(family, authUserId);
    assert.equal(authMember?.id, "mem_shahid");

    // 2. Primary fallback resolves Shahid
    const primary = getPrimaryFamilyMember(family, "Shahid");
    assert.equal(primary?.id, "mem_shahid");
    assert.notEqual(primary?.id, "mem_usman");
  });

  test("6. Explicit perspective switching semantics (Household vs Usman vs Shahid)", () => {
    window.localStorage.clear();

    const family: FamilyMember[] = [
      { id: "mem_shahid", name: "Shahid", role: "admin", linkedUserId: authUserId, chores: [] },
      { id: "mem_usman", name: "Usman", role: "child", chores: [] },
    ];

    // Explicit Household selection -> stored as "household", effective perspective is undefined
    window.localStorage.setItem("veedu:selected_member_id", JSON.stringify("household"));
    const storedHousehold = JSON.parse(window.localStorage.getItem("veedu:selected_member_id")!);
    assert.equal(storedHousehold, "household");

    // Explicit Usman selection -> stored as "mem_usman"
    window.localStorage.setItem("veedu:selected_member_id", JSON.stringify("mem_usman"));
    const storedUsman = JSON.parse(window.localStorage.getItem("veedu:selected_member_id")!);
    assert.equal(storedUsman, "mem_usman");

    // Explicit Shahid selection -> stored as "mem_shahid"
    window.localStorage.setItem("veedu:selected_member_id", JSON.stringify("mem_shahid"));
    const storedShahid = JSON.parse(window.localStorage.getItem("veedu:selected_member_id")!);
    assert.equal(storedShahid, "mem_shahid");
  });

  test("7. Task creation defaults across all three perspectives", () => {
    const tasks: TaskRecord[] = [];

    let idCounter = 1;
    function createTask(title: string, perspectiveMemberId: string | undefined): TaskRecord {
      return {
        id: `t_${idCounter++}`,
        title,
        done: false,
        date: "2026-08-18",
        assignedTo: perspectiveMemberId || undefined,
        assigneeId: perspectiveMemberId || undefined,
      };
    }

    // 1. Shahid selected: new task defaults to Shahid
    const taskShahid = createTask("Review quarterly finances", "mem_shahid");
    assert.equal(taskShahid.assignedTo, "mem_shahid");
    assert.equal(taskShahid.assigneeId, "mem_shahid");
    assert.equal(isTaskHousehold(taskShahid), false);
    assert.equal(isTaskAssignedTo(taskShahid, "mem_shahid"), true);

    // 2. Household selected: new task defaults to unassigned/household
    const taskHousehold = createTask("Buy groceries for family", undefined);
    assert.equal(taskHousehold.assignedTo, undefined);
    assert.equal(taskHousehold.assigneeId, undefined);
    assert.equal(isTaskHousehold(taskHousehold), true);
    assert.equal(isTaskAssignedTo(taskHousehold, "mem_shahid"), false);

    // 3. Usman selected: new task defaults to Usman
    const taskUsman = createTask("Complete Quran recitation", "mem_usman");
    assert.equal(taskUsman.assignedTo, "mem_usman");
    assert.equal(taskUsman.assigneeId, "mem_usman");
    assert.equal(isTaskHousehold(taskUsman), false);
    assert.equal(isTaskAssignedTo(taskUsman, "mem_usman"), true);

    tasks.push(taskShahid, taskHousehold, taskUsman);

    // Household view shows all 3 tasks
    assert.equal(filterTasksForMember(tasks, undefined).length, 3);

    // Shahid view shows his task + household task (2 tasks)
    const shahidTasks = filterTasksForMember(tasks, "mem_shahid");
    assert.equal(shahidTasks.length, 2);
    assert.ok(shahidTasks.some((t) => t.id === taskShahid.id));
    assert.ok(shahidTasks.some((t) => t.id === taskHousehold.id));
    assert.equal(shahidTasks.some((t) => t.id === taskUsman.id), false);

    // Usman view shows his task + household task (2 tasks)
    const usmanTasks = filterTasksForMember(tasks, "mem_usman");
    assert.equal(usmanTasks.length, 2);
    assert.ok(usmanTasks.some((t) => t.id === taskUsman.id));
    assert.ok(usmanTasks.some((t) => t.id === taskHousehold.id));
    assert.equal(usmanTasks.some((t) => t.id === taskShahid.id), false);
  });
});







