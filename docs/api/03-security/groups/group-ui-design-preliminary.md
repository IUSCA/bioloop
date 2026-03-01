The UI must reflect the architectural separations:

* Organizational hierarchy ≠ governance authority
* Oversight ≠ control
* Grants = consumption only
* Ownership = control

If the UI blurs these, users will misinterpret authority and the system will become politically unstable.

---

# 1. Global Product Structure (All Roles)

The system should have five primary domains:

1. Home (contextual dashboard)
2. Groups (organizational structure + membership)
3. Datasets (data-plane)
4. Collections (authorization containers)
5. Access (grants, requests, reviews)

Each of these behaves differently depending on role.

The biggest mistake would be building three different UIs per role. Instead:

* Same navigation.
* Different surfaces unlocked.
* Different actions enabled.

That keeps the system coherent and avoids confusion when users hold multiple roles.

---

# 2. Normal User UI

Normal users are data contributors and consumers.
They are not governance authorities.

The UI should feel:

* Personal
* Focused
* Low-friction
* Non-administrative

## 2.1 Home

Sections:

* My Groups
* My Datasets (created by me)
* Datasets in My Groups (recent)
* Shared With Me
* Institutionally Discoverable (if enabled)

The home screen should answer:

* What can I access?
* What changed recently?
* Where do I work?

It should not show:

* Global system stats
* Other labs
* Governance analytics

---

## 2.2 Groups

Normal user capabilities:

* View groups they belong to
* View parent chain for context
* See group metadata
* See group members (if allowed by policy)

They cannot:

* Modify membership
* Edit metadata
* Archive
* Reparent

Important: the UI must clearly distinguish:

“You are a member”
vs
“You are an admin”

No ambiguous badge. Explicit labeling.

---

## 2.3 Datasets

Normal user views datasets through three lenses:

1. Owned by my groups
2. Shared with me
3. Discoverable

On dataset page:

If user is only a consumer:

* Metadata
* Access explanation (“Why can I access this?”)
* Request additional access button

If user is contributor but not admin:

* They may see “You uploaded this dataset”
* But no governance actions

Critical: do not show “Grant access” buttons to non-admins.
UI must enforce governance separation visibly.

---

## 2.4 Collections

Normal users:

* See collections visible to them
* Browse datasets within collections
* Request access

They cannot:

* Add/remove datasets
* Change collection metadata
* Modify grants

Collections should visually communicate:

“This is an access boundary.”

Users must understand that being added to a collection affects access.

---

## 2.5 Access (Requests)

Normal users can:

* Request dataset access
* Request collection access
* View their request history
* See request status

No complex workflow screens.
Simple status model: Submitted → Approved / Rejected / Expired.

No administrative grant editing UI exposed.

---

# 3. Group Admin UI

Group admins are local governance authorities.
They control resources owned by their group only.

The UI must reinforce locality.

They should never feel like global admins.

---

## 3.1 Home

Sections:

* Groups I Admin
* Datasets Owned by My Groups
* Pending Access Requests (for my groups)
* Expiring Grants
* Recent Governance Activity

No global system metrics.

---

## 3.2 Groups

For groups they admin:

Tabs:

* Overview
* Members
* Admins
* Owned Resources
* Activity Log

Capabilities:

* Add/remove members
* Promote/demote admins
* Edit metadata
* Archive (if policy allows)

They cannot:

* Modify parent relationships
* Edit ancestor groups
* Control descendant groups unless directly admin

Oversight distinction:

If they are ancestor admin but not direct admin:

They see group as read-only with explicit label:

“Oversight visibility only”

This is critical to prevent authority confusion.

---

## 3.3 Datasets (Owned by Their Group)

On dataset page (owned by their group):

Admin controls:

* Edit metadata
* Grant access
* Revoke access
* Transfer ownership
* Add/remove from collections
* Change visibility preset
* Archive

But only for datasets owned by their group.

If dataset belongs to descendant group:

* Show governance metadata (oversight)
* Disable controls
* Clearly state “Oversight only”

Never silently hide controls — that creates confusion.

---

## 3.4 Collections

Collections owned by their group:

Capabilities:

* Create new collection
* Add/remove datasets
* Grant access at collection level
* Revoke grants
* Archive collection

Must show:

“Adding dataset changes access for X subjects”

Make access impact explicit before confirmation.

This reduces accidental privilege expansion.

---

## 3.5 Access Review Panel

Dedicated governance surface:

* View all active grants for group-owned resources
* Filter by subject, expiration, access type
* Bulk revoke
* View audit history
* See why a subject has access (grant chain)

Explainability is not optional.

Admins must never guess.

---

# 4. Platform Admin UI

Platform admins are system-level stewards.

Their UI is governance-heavy, not data-heavy.

---

## 4.1 Home

Sections:

