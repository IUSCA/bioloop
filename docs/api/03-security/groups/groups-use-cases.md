---
title: Use Cases
---

## 0. Core assumptions (explicit, so the use cases make sense)

These are not design choices, but implicit expectations users already have:

* A *group* is a persistent security and governance boundary.
* Groups can be hierarchical; permissions flow transitively unless explicitly broken.
* Datasets have a single owning group, but may be accessible by many groups.
* Access can be granted at:

  * individual dataset level
  * collection level (bundle of datasets)
* Access is **revocable**, **auditable**, and **time-bound** (at least conceptually).
* Admin authority is scoped (group admin ≠ app admin).

If any of these are violated, user expectations will break.

---

## 1. Researcher / Data Consumer use cases

These users mostly *request*, *discover*, and *use* data. They do not want to think about IAM models.

### 1.1 Discoverability & visibility

1. **Browse datasets I already have access to**

   * Expectation: immediate visibility, no approval flow.
   * Includes datasets inherited from parent groups.

2. **Search for datasets I do not yet have access to**

   * Expectation: metadata visible without data access.
   * Sees owning group, steward contact, and access policy.

3. **Browse collections**

   * Expectation: collections behave like “logical datasets”.
   * User can see collection contents even if access is partial.

4. **Understand why I can or cannot access something**

   * Expectation: system explains *source of access* (direct grant, group inheritance, collection).
   * If denied, shows what is missing (approval, training, IRB, etc.).

This is standard in systems like Synapse and Terra; lack of explanation causes support tickets.

---

### 1.2 Requesting access

5. **Request access to a single dataset**

   * Can include justification, project reference, duration.
   * Can request different levels (read, compute, download).

6. **Request access to a collection**

   * One request → many datasets.
   * User expects atomicity: either the collection is approved, or they are told what failed.

7. **Request access on behalf of a group**

   * E.g., “Grant X needs access,” not “me personally”.
   * Very common in collaborative research.

8. **Track request status**

   * Pending / approved / rejected / expired.
   * Clear ownership of who is reviewing.

9. **Receive notification of decision**

   * Approval, rejection, request for clarification.

10. **Re-request or renew access**

    * Especially for time-limited approvals.
    * Expect system to remember prior approvals.

---

### 1.3 Using data

11. **Access data consistently across interfaces**

    * Portal, API, compute environment all agree.
    * No “it works in UI but not in analysis”.

12. **Lose access immediately when revoked**

    * Revocation is not eventual or best-effort.

13. **Cite dataset ownership correctly**

    * Researchers expect to know attribution requirements.

---

## 2. Group Admin / Data Steward use cases

These users are the operational backbone. They will push the system hardest.

### 2.1 Group lifecycle & hierarchy

14. **Create a group**

    * Choose type (Lab, Grant, Core, Center).
    * Assign initial admins.

15. **Create child groups**

    * E.g., Grant → Aim → Subproject.
    * Expect inherited permissions by default.

16. **Reorganize group hierarchy**

    * Move a child group under a different parent.
    * System must recompute transitive access safely.

17. **Deactivate or archive a group**

    * Access is frozen but audit history preserved.

---

### 2.2 Membership management

18. **Add a user to a group**

    * With a role (member, admin, steward).

19. **Remove a user**

    * Immediate revocation of all derived permissions.

20. **Change user role**

    * Member → admin; admin → member.

21. **View effective permissions of a user**

    * “What does Alice have access to via this group?”

22. **Bulk membership operations**

    * Add/remove many users at once.
    * Extremely common for grants and courses.

---

### 2.3 Dataset ownership & organization

23. **Register a new dataset**

    * Assign owning group.
    * Attach metadata, policies, and access tiers.

24. **Transfer dataset ownership**

    * E.g., when a grant ends or a PI moves institutions.
    * This is painful if not supported explicitly.

25. **Organize datasets into collections**

    * Collections are versioned over time.
    * Adding/removing datasets updates access automatically.

26. **Deprecate or retire a dataset**

    * Existing access is revoked or frozen.
    * Users are notified.

---

### 2.4 Granting and revoking access

27. **Approve an access request**

    * At dataset or collection level.
    * Possibly with conditions (time-bound, purpose-bound).

28. **Reject a request with reason**

    * Reason is visible to requester.

29. **Grant access proactively**

    * Without a request (e.g., collaborators).

30. **Grant access to a group**

    * All current and future members inherit access.

31. **Revoke access**

    * Individual, group, or collection-based.

32. **View all active access grants**

    * For compliance and review.

33. **Expire access automatically**

    * Based on date, project end, or user departure.

---

### 2.5 Auditing & compliance

