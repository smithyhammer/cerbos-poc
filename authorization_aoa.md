# Analysis of Alternatives: Application Authorization

**Alternatives:** Cerbos, Cedar, Open Policy Agent (OPA), and ASP.NET Core policy-based authorization  
**Decision context:** Fine-grained access decisions for a business application operating in a FedRAMP High environment  
**Status:** Preliminary recommendation, subject to architecture and compliance review

## Executive decision

**Recommend piloting a self-hosted Cerbos policy decision point (PDP) inside the system's authorized boundary** if the primary need is application permissions. It offers a purpose-built authorization service without requiring the team to build the basic decision API around a policy engine. Keep policies, deployment, and operational dependencies inside the approved boundary unless separately reviewed.

This is **not** a finding that Cerbos or its hosted Hub is FedRAMP High authorized, nor an approval to deploy it. The system owner, security team, assessor, and authorizing official must determine whether the proposed architecture and controls meet the system's requirements.

**Choose Cedar instead** if the organization wants its policy language as a standard, has capacity to build and operate the supporting service, or has an approved route to use Amazon Verified Permissions. **Choose OPA instead** if an existing OPA practice can be reused or policy needs extend well beyond application authorization. **Choose ASP.NET Core policies instead** if authorization is limited to a small number of .NET applications, rules are relatively stable, and keeping decisions in application code is preferable to operating a separate policy service.

## What is being compared

These options are not equivalent packages:

- **Cerbos:** an application-authorization product with a deployable decision service. Cerbos Hub is a separate, optional policy-management offering.
- **Cedar:** an authorization policy language and engine. A team can operate the open-source engine itself or evaluate a managed service such as Amazon Verified Permissions.
- **OPA:** a general-purpose policy engine using Rego, suitable for application decisions and broader policy use cases.
- **ASP.NET Core policy-based authorization:** built-in .NET framework capabilities using named policies, requirements, and handlers. Resource-specific checks can use `IAuthorizationService`; this is an in-application approach, not a standalone policy engine or shared policy service.

The comparison below assumes a **self-hosted Cerbos PDP, a self-operated Cedar integration, a self-hosted OPA deployment, and policies implemented in the existing ASP.NET Core applications**. Managed offerings require their own separate cost, data-flow, and authorization review.

## Business comparison

| Decision factor | Cerbos | Cedar | OPA | ASP.NET Core policies |
|---|---|---|---|---|
| Fit for application permissions | **Strong:** purpose-built for resource/action access checks | **Strong:** purpose-built policy language and semantics | **Good:** flexible, but application conventions must be designed | **Strong for .NET apps:** built-in policies and handlers; shared cross-service rules need coordination |
| Time to first usable integration | **Lower expected effort:** deploy a decision service and integrate applications | **More build effort:** wrap the engine with decision, distribution, and operations capabilities | **Moderate to high effort:** deploy the engine and establish Rego conventions and operations | **Low starting overhead for simple .NET rules:** use framework features; complex rules take application development |
| Flexibility beyond application access | More focused | More focused | **Strong:** reusable for other structured policy decisions | Primarily .NET application authorization; other runtimes need a separate approach |
| Permission-aware lists | Query planning is available; application/database integration remains | Requires a separately designed approach | Partial evaluation can help; filter translation and database integration remain | Must implement matching database filters and resource checks in application code |
| Operational ownership | PDP, policy lifecycle, availability, and monitoring remain the organization's responsibility | Engine integration, policy lifecycle, availability, and monitoring remain the organization's responsibility | Engine deployment, bundles/data, policy lifecycle, availability, and monitoring remain the organization's responsibility | No separate PDP; application teams own rule code, releases, tests, audit evidence, and consistency across services |
| FedRAMP High architecture | Self-hosting can keep decisions within the boundary; assess the whole implementation | Self-operated engine can stay within the boundary; assess the whole implementation | Self-hosting can keep decisions within the boundary; assess the whole implementation | Runs within the existing application boundary; assess code, dependencies, data flows, and controls |
| Principal business trade-off | Faster path for the narrow use case, with a specialized platform dependency | Clear authorization model, with more integration work | Broadest reuse, with greater design and governance burden | Avoids a new service, but rule changes follow application delivery and can diverge across services |

