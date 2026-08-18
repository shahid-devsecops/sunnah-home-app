# FIRDAUS — CHILD / FAMILY-MEMBER PERSONAL DATA OWNERSHIP AUDIT
# READ-ONLY ARCHITECTURE REVIEW

Repository:
~/firdous/veedu-home-soul

Reference:
docs / household identity & sharing specification
Wave 2 completed architecture
Current Household / Member Perspective implementation

DO NOT MODIFY CODE.
DO NOT MODIFY DATABASES.
DO NOT WRITE MIGRATIONS.
DO NOT CHANGE SUPABASE SCHEMA.

This is a focused architecture audit prompted by a concrete product issue:

When selecting a child FamilyMember (example: Usman) from the household/member selector,
the Daily Surface currently still shows the authenticated parent's personal information,
including prayers and other personal state.

We need to determine the correct ownership model before implementing Household Identity
& Sharing.

==================================================
PRIMARY PRODUCT RULE
==================================================

Selecting a FamilyMember MUST NOT expose another person's personal data.

Conceptually:

HOUSEHOLD VIEW
    =
shared household data

MEMBER VIEW
    =
that member's own member/personal data
    +
household data relevant to them

For a child:

CHILD VIEW
    =
child's own data
    +
appropriate shared household data

NOT:

child data
+
parent's personal data

==================================================
1. REPRODUCE / TRACE THE CURRENT BUG
==================================================

Inspect the code path when:

selectedMemberId = Usman

Trace:

member selector
    ↓
selected member state
    ↓
Daily Surface
    ↓
salah
    ↓
quran
    ↓
hifz
    ↓
habits
    ↓
health
    ↓
deeds
    ↓
notes
    ↓
reminders
    ↓
other personal stores

Identify exactly why parent-owned data remains visible.

For every leaked domain, report:

- source key/store
- current owner
- filtering function
- UI consumer
- reason it leaks
- correct future owner

==================================================
2. AUDIT ALL PERSONAL / MEMBER DATA
==================================================

Inspect current code and classify every relevant domain.

At minimum:

profile
salah
fasting
quran-*
hifz
habits
health
workouts
deeds
checkins
journal
notes
reminders
notifPrefs
goals
reflections
tasks
routines
events
meals
grocery
budget
expenses
limits
family
kids
insights

For each determine one of:

A. ACCOUNT-PERSONAL
Owned by authenticated Supabase user.

B. FAMILY-MEMBER-PERSONAL
Owned by a FamilyMember, including children who may not have Auth accounts.

C. HOUSEHOLD
Shared by the household.

D. DERIVED
Computed from other owned data.

Do not force a domain into a category if the current code does not support a confident conclusion.
Mark uncertainty explicitly.

==================================================
3. CHILD DATA OWNERSHIP
==================================================

Determine whether children should have first-class personal/member data for:

- Salah
- fasting
- Quran progress
- Hifz
- deeds
- habits
- reflections
- notes
- health
- reminders/preferences

For each answer:

- YES / NO / OPTIONAL
- why
- current implementation gap
- suggested owner

The expected conceptual model is:

Father's Salah
→ owner = father auth user

Wife's Salah
→ owner = wife auth user

Usman's Salah
→ owner = FamilyMember(Usman)

Shared family routine
→ owner = household

Task assigned to Usman
→ household + assignedTo = Usman

Verify whether the current architecture can support this.

==================================================
4. FAMILY MEMBER VS AUTH USER
==================================================

Audit the distinction:

Auth User
vs
FamilyMember

Determine exactly which data currently assumes:

"user_id === owner"

and which data already supports:

"family_member_id === owner"

Look for places where selectedMemberId is incorrectly treated as merely a filter over data owned by the authenticated user.

==================================================
5. CURRENT DAILY SURFACE
==================================================

Inspect buildDailyThread and all inputs.

Determine which inputs are:

- household-scoped
- member-scoped
- auth-user-scoped

Then determine the correct behavior for:

Household
Adult member
Child member

Produce a table:

| Input | Household View | Adult Member View | Child Member View | Owner |

Example:

salah
Household: no personal Salah
Adult: own Salah
Child: child's Salah
Owner: account/member

Do this for every major Daily Surface input.

==================================================
6. CHILD PRIVACY
==================================================

Current Wave 2 already suppresses adult:
- budget
- workload
- fairness
- overdue details

Audit whether similar protection is needed for personal domains.

Specifically ensure:

Usman cannot see:
- Father's Salah
- Father's Quran progress
- Father's Hifz
- Father's habits
- Father's health
- Father's notes
- Father's reflections
- Father's private reminders

even on a shared parent device.