34. **See access history**

    * Who granted what, when, and why.

35. **Generate reports**

    * For IRB, funding agencies, audits.

36. **Confirm least-privilege**

    * Identify users/groups with unusually broad access.

These are table-stakes in regulated research environments.

---

## 3. App Admin / Platform Admin use cases

These users care about **global correctness**, not individual projects.

### 3.1 System-wide governance

37. **Define group types and rules**

    * E.g., Grants must have an end date.
    * Cores can own shared datasets.

38. **Define allowed permission types**

    * Read, compute, download, derivative use, etc.

39. **Override group-level decisions**

    * Emergency revocation or approval.

40. **Impersonate users (read-only)**

    * For debugging access issues.

---

### 3.2 Identity & lifecycle integration

41. **Provision users from institutional identity**

    * SSO, LDAP, federated identity.

42. **Deprovision users automatically**

    * When affiliation ends.

43. **Handle external collaborators**

    * Limited identity, time-bound access.

44. **Merge or split identities**

    * Common in academia due to name/email changes.

---

### 3.3 Policy enforcement

45. **Enforce mandatory training or agreements**

    * Data use agreements, HIPAA, export control.

46. **Block access despite group membership**

    * If compliance conditions are unmet.

47. **Freeze access platform-wide**

    * Incident response.

---

## 4. Cross-cutting and future-facing use cases

These are not “nice to have”; they are what systems grow into.

### 4.1 Scale and automation

48. **Programmatic access via API**

    * Grants, revocations, audits at scale.

49. **Event-driven updates**

    * Access changes propagate to downstream systems.

50. **Policy-based access**

    * “All datasets in Center X are accessible to Core Y unless marked restricted.”

---

### 4.2 Evolution over time

51. **Versioned datasets and collections**

    * Access applies to versions predictably.

52. **Dataset splitting or merging**

    * Historical access is preserved logically.

53. **Sunsetting collections**

    * With migration paths.

---

### 4.3 User experience expectations

54. **No silent access changes**

    * Users are notified of grants and revocations.

55. **Explainability**

    * Every access decision is explainable in human terms.

56. **Consistency across environments**

    * Portal, APIs, compute, exports all agree.

---

## 5. Dataset Visibility Use Cases

### A. Public Sample / Example Dataset

1. **Anyone can discover the dataset**

   * Title, description, owner, and high-level metadata are visible to all authenticated users.
   * Dataset appears in search results.

2. **Anyone can read and download the dataset**

   * No access request workflow is required.
   * Access is consistent across UI, API, and compute environments.

3. **Changing from Public to Restricted**

   * Global read access is revoked immediately.
   * Users retain access only if they have an independent explicit grant or qualifying group-based access.
   * An audit event records the visibility change.
   * The system can explain who retains access and why.

4. **Audit visibility**

   * Administrators can query which datasets are globally readable.
   * Historical visibility states are auditable.

---

### B. Discoverable but Locked Dataset

5. **Anyone can discover the dataset**

   * Metadata is visible to all authenticated users.
   * Data is not readable without approval.

6. **Users can request access**

   * A request can target:

     * The individual dataset, or
     * A collection containing the dataset.
   * Request includes justification and optional duration.

7. **Access explanation**

   * If denied, the system clearly indicates that no qualifying grant exists.

8. **Changing from Discoverable to Group-Only**

   * Dataset is removed from global search results.
   * Existing grants (individual, group, or collection-based) remain valid.

---

### C. Group-Visible Dataset (Internal to Owning Group)

9. **Members of owning group and descendant groups can read**

   * Access is transitive via hierarchy.
   * No explicit per-user grants required.

10. **External users cannot discover**

    * Dataset does not appear in search for non-members.
    * No metadata leakage.

11. **Granting external collaborator access**

    * Group admin may issue:

      * Direct dataset-level grant, or
      * Grant via a collection.
    * System clearly explains access source (group membership, dataset grant, or collection grant).

---

### D. Group-Discoverable but Explicit-Grant Required

12. **Members can see metadata but not read data**

    * Encourages internal discovery without automatic exposure.
    * Data access requires explicit approval.

13. **Group-level access request**

    * Admin may request access on behalf of a group.
    * Approval may be granted at:

      * Dataset level, or
      * Collection level.

---

### E. Steward-Only Dataset

14. **Only group admins/stewards can discover**

    * Used for embargoed, pre-publication, or sensitive datasets.

15. **Non-admin members cannot see dataset exists**

    * No metadata exposure.

16. **Escalation path**

    * Platform admin may override in emergency.
    * All overrides are auditable.

---


TODO:
- collection visibility use cases