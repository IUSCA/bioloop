<!-- cSpell:ignore Okafor Adeyemi Nwosu Ferreira Baptiste Vasquez -->

# Demo run sheet: groups and access control

This is the presenter's script for a 15-minute demo of the v2 groups and access-control
features, for an audience of center heads. The slides to show alongside it are in
[deck.md](./deck.md).

Every account is a plain user. No page in the demo is seen through a platform admin, so the
audience sees exactly what the access model decides.

## Before presenting

The demo writes real grants, requests, audit rows, and notifications. Reset and re-seed after
every practice run, and once more right before the demo.

```bash
cd api
npx prisma migrate reset --force --skip-seed
npm run seed:demo
cd .. && bin/devserver.sh restart api
```

Wait until `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3030/` prints `401`.
That status means the API is up and asking for a login.

Never run `npm run seed:demo` on top of `npm run seed`. The demo world and the flows world
share usernames. See [The demo world](../guides/dev-servers.md#the-demo-world).

## The cast

| Account | Name | Standing |
|---|---|---|
| `dana` | Dana Okafor | Admin of Center for Precision Health Research; oversight of every lab |
| `alice` | Alice Wong | Admin of Wong Cancer Genomics Lab and its Tumor Sequencing Unit |
| `frank` | Frank Adeyemi | Member of Vasquez Neuroimaging Lab, the outsider who requests access |
| `bob` | Bob Ferreira | Member of Wong Cancer Genomics Lab |
| `carol` | Carol Nwosu | Member of Tumor Sequencing Unit |
| `erin` | Erin Vasquez | Admin of Vasquez Neuroimaging Lab |
| `quinn` | Quinn Baptiste | No group and no grant |

Sign in as anyone with `https://localhost/dev-login?username=<name>&next=<path>`.

## Scenes (15 min)

| # | Who | Where | Do and say | Min |
|---|---|---|---|---|
| 1 | `dana`, center head | [Groups](https://localhost/dev-login?username=dana&next=/v2/groups) | Open the center, then Wong Cancer Genomics Lab and its Tumor Sequencing Unit. Point out that Dana oversees every lab without being a member. | 2 |
| 2 | `alice`, lab PI | [BRCA Cohort Release 1](https://localhost/dev-login?username=alice&next=/v2/collections/de300000-0000-4000-8000-000000000101) | Show the About text and publications. Open **Access**: the lab can read its own data from the start. Click **Grant access**, choose Authenticated Users and **Discoverable**, then Grant. | 3 |
| 3 | `frank`, outsider | [Collections](https://localhost/dev-login?username=frank&next=/v2/collections) | BRCA Cohort Release 1 now appears. Open it and click **Request access**. Choose Standard Research Use and write a purpose, such as "Validating our MRI tumor-burden model against the somatic calls." Submit. | 2 |
| 4 | `alice` | [BRCA Cohort Release 1](https://localhost/dev-login?username=alice&next=/v2/collections/de300000-0000-4000-8000-000000000101) | Show the bell, then the Requests tab. Click **Review**, then Approve and **Set date**. Wait a second for the preview, add a reason, and submit. On **Access**, open Frank's row: "approved by Alice Wong", his purpose, and the expiry date. | 3 |
| 5 | `frank` | [BRCA Cohort Release 1](https://localhost/dev-login?username=frank&next=/v2/collections/de300000-0000-4000-8000-000000000101) | Open the Datasets tab and then BRCA-WGS-Batch01: the file tree is open to him. The bell shows "approved". | 1 |
| 6 | `alice`, then `frank` | [Alice's collection](https://localhost/dev-login?username=alice&next=/v2/collections/de300000-0000-4000-8000-000000000101), then [Frank's notifications](https://localhost/dev-login?username=frank&next=/notifications) | Alice opens **Access** and clicks **Remove All Access** on Frank. Frank's notifications show "Your access to BRCA Cohort Release 1 was revoked". | 2 |
| 7 | `dana` | [BRCA Cohort Release 1](https://localhost/dev-login?username=dana&next=/v2/collections/de300000-0000-4000-8000-000000000101) | Open **Audit Log**. Every step appears by name: the grant, the request, the approval, and the revocation. | 2 |

## Spare accounts, if asked

- **`bob`** is a plain lab member who reads the lab's data without asking.
- **`carol`** is a member of the sub-unit. Her membership reaches up through the lab.
- **`erin`** is another lab's admin. She has no say over Alice's data.
- **`quinn`** belongs to no group, and her portal is empty until something is granted to everyone.

## Things to know on stage

- **Wait before reading the approval preview.** After **Set date**, the preview takes a
  moment to refresh. Read it too early and it still says "expires never".
- **Tab counts can lag.** The Access tab count did not change right after an approval in one
  practice run. Reload the page if a count looks wrong.
- **Dataset links change on every reset.** Reach datasets through the collection's Datasets
  tab, as the scenes above do, rather than from a saved dataset URL.
- **Staging needs the workers.** The Python workers are not part of this demo, so do not
  start staging or downloads on stage.