* System Overview
* Total Datasets
* Active Grants
* Expiring Grants
* Archived Groups
* Recent High-Risk Activity
* Incident Controls

This is operational.

---

## 4.2 Global Group Explorer

Full hierarchy tree.

Capabilities:

* Create groups
* Reparent groups
* Archive/unarchive
* View all members
* Audit history

Must show closure-table hierarchy clearly.

Since reparenting changes oversight visibility, the UI must:

* Preview oversight changes before confirmation
* Warn: “This changes governance visibility, not ownership”

---

## 4.3 Dataset Explorer

Global search:

* Filter by owning group
* Filter by visibility preset
* Filter by grant status
* See orphaned resources
* Detect policy anomalies

Incident response controls:

* Freeze dataset
* Revoke grants system-wide
* Override archive restrictions (with reason field)

All actions require justification text.

---

## 4.4 Access Governance Console

This is distinct from group admin panel.

Capabilities:

* View any grant
* Revoke any grant
* View historical grant chains
* Inspect access explanation engine
* Simulate access (“Why does user X have read access?”)

The UI should allow:

Input:
User + Dataset

Output:
Exact chain:

* Membership via Group A
* Grant via Collection B
* Valid until date

Transparency is foundational.

---

# 5. Cross-Cutting UI Features (All Roles)

## 5.1 Access Explanation

Every dataset page must include:

“Why do I have access?”

This should expand into:

* Ownership membership
* Explicit grants
* Collection grants
* Expiration details

This reinforces trust.

---

## 5.2 Visibility Indicator

Each dataset and collection should clearly show:

* Private (group only)
* Group-visible
* Institutionally discoverable
* Public

These are derived from grant templates, not magic flags.

---

## 5.3 Authority Badges

Next to user names and group names:

* Member
* Admin
* Oversight
* Platform Admin

Never rely on implicit understanding.

---

# 6. Avoid These UI Anti-Patterns

1. Mixing governance controls into general dataset browsing.
2. Hiding unavailable controls instead of showing them disabled with explanation.
3. Displaying full hierarchy to all users.
4. Showing raw grant tables without contextual explanation.
5. Making collection membership look like simple tagging (it is not).

---

# 7. Simplest Robust UI Model

Instead of building complex conditional UIs per role:

Build a single system with:

* Capability-based rendering
* Clear authority boundaries
* Explicit state labeling
* One consistent mental model

This adheres to KISS and DRY.

Complexity should live in policy engine, not in UI branching logic.

---

Below is a structured screen map derived from the governance model in  and the previously defined role behaviors.

This is not layout. It is the full navigational and capability surface of the system, organized by domain and role visibility.

The principle: one product, one navigation model, capability-based rendering.

---

# 0. Global Navigation (All Roles)

Primary Navigation:

* Home
* Groups
* Datasets
* Collections
* Access
* Admin (conditional)

Admin appears only if user is:

* Group admin (scoped admin surface)
* Platform admin (system-wide surface)

User Profile (top-right):

* My Memberships
* My Access Requests
* Activity Log
* API Tokens (if applicable)

---

# 1. Home

## 1.1 Normal User Home

```
Home
├── My Groups
├── My Datasets (created by me)
├── Datasets in My Groups (recent)
├── Shared With Me
└── Institutionally Discoverable (if enabled)
```

No governance panels.

---

## 1.2 Group Admin Home

```
Home
├── Groups I Admin
├── Datasets Owned by My Groups (recent)
├── Pending Access Requests (for my groups)
├── Expiring Grants
└── Recent Governance Activity
```

---

## 1.3 Platform Admin Home

```
Home
├── System Metrics
│    ├── Total Datasets
│    ├── Active Grants
│    ├── Archived Groups
│    └── Expiring Grants
├── Recent High-Risk Activity
├── Archived Entities
└── Incident Controls
```

---

# 2. Groups Domain

```
Groups (List Page)
├── Search
├── Filter (My Groups / Admin Groups / Discoverable / All*)
└── Group Tree (scope filtered by role)
```

*“All” only for platform admin.

---

## 2.1 Group Detail Page

```
Group: {GroupName}
├── Overview
├── Members
├── Admins
├── Owned Datasets
├── Owned Collections
├── Activity Log
└── Settings (conditional)
```

### Visibility by Role

Normal User:

* Overview
* Members (if allowed)
* Owned Datasets (filtered by their access)
* No Settings

Group Admin (of this group):

```
* All tabs
* Settings enabled:
  ├── Edit Metadata
  ├── Manage Members
  ├── Manage Admins
  ├── Archive Group
  └── Group Policies (e.g., default member data access)
```

Ancestor Admin (oversight only):

* Overview (read-only)
* Members (read-only)
* Owned Datasets (read-only governance metadata)
* No mutation controls

Platform Admin:

