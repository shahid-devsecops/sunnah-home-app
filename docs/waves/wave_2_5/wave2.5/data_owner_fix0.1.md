# FIRDAUS H2.5-A — MEMBER DATA OWNERSHIP & LOCAL PARTITIONING

Repository:
~/firdous/veedu-home-soul

Reference:
data_owner_audit.md

The Child / Member Data Ownership Audit is COMPLETE.

Critical finding:

Selecting a child FamilyMember currently leaks authenticated-parent personal
data because several personal domains are stored in global localStorage keys and
are read without member scoping.

The audit recommends a 3-tier ownership model:

ACCOUNT
MEMBER
HOUSEHOLD

For this task, implement ONLY the MEMBER ownership foundation locally.

DO NOT implement:
- Supabase households
- household_members
- invitations
- RLS
- Edge Functions
- multi-device sharing
- cross-account synchronization
- new UI

Those come later.

==================================================
OBJECTIVE
==================================================

Introduce member-scoped storage for family-member personal data.

Target local concept:

veedu:mem_<memberId>:<domain>

Primary member-personal domains:

- salah
- fasting
- quran
- hifz
- habits
- water/member hydration

Do not move adult-private account data such as:

- journal
- private notes
- cycle
- account preferences

into member storage.

Those remain account-personal.

==================================================
1. AUDIT EXISTING STORAGE HOOKS
==================================================

Inspect:

- store.ts
- salah hooks
- Quran hooks
- Hifz hooks
- habits hooks
- health hooks
- fasting hooks
- family-model.ts
- current selected member mechanism

Identify all places where these domains currently assume a single global key.

==================================================
2. DEFINE MEMBER STORAGE HELPERS
==================================================

Create a minimal reusable abstraction.

Example concepts:

getMemberStoreKey(memberId, domain)

useMemberStore(memberId, domain, initialValue)

But adapt to the existing store architecture.

Requirements:

- deterministic key generation
- no duplicate key formatting logic
- SSR-safe
- local-first
- reactive when member changes

==================================================
3. MEMBER-OWNED DOMAINS
==================================================

Implement member-scoped storage for:

Salah
Fasting
Quran
Hifz
Habits
Member-specific water/hydration

Do NOT blindly move the entire `health` object if it contains adult-sensitive fields.

Split/identify only the appropriate member-owned water state.

Preserve adult health/private information separately.

==================================================
4. LEGACY COMPATIBILITY
==================================================

Existing users currently have:

veedu:salah
veedu:fasting
veedu:quran-*
veedu:hifz
veedu:habits

Do not delete them.

Introduce compatibility behavior.

For the authenticated user's primary FamilyMember:

legacy global data should resolve to that member's new scoped partition during migration.

Child members should start with clean empty member partitions.

The migration must be deterministic.

==================================================
5. PRIMARY MEMBER RESOLUTION
==================================================

Define how the authenticated user's primary FamilyMember is identified.

Use existing FamilyMember data and profile information.

Do NOT guess based only on display name if a stronger relationship exists.

Document the chosen resolution method.

==================================================
6. PERSPECTIVE SEMANTICS
==================================================

The resulting storage abstraction must support:

selectedMemberId = undefined
→ household perspective
→ DO NOT expose personal member data

selectedMemberId = memberId
→ load that member's member-scoped data

authenticated adult's own member
→ load their own member data

child member
→ load child's member data

==================================================
7. DATA IMMUTABILITY
==================================================

Switching:

Father → Usman → Household → Father

must NEVER mutate another member's stores.

Writing:

Usman's Salah

must not modify:

Father's Salah.

Writing:

Usman's Hifz

must not modify:

Father's Hifz.

==================================================
8. STORAGE NAMESPACE
==================================================

Use the audited convention:

veedu:mem_<memberId>:salah
veedu:mem_<memberId>:fasting
veedu:mem_<memberId>:quran
veedu:mem_<memberId>:hifz
veedu:mem_<memberId>:habits
veedu:mem_<memberId>:water

Do not add household prefixing yet.

==================================================
9. TESTS
==================================================

Add focused tests for:

1. Member key generation
2. Father member store isolation
3. Child member store isolation
4. Member switching
5. Empty child stores
6. Legacy global key compatibility
7. Migration idempotency
8. Writing child Salah
9. Writing child Hifz
10. Writing adult/member Salah
11. No cross-member leakage
12. SSR/hydration safety where relevant

==================================================
10. VALIDATION
==================================================

Run:

npx tsx --test src/lib/*.test.ts
npx tsc --noEmit
npm run build

All existing tests must continue passing.

==================================================
11. SELF-REVIEW
==================================================

Before reporting completion:

- Search for remaining direct reads of global personal keys.
- Search for remaining direct writes to global personal keys.
- Check useSalah/useHifz/useHabits/useHealth behavior.
- Confirm member switching changes subscriptions.
- Confirm no UI logic has been added.
- Confirm Calm/Vibrant remain untouched.
- Confirm no Supabase schema was changed.

==================================================
12. COMMIT
==================================================

Commit:

feat: add member-scoped personal data

==================================================
FINAL REPORT
==================================================

Return:

### Storage Architecture
### Member-Owned Domains
### Legacy Compatibility
### Primary Member Resolution
### Member Switching
### Isolation Guarantees
### Tests
### Typecheck
### Build
### Remaining Global Personal Reads
### Remaining Global Personal Writes
### Supabase Changes
### Commit

STOP AFTER H2.5-A.