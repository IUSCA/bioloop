<!-- cSpell:ignore Okafor Adeyemi Nwosu Ferreira Baptiste Vasquez -->

# Bioloop groups and access control

**Who can use your center's data, who decided, and for how long.**

A 15-minute walkthrough for center heads.

The presenter's script is in the [run sheet](./run-sheet.md).

---

## The problem

- Data is collected by labs, but used across the center and beyond.
- Access decisions today are scattered across email threads and memory.
- A center head cannot easily answer three questions:
  - Who can see this data right now?
  - Who approved that, and why?
  - When does that access end?

---

## What this release does

- **Groups mirror your organisation.** A center contains labs, and a lab contains units.
- **The lab that owns the data governs it.** Its admins grant access and review requests.
- **Center heads oversee, without micromanaging.** They see every lab below them.
- **Access is requested, reviewed, time-limited, and revocable.**
- **Every decision is recorded,** with who made it and why.

---

## Today's center

**Center for Precision Health Research**

- **Wong Cancer Genomics Lab**, with its Tumor Sequencing Unit
- **Vasquez Neuroimaging Lab**
- **Sequencing Core Facility**

| Person | Role in the story |
|---|---|
| Dana Okafor | Center head |
| Alice Wong | Lab PI and data steward for the BRCA cohort |
| Frank Adeyemi | A researcher in another lab who needs the data |

---

## 1. The center at a glance

**Dana, the center head, sees the whole structure she is responsible for.**

- The center, its labs, and their units in one tree.
- Oversight of every lab below her, without being added to each one.

👉 [Open Groups as Dana](https://localhost/dev-login?username=dana&next=/v2/groups)

---

## 2. A lab publishes its data

**Alice's lab owns BRCA Cohort Release 1: genomes, transcriptomes, and somatic calls for 24 participants.**

- The collection explains itself: what's in it, how to use it, and how to cite it.
- The lab reads its own data from the start. Nobody else does.
- Alice makes the collection **discoverable**. Everyone signed in can now see that it exists,
  but not its files.

👉 [Open the collection as Alice](https://localhost/dev-login?username=alice&next=/v2/collections/de300000-0000-4000-8000-000000000101)

---

## 3. An outsider asks for access

**Frank works in the neuroimaging lab and needs the somatic calls for a joint grant.**

- He finds the collection because it is discoverable.
- He requests a standard research bundle: browse, and download.
- He states his purpose. The request goes to the lab that owns the data, not to IT.

👉 [Open Collections as Frank](https://localhost/dev-login?username=frank&next=/v2/collections)

---

## 4. The data steward decides

**Alice is notified, reviews the request, and approves it for one month.**

- She sees who is asking, for what, and why.
- She sets an end date. Access expires on its own.
- She records her reason for approving.
- The preview shows exactly what will be granted before she commits.

👉 [Review as Alice](https://localhost/dev-login?username=alice&next=/v2/collections/de300000-0000-4000-8000-000000000101)

---

## 5. Access, explained

**Frank can now browse and download the datasets in the collection.**

- He is told his request was approved.
- Every grant says where it came from: which request, who approved it, and when it ends.

👉 [Open the collection as Frank](https://localhost/dev-login?username=frank&next=/v2/collections/de300000-0000-4000-8000-000000000101)

---

## 6. Access ends

**The project wraps up early. Alice removes Frank's access in one step.**

- Access stops immediately.
- Frank is told his access was revoked.

👉 [Remove access as Alice](https://localhost/dev-login?username=alice&next=/v2/collections/de300000-0000-4000-8000-000000000101)
· [See Frank's notifications](https://localhost/dev-login?username=frank&next=/notifications)

---

## 7. Everything is on the record

**Dana opens the audit log for the collection.**

- Made discoverable, by Alice.
- Requested, by Frank, with his purpose.
- Approved, by Alice, with an end date and a reason.
- Revoked, by Alice.

👉 [Open the audit log as Dana](https://localhost/dev-login?username=dana&next=/v2/collections/de300000-0000-4000-8000-000000000101)

---

## What you saw

| Question a center head asks | Where the answer lives |
|---|---|
| Who can see this data right now? | The collection's **Access** tab |
| Who approved that, and why? | Each grant's origin, and the **Audit Log** |
| When does that access end? | The expiry on every grant |
| What happens across my labs? | Oversight from the center down |

---

## Questions

- [Groups](https://localhost/dev-login?username=dana&next=/v2/groups) ·
  [BRCA Cohort Release 1](https://localhost/dev-login?username=alice&next=/v2/collections/de300000-0000-4000-8000-000000000101) ·
  [Frank's view](https://localhost/dev-login?username=frank&next=/v2/collections)
- A lab member: [Bob](https://localhost/dev-login?username=bob&next=/v2/collections)
- Another lab's admin: [Erin](https://localhost/dev-login?username=erin&next=/v2/collections)
- Someone with no groups: [Quinn](https://localhost/dev-login?username=quinn&next=/v2/collections)