```
* All tabs
* Advanced Settings:
  ├── Reparent Group
  ├── Unarchive
  ├── Structural Audit
  └── Incident Override
```
---

# 3. Datasets Domain

```
Datasets (List Page)
├── Search
├── Filters
│    ├── Owned by My Groups
│    ├── Shared With Me
│    ├── Discoverable
│    ├── By Group
│    ├── By Collection
│    └── Archived
└── Results Table
```

Scope depends on role.

---

## 3.1 Dataset Detail Page

```
Dataset: {DatasetName}
├── Overview
├── Metadata
├── Access
├── Collections
├── Activity Log
└── Settings (conditional)
```

---

### Tabs Breakdown

```
Overview
├── Owner Group
├── Visibility Status
├── Created By
├── Created At
└── Why I Have Access (expandable explanation)
```

```
Metadata
├── Standard Metadata
├── Sensitive Metadata (conditional)
└── Edit (if admin)
```

```
Access
├── Active Grants
├── Grant History
├── Grant Access (admin only)
├── Revoke (admin only)
└── Request Access (non-admin)
```

```
Collections
├── Member Of
├── Add to Collection (admin only)
└── Remove (admin only)
```

```
Activity Log
├── Grant Created
├── Grant Revoked
├── Visibility Changed
├── Ownership Transfer
└── Policy Decisions
```

```
Settings (admin only)
├── Change Visibility Preset
├── Transfer Ownership
├── Archive Dataset
└── Incident Freeze (platform admin)
```

---

# 4. Collections Domain

```
Collections (List Page)
├── Search
├── Filter (Owned by My Groups / Visible / All*)
└── Results
```

---

## 4.1 Collection Detail Page

```
Collection: {CollectionName}
├── Overview
├── Datasets
├── Access
├── Activity Log
└── Settings (conditional)
```

```
Overview
├── Owner Group
├── Description
└── Visibility Summary
```

```
Datasets
├── List of Datasets
├── Add Dataset (admin only)
└── Remove Dataset (admin only)
└── Access Impact Preview (mandatory confirmation)
```

```
Access
├── Active Grants
├── Grant Access (admin only)
├── Revoke
└── Grant History
```

```
Settings
├── Edit Metadata
├── Archive Collection
└── Transfer Ownership
```

Oversight behavior mirrors datasets:

* Ancestor admins see read-only governance metadata.

---

# 5. Access Domain

This is where grants and requests live.

```
Access
├── My Requests
├── Pending Requests (if admin)
├── Active Grants (scoped)
├── Expiring Grants
└── Access Simulation (platform admin)
```

---

## 5.1 My Requests

```
My Requests
├── Submitted
├── Approved
├── Rejected
└── Expired
```

---

## 5.2 Pending Requests (Group Admin)

```
Pending Requests
├── Filter by Resource Type
├── Approve
├── Reject
├── Modify Duration / Access Type
└── Justification Required
```

---

## 5.3 Active Grants View

For Group Admin:

* Grants on resources owned by their group

For Platform Admin:

```
* Global grant explorer
  ├── Filter by subject
  ├── Filter by group
  ├── Filter by resource
  ├── Filter by expiration
  └── Revoke (with justification)
```

---

## 5.4 Access Simulation (Platform Admin Only)

```
Access Simulation
├── Select User
├── Select Dataset
└── Output:
├── Membership Path
├── Grant Path
├── Collection Path
└── Expiration Details
```

This is a diagnostic screen, not normal browsing.

---

# 6. Admin Domain (Conditional Entry)

Visible only if:

* User is group admin → scoped admin view
* User is platform admin → full system admin view

```
Admin
├── Group Administration
├── Dataset Governance
├── Collection Governance
├── Access Governance
└── System Settings (platform only)
```

---

# 7. Role-Based Capability Overlay

Instead of separate UIs, think in overlays:

Normal User:

* No Settings tabs
* No Grant Access buttons
* No Revoke controls
* No Structural mutations

Group Admin:

* Mutation controls on owned resources
* Scoped Access panels
* Scoped Admin domain

Platform Admin:

* Structural controls
* Reparenting
* Global search
* Incident overrides
* System metrics

---

# 8. Structural Invariants Reflected in Screen Map

1. Ownership controls mutation screens.
2. Oversight enables read-only governance screens.
3. Grants appear only in Access tabs.
4. Visibility presets never bypass Access tab (they generate grants).
5. Structural mutations are isolated to Settings.
6. Reparenting is only under platform-level Group Settings.

This keeps governance logic consistent with the architecture defined in .

---

# 9. Simplicity Check (KISS)

This screen map avoids:

* Separate admin portals
* Hidden role-specific navigation
* Grant editing mixed into browsing
* Structural mutations in list views

Complexity lives in:

* Authorization engine
* Not in UI branching