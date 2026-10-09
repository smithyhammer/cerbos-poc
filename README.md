# Cerbos POC

A proof of concept showing how to move authorization out of application code and into
[Cerbos](https://www.cerbos.dev/), an open-source policy decision point (PDP).

The demo is a small **expense management** app. Users switch between hard-coded identities
(an admin, employees and managers in different departments). Every question like
*"can this user see the Approvals page?"* or *"can this user approve expense exp-002?"* is
answered by the Cerbos PDP, based on YAML policies in [`policies/`](policies). The application
code contains no role checks.

What the POC demonstrates:

- **Externalised authorization.** Policies live in version-controlled YAML, separate from the
  code, and can be changed without redeploying the API. Cerbos reloads them automatically.
- **Role- and attribute-based access control (RBAC + ABAC).** Decisions combine the user's role
  with attributes such as department, expense owner, amount and status.
- **One source of truth for UI and API.** The Angular UI hides navigation, pages and buttons
  based on Cerbos decisions, and the API asks Cerbos again on every request. A **Reveal
  hidden UI** toggle shows the hidden controls so you can watch the API reject them with
  `403 Denied by Cerbos`.
- **Policy versioning.** A proposed `v2` rule set sits alongside the current `default` rules.
  Admins switch the active version from the header, and every page instantly reflects the
  other version's decisions. No redeploy is needed, and switching back is instant.
- **Policy unit tests.** Policies ship with YAML test suites that Cerbos runs offline, with no
  application involved.

---

## Contents

- [Architecture](#architecture)
- [Solution layout](#solution-layout)
- [Demo users and data](#demo-users-and-data)
- [Running the application](#running-the-application)
- [The policies](#the-policies)
- [Policy versioning](#policy-versioning)
- [How the application uses Cerbos](#how-the-application-uses-cerbos)
- [Testing policy files](#testing-policy-files)
- [The Cerbos playground and API explorer](#the-cerbos-playground-and-api-explorer)
- [Changing a policy: worked example](#changing-a-policy-worked-example)
- [API reference](#api-reference)
- [Troubleshooting](#troubleshooting)

---

## Architecture

```
┌──────────────────────┐   /api/*    ┌──────────────────────┐   gRPC    ┌──────────────────────┐
│  CerbosPoc.Web       │ ──────────► │  CerbosPoc.Demo      │ ────────► │  Cerbos PDP          │
│  Angular 21 +        │  X-Demo-User│  ASP.NET Core API    │  :3593    │  (container)         │
│  Tailwind (ng serve) │   header    │  (Cerbos .NET SDK)   │           │  HTTP :3592          │
└──────────────────────┘             └──────────────────────┘           └──────────┬───────────┘
                                                                                   │ bind mount,
                                                                                   │ hot reload
                                                                        ┌──────────▼───────────┐
                                                                        │  policies/*.yaml     │
                                                                        └──────────────────────┘
        All three are started and wired together by CerbosPoc.AppHost (.NET Aspire).
```

1. The browser picks a demo user, and every API call sends that user's id in the `X-Demo-User` header.
2. The API maps the user to a Cerbos **principal** (id, role and `department` attribute) and the
   domain object to a Cerbos **resource** (kind, id and attributes).
3. The API calls the PDP's `CheckResources` endpoint and allows or rejects the request based
   on the result.
4. The PDP evaluates the policies in `policies/` and returns `EFFECT_ALLOW` or `EFFECT_DENY`
   for each requested action.

---

## Solution layout

```
cerbos-poc/
├── CerbosPoc.slnx               .NET solution (AppHost, Demo, ServiceDefaults)
├── CerbosPoc.AppHost/           .NET Aspire orchestrator: runs Cerbos, the API and the UI
├── CerbosPoc.Demo/              ASP.NET Core minimal API that enforces Cerbos decisions
├── CerbosPoc.ServiceDefaults/   Shared Aspire defaults: telemetry, health checks, resilience
├── CerbosPoc.Web/               Angular + Tailwind front end
├── app/                         Stand-alone Node.js script that prints a decision matrix from the API
├── policies/                    Cerbos policies, version "default" (the actual authorization rules)
│   └── v2/                      Proposed version "v2" of the same policies
├── tests/                       Cerbos policy unit tests for "default"
│   └── v2/                      Policy unit tests for "v2"
└── docker-compose.yml           Runs only the Cerbos PDP, for use without Aspire
```

### CerbosPoc.AppHost

The [.NET Aspire](https://aspire.dev/) app host and the normal way to run the solution.
[`AppHost.cs`](CerbosPoc.AppHost/AppHost.cs) declares three resources:

| Resource | What it runs | Notes |
|----------|--------------|-------|
| `cerbos` | `ghcr.io/cerbos/cerbos:latest` container | Bind-mounts `../policies` to `/policies` (read-only) and exposes HTTP (3592) and gRPC (3593) on Aspire-assigned host ports. Health-checked on `/_cerbos/health`. |
| `api` | `CerbosPoc.Demo` | Gets the PDP's gRPC address through the `CERBOS_GRPC` environment variable and waits until Cerbos is healthy. |
| `web` | `npm start` in `CerbosPoc.Web` | Gets the API address through Aspire service discovery, and the Aspire-assigned port is passed to `ng serve --port`. Waits for the API. |

The Aspire dashboard shows every resource's logs, traces, health and endpoint URLs, including
the host port the Cerbos container was given.

### CerbosPoc.Demo

The Web API: an ASP.NET Core (.NET 10) minimal API that uses the
[`Cerbos.Sdk`](https://www.nuget.org/packages/Cerbos.Sdk) NuGet package.

| File | Purpose |
|------|---------|
| [`Program.cs`](CerbosPoc.Demo/Program.cs) | Endpoints. An endpoint filter resolves `X-Demo-User` and returns 401 for unknown users. Every endpoint asks Cerbos before reading or changing data, and returns a `403 Denied by Cerbos` problem response on deny. |
| [`CerbosAuthorizer.cs`](CerbosPoc.Demo/CerbosAuthorizer.cs) | Thin wrapper over the SDK that turns `DemoUser` into a Cerbos `Principal` and `Expense`/sections into Cerbos `Resource`s. It batches many resources into a single `CheckResources` call and stamps every principal and resource with the active policy version. All authorization decisions go through this class. |
| [`PolicyVersions.cs`](CerbosPoc.Demo/PolicyVersions.cs) | The list of known policy versions (id, label and a summary of their rules) and the in-memory active version, which is shared by all users. |
| [`DemoData.cs`](CerbosPoc.Demo/DemoData.cs) | The hard-coded demo users (in place of an identity provider) and a thread-safe in-memory `ExpenseStore` seeded with sample expenses. |

When run on its own (outside Aspire), the API listens on `http://localhost:5180` and connects
to Cerbos at `http://localhost:3593`.

### CerbosPoc.ServiceDefaults

The standard Aspire service-defaults library, referenced by the API. `AddServiceDefaults()`
configures OpenTelemetry logging, metrics and tracing (exported to the Aspire dashboard over
OTLP), service discovery, HTTP client resilience, and default health checks.
`MapDefaultEndpoints()` exposes `/health` and `/alive` in Development.

### CerbosPoc.Web

The Angular 21 single-page app, styled with Tailwind CSS v4. It isn't in the `.slnx` file
because it's a Node project; the AppHost starts it.

| Path | Purpose |
|------|---------|
| `src/app/session.ts` | Keeps the selected user (saved in `localStorage`), the `/api/me` decisions for that user, and the policy versions. Its `context` signal changes when the user *or* the policy version changes, and every page reloads its data when it does. Adds the `X-Demo-User` header to every request and shows API errors as toasts. |
| `src/app/app.routes.ts` | Routes with a `sectionGuard` that sends users away from sections Cerbos denies. The guard only improves the UI; the API enforces the same rule. |
| `src/app/app.html` | Header with nav links filtered by Cerbos, the **Policy** version picker (admins) or badge (everyone else), the **Reveal hidden UI** toggle, and the user switcher. |
| `src/app/pages/` | Home (policy versions side by side, and the current user's decisions), Expenses, Approvals, Reports and Admin (an access matrix for all users, plus a data reset). |
| `src/app/pages/expense-table.ts` | The expense grid shared by Expenses and Approvals: [filters](#expense-grid-filters), per-row **Approve**/**Delete** buttons driven by Cerbos decisions. |
| `src/styles.css` | Tailwind import plus shared component classes (`btn`, `card`, `data-table`, `status`, …). |
| `proxy.conf.js` | Proxies `/api` to the API. The address comes from Aspire, or falls back to `http://localhost:5180`. |

### app/ (Node decision-matrix script)

A stand-alone script, [`app/index.mjs`](app/index.mjs), that prints an allow/deny matrix of
every demo user against the stored expenses. It has no dependencies and doesn't use a Cerbos
client library. Like the Angular UI, it never talks to the PDP directly: it calls the API's
`GET /api/admin/expense-matrix` endpoint, and the API queries Cerbos. It's a quick way to check
decisions from the command line:

```bash
docker compose up -d                      # PDP on localhost:3592 / 3593
dotnet run --project CerbosPoc.Demo       # API on http://localhost:5180
cd app && npm start
```

The script calls the API as `alice`, because the endpoint requires access to the admin section.
Set `API_URL` to use a different API address, or `DEMO_USER` to call as another user. Any
non-admin user gets `403 Denied by Cerbos`.

### policies/ and tests/

The Cerbos policy files and their unit tests, both described in detail below.

### docker-compose.yml

Runs only the Cerbos PDP, on fixed ports `3592` (HTTP) and `3593` (gRPC), with `./policies`
mounted. Use it when running the API, the UI or the Node script without Aspire.

---

## Demo users and data

Defined in [`DemoData.cs`](CerbosPoc.Demo/DemoData.cs) and mirrored in the policy test fixtures.

| User | Role | Department | Sections they can see | Notes |
|------|------|------------|-----------------------|-------|
| `alice` | admin | – | all | Allowed every action on every resource |
| `bob` | employee | ENG | Expenses | **Can't create expenses** (principal policy) |
| `carol` | manager | ENG | Expenses, Approvals, Reports | Approves ENG expenses up to $10,000 |
| `dave` | employee | SALES | Expenses | Sees only his own expenses |
| `eve` | manager | SALES | Expenses, Approvals, Reports | Approves SALES expenses up to $10,000 |

Seed expenses (restore them from **Admin → Reset expenses**):

| Id | Owner | Dept | Amount | Status | Why it's interesting |
|----|-------|------|-------:|--------|----------------------|
| exp-001 | bob | ENG | 9,000 | DRAFT | The owner can delete it; managers can't approve drafts |
| exp-002 | bob | ENG | 9,000 | SUBMITTED | Carol can approve it |
| exp-003 | carol | ENG | 15,000 | SUBMITTED | Over the limit, and Carol can't approve her own expenses |
| exp-004 | carol | ENG | 500 | DRAFT | A manager acting as an owner |
| exp-005 | frank | ENG | 10,000 | SUBMITTED | Exactly on the $10,000 limit, so it's allowed |
| exp-006 | dave | SALES | 1,200 | SUBMITTED | Only visible to SALES users |
| exp-007 | eve | SALES | 3,000 | DRAFT | |

---

## Running the application

### Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js](https://nodejs.org/) 20.19+ / 22.12+ / 24 (the repo was built with Node 24)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or another OCI runtime Aspire supports)
- Optional: the [Aspire CLI](https://aspire.dev/get-started/install-cli/) (`aspire run`)

### Option 1: Aspire (recommended)

```bash
cd CerbosPoc.Web && npm install && cd ..    # first run only
dotnet run --project CerbosPoc.AppHost      # or: aspire run
```

Open the dashboard URL printed in the console (it includes a login token). From the dashboard:

- open the **web** endpoint to use the app
- open the **cerbos** `http` endpoint to reach the PDP's API explorer (see [below](#the-cerbos-playground-and-api-explorer))

In JetBrains Rider or Visual Studio, set **CerbosPoc.AppHost** as the startup project and run it.

### Option 2: Run each part manually

```bash
docker compose up -d                          # Cerbos PDP on localhost:3592 / 3593
dotnet run --project CerbosPoc.Demo           # API on http://localhost:5180
cd CerbosPoc.Web && npm install && npm start  # UI on http://localhost:4200
```

### Trying it out

1. Choose a user with the **Signed in as** dropdown. The nav, pages and buttons change to
   match that user's Cerbos decisions.
2. The **Home** page lists the raw decisions for the current user.
3. Turn on **Reveal hidden UI**. Denied links, cards and buttons appear with red dashed
   borders. Click one (for example **Create** as `bob`, or **Approve** as `dave`) and the API
   returns `403 Denied by Cerbos`, shown as a red toast.
4. As `alice`, open **Admin** to see the section access matrix for all users, evaluated live.
5. On **Expenses** or **Approvals**, narrow the grid with the filter bar. Try
   **Allowed action → I can approve** as `carol` to list only what Cerbos lets her approve.
6. Still as `alice`, change the header **Policy** picker from *Current (default)* to
   *Proposed (v2)*, then switch users to see the effect (details in
   [Policy versioning](#policy-versioning)).

---

## The policies

The files directly in `policies/` are version `default`, the rules in force today. The
proposed `v2` rules live in `policies/v2/` (see [Policy versioning](#policy-versioning)).
Cerbos loads the directory recursively, watches it, and reloads changes within a few seconds,
with no restart needed.

### `app_section.yaml`: resource policy for UI sections

The resource kind `app_section`, where the resource id is the section name (`expenses`,
`approvals`, `reports`, `admin`), controls which parts of the app a user can open.

| Rule | Effect |
|------|--------|
| `admin` | All actions on every section |
| `employee`, `manager` | `view` on `expenses` |
| `manager` | `view` on `approvals` and `reports` |

### `derived_roles.yaml`: context-dependent roles

Derived roles are assigned at evaluation time based on attributes:

| Derived role | Parent roles | Condition |
|--------------|--------------|-----------|
| `owner` | employee, manager | `resource.attr.ownerId == principal.id` |
| `department_manager` | manager | `resource.attr.department == principal.attr.department` |

### `expense.yaml`: resource policy for expenses

| Action | Who | Condition |
|--------|-----|-----------|
| `*` | `admin` | – |
| `create` | `employee`, `manager` | – |
| `view` | `owner`, `department_manager` | – |
| `approve` | `department_manager` | status is `SUBMITTED` **and** amount ≤ 10,000 **and** not the approver's own expense |
| `delete` | `owner` | status is `DRAFT` |

Cerbos denies anything not explicitly allowed.

### `principal_bob.yaml`: principal policy for one user

Principal policies apply to a single user id and **take precedence over resource
policies**. This one denies `create` on `expense` for `bob` only, overriding the general
"employees can create" rule without touching `expense.yaml`. Use this pattern for per-user
exceptions (suspensions, VIP overrides and so on).

### `policy_version.yaml`: who can switch policy versions

The resource kind `policy_version` has one action, `activate`, and only `admin` is allowed it.
The API always evaluates this policy at version `default`, whichever version is active, so
activating a proposed version can never lock admins out of switching back.

---

## Policy versioning

Cerbos lets several versions of the same policy sit side by side. Each policy declares a
`version`, and each check request says which version to use:

- `principal.policyVersion` selects **principal policies**
- `resource.policyVersion` selects **resource policies**
- if a request doesn't say, Cerbos uses `default`
- derived roles aren't versioned; both versions import the same `derived_roles.yaml`

This POC uses versioning to try out a proposed rule change against real screens before
adopting it.

### The two versions

| Version | Label | Files | Rules |
|---------|-------|-------|-------|
| `default` | Current | `policies/*.yaml` | The rules described in [The policies](#the-policies) |
| `v2` | Proposed | `policies/v2/*.yaml` | Same as `default`, except for the changes below |

What changes in `v2` (each changed rule is marked `# CHANGED in v2` in the YAML):

| Area | `default` | `v2` | Where to see it |
|------|-----------|------|-----------------|
| Approval limit | Managers approve up to **$10,000** | Up to **$5,000** | As `carol`, **Approvals** lists exp-002 and exp-005 under `default` and is empty under `v2` |
| Withdrawing | Owners delete only `DRAFT` expenses | Owners can also delete `SUBMITTED` ones | As `bob`, exp-002 gets a **Delete** button under `v2` |
| Reports | Managers and admins only | Employees too, but totals cover only expenses they can `view` | As `bob`, **Reports** appears in the nav and shows only his ENG expenses |
| Bob's restriction | Denied `create` | Still denied, because `policies/v2/principal_bob.yaml` copies it | As `bob`, no **New expense** card in either version |

Principal policies are versioned like resource policies. Without the `v2` copy of
`principal_bob.yaml`, Bob's restriction would silently disappear whenever `v2` is active. Check
per-user exceptions whenever you add a version.

### How the toggle works

```
Admin picks "v2" ──PUT /api/policy-versions/active──► API asks Cerbos: may alice "activate"
in the header        { "version": "v2" }               policy_version:v2?  (always checked at "default")
                                                         │ allowed
                                                         ▼
                                            PolicyVersions.Active = "v2"   (in memory, all users)
                                                         │
                  every later check ◄────────────────────┘
                  principal.policyVersion = "v2", resource.policyVersion = "v2"
```

1. **Admins** (anyone Cerbos allows `activate`) see a **Policy** picker in the header.
   Everyone else sees a read-only badge showing the active version.
2. With **Reveal hidden UI** on, non-admins also see the picker (red dashed border).
   Choosing a version returns `403 Denied by Cerbos`, and the picker snaps back.
3. After a successful switch, the UI reloads `/api/me` and the current page, so the nav,
   buttons and data update straight away. The **Home** page shows both versions side by side,
   with the active one highlighted.
4. The active version is held in API memory. It applies to **all users**, so you can switch as
   `alice` and then change to `bob` or `carol`. It resets to `default` when the API restarts.

### Adding another version

1. Copy the files you want to change into a new folder, e.g. `policies/v3/`, and set
   `version: v3` in each one. Include principal policies such as `principal_bob.yaml` if they
   should still apply. Any policy kind without a `v3` file gets no rules under `v3`, so its
   requests are **denied**.
2. Add tests in `tests/v3/`, setting `policyVersion: v3` on every principal and resource fixture.
3. Register the version in `PolicyVersions.All` ([`PolicyVersions.cs`](CerbosPoc.Demo/PolicyVersions.cs))
   with a label, description and a summary of its changes. The UI picks it up automatically.
4. Run the policy tests, then switch to the new version in the app.

To **promote** a proposed version, move its rules into the unversioned `default` files (or
make it the API's startup version) and remove the old version once nothing uses it.

---

## How the application uses Cerbos

- **Batching.** `GET /api/expenses` sends every expense to Cerbos in a single `CheckResources`
  call (`view`, `approve`, `delete` per resource). Expenses the user can't `view` are removed,
  and the per-row `allowedActions` are sent to the UI so it can show only the permitted buttons.
- **Checks before creating.** `POST /api/expenses` builds the candidate expense (owner,
  department, amount, status) and checks `create` on it before saving it.
- **Aggregates respect policy.** `GET /api/reports` totals only the expenses the user can
  `view`, so managers see only their own department's figures.
- **Every check names a policy version.** `CerbosAuthorizer` sets `policyVersion` on the
  principal and on every resource from `PolicyVersions.Active`. Checks that must not depend on
  the toggle, such as who may `activate` a version, pin `default` explicitly.
- **Filters work only on authorized data.** See [Expense grid filters](#expense-grid-filters).
- **The UI doesn't grant access.** The UI only decides what to *show*. The API checks every
  request again, which is why the **Reveal hidden UI** toggle is safe to offer.

### Expense grid filters

The expense grid on **Expenses** and **Approvals** has a filter bar above it:

| Filter | Matches |
|--------|---------|
| Search | Case-insensitive text in the id, owner or description |
| Owner / Dept / Status | Exact value. Options come from the rows currently shown |
| Amount | Min and/or max, inclusive |
| Allowed action | **I can approve** / **I can delete**: rows whose Cerbos decision for that action is `ALLOW` |

The grid shows *Showing X of Y*, a **Clear filters** button appears while any filter is set, and
an empty result says *No expenses match the filters*, which is different from
*Cerbos allows you to view no expenses here*.

How the filters relate to authorization:

- **They run in the browser, over rows the API already authorized.** `GET /api/expenses`
  returns only expenses Cerbos lets the user `view`, so filtering can narrow that list but
  never widen it.
- **Options can't reveal hidden data.** The Owner, Dept and Status options come from the
  visible rows. For example, `bob` is only offered `bob` and `ENG`, not the full user or
  department list.
- **Allowed action reuses Cerbos decisions.** The `allowedActions` the API sends with each row
  come from the same batched `CheckResources` call, so the filter needs no extra PDP calls and
  always matches the buttons shown.
- **Filters reset when the user or policy version changes**, because the visible rows change
  too.

Filtering in the browser works for this demo's handful of rows. For large data sets, filter on
the server instead. Cerbos's [query planner](https://docs.cerbos.dev/cerbos/latest/api/#resources-query-plan)
(`PlanResources`) turns a policy into a condition you can add to a database query (for example
`department = 'ENG' OR ownerId = 'bob'`), and the user's own filters are combined with it.

---

## Testing policy files

Policy tests are YAML files in [`tests/`](tests) whose names end in `_test.yaml`. Cerbos
compiles the policies, checks them for errors, and runs the tests. No application, database
or network is needed, so this suits CI.

### Running the tests

Using the Cerbos container, so nothing needs to be installed:

```bash
# Bash / macOS / Linux
docker run --rm -v "$(pwd)/policies:/policies" -v "$(pwd)/tests:/tests" \
  ghcr.io/cerbos/cerbos:latest compile --tests=/tests /policies
```

```powershell
# PowerShell
docker run --rm -v "${PWD}/policies:/policies" -v "${PWD}/tests:/tests" `
  ghcr.io/cerbos/cerbos:latest compile --tests=/tests /policies
```

```bash
# Git Bash on Windows (turn off MSYS path rewriting and pass Windows-style paths)
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/policies:/policies" -v "$(pwd -W)/tests:/tests" \
  ghcr.io/cerbos/cerbos:latest compile --tests=/tests /policies
```

Expected output:

```
Test results
├──AppSectionPolicyTests (app_section_test.yaml) [12 OK]
├──ExpensePolicyTests (expense_test.yaml) [41 OK]
├──PolicyVersionPolicyTests (policy_version_test.yaml) [3 OK]
├──AppSectionPolicyV2Tests (v2/app_section_v2_test.yaml) [12 OK]
└──ExpensePolicyV2Tests (v2/expense_v2_test.yaml) [21 OK]

89 tests executed [89 OK]
```

Test files are found recursively, so `tests/v2/` runs along with everything else.

Useful flags (add them after `compile`):

| Flag | Effect |
|------|--------|
| `--run="<regex>"` | Run only tests whose name matches, e.g. `--run="Bob"` |
| `--verbose` | Print every principal/resource/action result as a tree |
| `--output=json` | Machine-readable output, e.g. for CI reporting |
| *(no `--tests`)* | Only compile and validate the policies |

If you have the `cerbos` binary installed locally (see the
[install docs](https://docs.cerbos.dev/cerbos/latest/installation/binary)), run
`cerbos compile --tests=tests policies` instead.

### Anatomy of a test file

```yaml
name: ExpensePolicyTests
principals:                     # named fixtures for users
  bob_employee:
    id: bob
    roles: ["employee"]
    attr: { department: ENG }
resources:                      # named fixtures for resources
  bobs_draft:
    kind: expense
    id: exp-001
    attr: { ownerId: bob, department: ENG, amount: 9000, status: DRAFT }
tests:
  - name: Owner rights on own draft
    input:                      # every principal × resource × action is evaluated
      principals: ["bob_employee"]
      resources: ["bobs_draft"]
      actions: ["view", "create", "approve", "delete"]
    expected:
      - principal: bob_employee
        resource: bobs_draft
        actions:
          view: EFFECT_ALLOW
          create: EFFECT_DENY
          approve: EFFECT_DENY
          delete: EFFECT_ALLOW
```

Tips:

- Any principal/resource/action combination in `input` that isn't listed in `expected` is
  assumed to be `EFFECT_DENY`.
- Keep the fixtures in step with `DemoData.cs` so test results match what you see in the app.
- Test the boundaries: `expense_test.yaml` checks that exactly 10,000 is approvable and
  10,001 isn't.
- When you add a principal policy, add a test showing it affects only that principal, like
  *"Bob's principal policy blocks create for Bob only"*.
- **Testing a policy version:** add `policyVersion: v2` to every principal and resource fixture,
  as in `tests/v2/*.yaml`. Fixtures without it are evaluated at `default`. If a fixture points
  at the wrong version, a test can pass against the wrong rules, so include at least one test
  whose result differs between versions (for example *"Approval limit lowered to 5000"*).
- Fixtures can also go in shared files (`testdata/principals.yaml`, `testdata/resources.yaml`).
  See the [Cerbos testing docs](https://docs.cerbos.dev/cerbos/latest/policies/compile).

---

## The Cerbos playground and API explorer

There are three ways to experiment with these policies interactively.

### 1. Cerbos Playground (online, no install)

[**play.cerbos.dev**](https://play.cerbos.dev/) is a free, browser-based IDE backed by a real
Cerbos engine. To try this repo's policies there:

1. Open the playground and start an empty playground (or one from a template).
2. Create a file for each policy in `policies/` and paste in its contents: `app_section.yaml`,
   `derived_roles.yaml`, `expense.yaml`, `principal_bob.yaml`, `policy_version.yaml`, plus
   the `policies/v2/` files if you want to compare versions. Give those different file names,
   e.g. `expense_v2.yaml`. In the request simulator, set `policyVersion` on the principal and
   resource to pick a version.
3. Paste the test suites from `tests/` into test files, and add the principals and resources
   you want to try. Syntax errors and test failures appear as you type.
4. Use the **request simulator** to send `CheckResources` requests for any principal and
   resource, and see which rule produced each decision.
5. Share the playground link with colleagues, or copy the changed YAML back into `policies/`
   and run the tests locally.

Don't paste real user data or sensitive attributes into the public playground.

### 2. Cerbos Hub playgrounds (team and collaboration)

[Cerbos Hub](https://www.cerbos.dev/product-cerbos-hub) offers private, collaborative
playgrounds. They can start from an existing policy store, show a permission matrix view and
execution traces, and connect to a PDP running locally. See the
[Hub playground docs](https://docs.cerbos.dev/cerbos-hub/playground.html). This POC doesn't
need Hub; it's mentioned for when you want to share policy work across a team.

### 3. The local PDP's API explorer

The PDP in this repo serves an interactive API explorer (RapiDoc, driven by
`/schema/swagger.json`) at its HTTP root:

| How you started Cerbos | URL |
|------------------------|-----|
| `docker compose up` | <http://localhost:3592/> |
| Aspire | The **cerbos → http** endpoint link in the Aspire dashboard (the host port is assigned on each run) |

From the explorer you can call `POST /api/check/resources` against the **live** policies. It's
the quickest way to check a policy change before touching the app. You can also use curl:

```bash
curl -s http://localhost:3592/api/check/resources \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "readme",
    "principal": { "id": "bob", "roles": ["employee"], "attr": { "department": "ENG" } },
    "resources": [{
      "resource": { "kind": "expense", "id": "exp-001",
                    "attr": { "ownerId": "bob", "department": "ENG", "amount": 9000, "status": "DRAFT" } },
      "actions": ["view", "create", "delete"]
    }]
  }'
```

```json
{"requestId":"readme","results":[{"resource":{"id":"exp-001","kind":"expense"},
 "actions":{"create":"EFFECT_DENY","delete":"EFFECT_ALLOW","view":"EFFECT_ALLOW"}}]}
```

To evaluate the proposed rules instead, add `"policyVersion": "v2"` to both the `principal` and
the `resource` objects.

Other useful PDP endpoints:

- `GET /_cerbos/health`: health status (`{"status":"SERVING"}`)
- `POST /api/plan/resources`: query planning, for turning policies into data filters

---

## Changing a policy: worked example

The `principal_bob.yaml` rule was added this way, and the same loop works for any change:

1. **Edit or add** a YAML file in `policies/`.
2. **Add or update tests** in `tests/`. Here, `create` for `bob_employee` changed to
   `EFFECT_DENY`, and a new test checks that `dave` and `carol` can still create.
3. **Run the tests** with `cerbos compile --tests=...` (see above).
4. **Watch it take effect.** The running PDP reloads the policies. Refresh the app as `bob`:
   the **New expense** card is gone, and with **Reveal hidden UI** on, clicking **Create**
   returns `403`.

No API or UI code changed, because both already ask Cerbos about `create`.

---

## API reference

All endpoints except `/api/users` need an `X-Demo-User: <user id>` header. Every Cerbos check
runs against the active policy version unless noted otherwise.

| Method | Path | Cerbos check | Description |
|--------|------|--------------|-------------|
| GET | `/api/users` | – | Demo users for the switcher |
| GET | `/api/me` | `app_section:*` `view`, `expense` `create`, `policy_version` `activate` | Current user's section and create decisions, plus `policyVersion` (active) and `canChangePolicyVersion` |
| GET | `/api/policy-versions` | – | `{ active, versions: [{ id, label, description, changes }] }` |
| PUT | `/api/policy-versions/active` | `policy_version:{id}` `activate` (always at `default`) | Body: `{ "version": "v2" }`. Returns `400` for an unknown version and `403` for non-admins |
| GET | `/api/expenses` | `app_section:expenses` `view`, then `expense` `view/approve/delete` per row | Visible expenses with `allowedActions` |
| POST | `/api/expenses` | `expense` `create` | Body: `{ "amount": 250, "description": "…", "submit": false }` |
| POST | `/api/expenses/{id}/approve` | `expense` `approve` | Sets status to `APPROVED` |
| DELETE | `/api/expenses/{id}` | `expense` `delete` | Deletes the expense |
| GET | `/api/approvals` | `app_section:approvals` `view` | Expenses the user can approve now |
| GET | `/api/reports` | `app_section:reports` `view` | Per-department totals over visible expenses |
| GET | `/api/admin/users` | `app_section:admin` `view` | Section access matrix for all users |
| GET | `/api/admin/expense-matrix` | `app_section:admin` `view`, then `expense` `view/create/approve/delete` per user and row | `{ policyVersion, actions, expenses, users: [{ user, decisions }] }`, used by `app/index.mjs` |
| POST | `/api/admin/reset` | `app_section:admin` `view` | Restores the seed expenses |

Denied requests return `403` with a problem response like
`{"title":"Denied by Cerbos","detail":"Cerbos denied 'create' on 'expense' for bob (employee)."}`.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| API logs `No address resolver configured for the scheme 'localhost'` | `CERBOS_GRPC` must be a full URI such as `http://localhost:3593`, not `localhost:3593`. |
| UI shows `Loading decisions…` forever | Check that the API is running and reachable through the proxy (`proxy.conf.js`), and that Cerbos is healthy. |
| A policy change doesn't show up | Check the Cerbos container logs for compile errors; an invalid policy is rejected and the last good set stays loaded. Run `cerbos compile` locally to see the error. |
| The API explorer can't reach `localhost:3592` under Aspire | Aspire assigns random host ports. Use the endpoint shown in the dashboard, or run `docker compose up` for the fixed ports. |
| Everything is denied after switching versions | A policy kind has no file for that version. Every kind the app checks (`app_section`, `expense`) needs a policy at each version you register. |
| The version reset to `default` | The active version is kept in API memory and resets when the API restarts. This is intentional for the demo. |
| Git Bash test command fails with odd paths | Add `MSYS_NO_PATHCONV=1` and use `$(pwd -W)`, as shown above. |

---

## Further reading

- [Cerbos documentation](https://docs.cerbos.dev/)
- [Resource policies](https://docs.cerbos.dev/cerbos/latest/policies/resource_policies),
  [derived roles](https://docs.cerbos.dev/cerbos/latest/policies/derived_roles),
  [principal policies](https://docs.cerbos.dev/cerbos/latest/policies/principal_policies)
- [Conditions (CEL)](https://docs.cerbos.dev/cerbos/latest/policies/conditions)
- [Compiling and testing policies](https://docs.cerbos.dev/cerbos/latest/policies/compile)
- [Cerbos .NET SDK](https://github.com/cerbos/cerbos-sdk-net)
- [.NET Aspire](https://aspire.dev/)