**Effort descriptions are directional judgments, not vendor quotes or measured implementation estimates.** Actual cost and delivery time depend on current staff skills, system architecture, support terms, and required controls.

## FedRAMP High implications

**A product's ability to run inside a FedRAMP High system is different from that product being FedRAMP authorized as a cloud service.** The open-source or self-hosted software may be evaluated as a component of the organization's system boundary. That does not confer an authorization on the software, the vendor, or an external hosted control plane.

For any option, the proposed design should be reviewed for:

1. **Boundary and data flow:** where user, resource, and request attributes go; whether any policies, logs, telemetry, support access, or management traffic leave the boundary.
2. **Policy governance:** who can change access rules, how changes are tested and approved, and how versions are distributed and rolled back.
3. **Availability and failure behavior:** how access decisions continue during outages and whether the application fails closed when a decision cannot be obtained.
4. **Auditability:** what decision and policy-change evidence is retained, protected, and available for investigation.
5. **Supply chain and operations:** approved builds, vulnerability management, patching, configuration, monitoring, and incident response.

**Hosted options need a separate gate.** Do not infer that hosted Cerbos Hub or Amazon Verified Permissions is acceptable for this system from the status of the self-hosted software or another AWS service. Confirm the specific offering, region, authorization scope, data flow, contractual terms, and agency approval through authoritative records and the security team before inclusion in the architecture.

## Recommendation and decision gates

Advance **self-hosted Cerbos** to a short proof of concept, with **ASP.NET Core policies** as the in-application baseline and **self-operated Cedar** as the specialized-engine comparator. Include **OPA** in the pilot if the organization already operates it or expects to consolidate broader policy needs on one engine. This recommendation assumes application permissions span enough services or change frequently enough to justify a separate policy service. If they do not, the ASP.NET Core baseline may be the simpler and less costly choice.

The pilot should implement the same four cases in each candidate: tenant separation, an explicit denial, a context-dependent exception, and a paginated list of resources. Evaluate:

- **Correctness:** identical expected decisions, including deny and missing-data cases.
- **Integration effort:** application changes, policy authoring, testing, and deployment work; compare ongoing rule changes across services, not just initial setup.
- **List behavior:** enforce filtering before pagination, without exposing unauthorized records.
- **Operational fit:** availability, logging, rollback, offline behavior, and performance under representative load.
- **Full cost:** engineering and operations effort, infrastructure, support, and any commercial control-plane fees.

**Proceed only after** the security team accepts the boundary/data-flow design, the product owner approves the measured implementation and operating cost, and the pilot satisfies the agreed functional and audit requirements. If those gates fail, select the best-performing remaining option rather than treating this preliminary recommendation as a procurement decision.

## Sources and qualification

- [Cerbos documentation](https://docs.cerbos.dev/cerbos/latest/index.html) and [Cerbos Hub deployments](https://docs.cerbos.dev/cerbos-hub/deployments.html): PDP and deployment capabilities.
- [Cedar authorization semantics](https://docs.cedarpolicy.com/auth/authorization.html), [Cedar validation](https://docs.cedarpolicy.com/policies/validation.html), and [Cedar source](https://github.com/cedar-policy/cedar): engine and language characteristics.
- [OPA documentation](https://www.openpolicyagent.org/docs), [bundles](https://www.openpolicyagent.org/docs/management-bundles), and [partial evaluation](https://www.openpolicyagent.org/blog/partial-evaluation-162750eaf422): engine, distribution, and filtering capabilities.
- [ASP.NET Core policy-based authorization](https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies) and [resource-based authorization](https://learn.microsoft.com/en-us/aspnet/core/security/authorization/resource-based): policies, requirements, handlers, and imperative resource checks.
- [FedRAMP Marketplace](https://www.fedramp.gov/marketplace/products/): verify the status and scope of a specific hosted service at the time of procurement; a vendor statement about readiness is not an authorization.

This is a decision aid, not a security assessment, authorization determination, pricing estimate, or legal opinion.
