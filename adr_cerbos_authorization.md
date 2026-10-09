# ADR: Use Cerbos for Application Authorization

**Status:** Accepted as our direction; production rollout still requires a pilot and security approval  
**Owners:** Application architecture and security teams  
**Scope:** Fine-grained authorization for our business application in a FedRAMP High environment  
**Related:** `authorization_aoa.md`

## The problem we're solving

Today, each service can end up answering the same question in its own way: *is this person allowed to do this to this resource?* The answer may depend on a role, tenant, resource attributes, or the circumstances of the request. When those rules are scattered through application code, they are harder to keep consistent and harder to review when access needs to change.

A policy engine gives us one place to express and test those rules. Applications still enforce access, but they ask a shared decision service what is allowed. That should make policy changes easier to review and roll back, and give us a clearer record of why access was granted or denied. It does **not** solve everything: we still need reliable identity and resource data, checks at every relevant service boundary, and an approved security design.

We looked at Cerbos, Cedar, and OPA. Our immediate need is application authorization, rather than a general platform for every kind of policy.

## Decision

We will use a **self-hosted Cerbos policy decision point (PDP)** for application authorization, subject to the pilot and approvals below. It will run inside the approved system boundary, with policy delivery and operational dependencies managed there as well. Services will send resource/action requests to Cerbos and enforce the decisions they receive. For list endpoints, we will apply permission-aware filtering before pagination and before records are returned.

This decision does **not** mean that Cerbos, Cerbos Hub, or our eventual deployment is FedRAMP High authorized. Hosted Cerbos Hub is outside this decision. Any external management, telemetry, or support connection would need its own boundary and data-flow review.

## Why Cerbos

Cerbos is the closest match to the job we need done. It gives us a deployable authorization service with APIs built around application resources and actions. We can start with that model instead of building a decision service around Cedar or setting application-specific conventions on top of OPA.

It also offers a way to handle permission-aware lists, where checking each item after a page of results has already been fetched can produce incomplete or misleading pages. Cerbos can help plan the authorized query, although translating that plan into a correct database filter is still our responsibility.

Running the PDP ourselves lets us keep policy and decision data flows inside the boundary we assess. It also means **we** own the uptime, upgrades, monitoring, and policy release process. We believe that trade-off fits this application, but the pilot must show it works in practice. We have not established a performance, cost, or compliance advantage by choosing the product name alone.

## Why not the others

**Cedar** is a strong authorization language, particularly when explicit permit/forbid behavior and policy validation are priorities. For our self-hosted design, though, the engine is only part of what we need. We would have to build or choose more of the service integration, policy distribution, and operating model. Amazon Verified Permissions is a separate managed option that would need its own assessment; it is not part of this decision. We should revisit Cedar if it becomes our organization's policy standard or an approved managed route becomes important.

**OPA** is a strong choice when one team needs a general-purpose policy engine across application, infrastructure, and other decisions. That flexibility would require us to define and maintain more of our own authorization model and conventions. For this application's narrower need, we prefer a tool built specifically for authorization. We should revisit OPA if we already have an established Rego practice or decide to consolidate several policy domains.

## What this commits us to

Cerbos centralizes the *decision*, not the *enforcement*. Every service still has to ask at the right point, trust the right attributes, and deny access when it cannot obtain a required decision. A check in the UI is not enough. We need tests for tenant isolation, missing or misleading attributes, explicit denials, and service outages.

We also take on the normal responsibilities of running a security-critical dependency: approved builds and patches, availability, monitoring, restricted policy changes, review and testing before release, and a rollback path. We need useful decision and policy-change evidence without logging more sensitive data than necessary. Network flows, storage, telemetry, and support access must be documented for the system assessment.

## Before production

The pilot will cover tenant isolation, an explicit deny, a contextual exception, and a paginated list query. We will test missing attributes and PDP outages, verify that filtering happens before pagination, and measure integration effort, latency under representative load, recovery, audit evidence, and ownership cost.

Production use depends on the system owner and security team accepting the design and controls through the applicable authorization process. If the pilot does not support this choice, we will reopen the ADR and reconsider Cedar and OPA. Self-hosting is an architectural choice, not an authorization to operate.

## References

- Internal: `authorization_aoa.md` (comparison and compliance assumptions)
- [Cerbos documentation](https://docs.cerbos.dev/cerbos/latest/index.html)
- [Cedar authorization semantics](https://docs.cedarpolicy.com/auth/authorization.html)
- [OPA documentation](https://www.openpolicyagent.org/docs)
- [FedRAMP Marketplace](https://www.fedramp.gov/marketplace/products/) (for checking any proposed hosted service and its authorization scope)