==================================================
7. SHARED DEVICE MODEL
==================================================

The current child model does NOT require an Auth account.

Therefore design the correct semantics for:

Parent Auth User
    ↓
Household
    ↓
Usman FamilyMember
    ↓
Usman's member-owned data

Explain how a parent can safely enter/update Usman's data without pretending to authenticate as Usman.

This is a product-level "managed child profile" model, not account impersonation.

==================================================
8. AUTHENTICATED ADULT MEMBER
==================================================

For an adult spouse:

Auth User
    +
Household Membership
    +
FamilyMember

Determine how the same domain ownership model should work.

Example:

Wife's Salah
→ wife auth user

Wife's family assignments
→ household + assignedTo wife

==================================================
9. OWNERSHIP MODEL RECOMMENDATION
==================================================

Evaluate this candidate model:

PERSONAL ACCOUNT DATA
owner_type = "user"
owner_id = auth.users.id

FAMILY-MEMBER DATA
owner_type = "family_member"
owner_id = FamilyMember.id

HOUSEHOLD DATA
owner_type = "household"
owner_id = household.id

Do NOT assume this is correct.

Evaluate:
- advantages
- migration complexity
- Supabase/RLS implications
- localStorage implications
- offline implications
- backup implications
- sync implications

Recommend the simplest model that avoids future migrations.

==================================================
10. LOCAL-FIRST IMPLICATIONS
==================================================

Current localStorage is keyed by domains such as:

veedu:salah
veedu:quran-*
veedu:tasks
...

Determine how member-owned personal data should work locally.

Potential concept:

veedu:member:<id>:salah

or another structure.

Do not implement.

Evaluate:
- migration
- offline switching
- cache isolation
- logout
- household switching

==================================================
11. SUPABASE IMPLICATIONS
==================================================

Inspect current user_data architecture.

Determine how member-owned personal data could eventually coexist with:

- user_id
- household_id
- family_member_id
- scope

Pay particular attention to RLS.

The target must prevent:

Parent A
→ reading Parent B personal data

while allowing:

Parent A
→ reading managed child data if authorized

and:

household member
→ reading household-shared data

Do not write SQL migrations yet.

==================================================
12. BACKUP / EXPORT
==================================================

Determine how member-owned data should be represented in:

- JSON export
- JSON import
- restoration to a different device

Especially ensure that Usman's personal data is not incorrectly restored as the parent's personal data.

==================================================
13. PRODUCT / UX SEMANTICS
==================================================

Define the expected behavior for:

HOUSEHOLD
- shared household data only
- no person's private Salah/Quran/etc.

FATHER
- father's personal data
- household data relevant to father

WIFE
- wife's personal data
- household data relevant to wife

USMAN
- Usman's member-owned data
- household data relevant to Usman

Do not specify visual design.

==================================================
14. MIGRATION STRATEGY
==================================================

For existing users:

Current:
user owns all local/synced personal data

Future:
user owns only their personal data
family-member-owned records belong to the corresponding FamilyMember

Determine how existing data should be classified without accidentally assigning a parent's personal history to a child.

This is critical.

==================================================
15. TESTING REQUIREMENTS
==================================================

Propose tests for:

- Household perspective isolation
- Adult member perspective
- Child member perspective
- Parent personal data remains hidden from child
- Child-owned data appears in child view
- Shared household data appears in all allowed views
- Two adult members cannot read one another's personal data
- Family assignments remain visible appropriately
- Switching perspective does not mutate data
- Logout clears private local cache
- Household switching cannot leak private data

==================================================
16. FINAL DELIVERABLE
==================================================

Return:

# CHILD / MEMBER DATA OWNERSHIP AUDIT

## 1. Current Leakage Path

## 2. Domain Ownership Matrix

## 3. Child Data Ownership Recommendation

## 4. Adult Member Ownership Recommendation

## 5. Household Data Ownership

## 6. Daily Surface Ownership Matrix

## 7. FamilyMember vs Auth User Boundary

## 8. Shared Device Model

## 9. Proposed Ownership Architecture

## 10. LocalStorage Strategy

## 11. Supabase / RLS Strategy

## 12. Backup / Export Strategy

## 13. Migration Strategy

## 14. UX Semantics

## 15. Required Domain Changes

## 16. Required Database Changes

## 17. Required Tests

## 18. What MUST NOT Be Done

## 19. Risks

## 20. Final Recommendation

Choose exactly:

READY FOR HOUSEHOLD ARCHITECTURE DESIGN

NEEDS PRODUCT DECISION

NOT READY

DO NOT MODIFY CODE.
DO NOT MODIFY DATABASE.
DO NOT IMPLEMENT ANYTHING.