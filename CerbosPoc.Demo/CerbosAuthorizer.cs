using Cerbos.Sdk;
using Cerbos.Sdk.Builder;
using Cerbos.Sdk.Utility;

namespace CerbosPoc.Demo;

// Thin wrapper over the Cerbos SDK that maps demo users and domain objects onto
// Cerbos principals and resources. Every authorization decision in the API goes through here.
public class CerbosAuthorizer(ICerbosClient client, PolicyVersions versions)
{
    public static readonly string[] ExpenseActions = ["view", "approve", "delete"];
    public static readonly string[] Sections = ["expenses", "approvals", "reports", "admin"];

    // Returns resourceId -> (action -> allowed) for a batch of resources in a single PDP call.
    // Evaluated against the active policy version unless policyVersion pins a specific one.
    public async Task<Dictionary<string, Dictionary<string, bool>>> CheckAsync(
        DemoUser user, IEnumerable<(string Id, Resource Resource)> resources, string[] actions,
        string? policyVersion = null)
    {
        var resourceList = resources.ToList();
        if (resourceList.Count == 0) return [];

        // The principal's version selects principal policies; each resource's version selects resource policies.
        var version = policyVersion ?? versions.Active;
        var request = CheckResourcesRequest.NewInstance()
            .WithRequestId(RequestId.Generate())
            .WithPrincipal(ToPrincipal(user).WithPolicyVersion(version));

        foreach (var (_, resource) in resourceList)
            request.WithResourceEntries(ResourceEntry.NewInstance(resource.WithPolicyVersion(version)).WithActions(actions));

        var response = await client.CheckResourcesAsync(request);

        return resourceList.ToDictionary(
            r => r.Id,
            r =>
            {
                var result = response.Find(r.Id);
                return actions.ToDictionary(a => a, a => result.IsAllowed(a));
            });
    }

    public async Task<bool> IsAllowedAsync(
        DemoUser user, (string Id, Resource Resource) resource, string action, string? policyVersion = null) =>
        (await CheckAsync(user, [resource], [action], policyVersion))[resource.Id][action];

    public Task<Dictionary<string, Dictionary<string, bool>>> CheckSectionsAsync(DemoUser user) =>
        CheckAsync(user, Sections.Select(SectionResource), ["view"]);

    // Who may switch versions is governed by the default version only, so activating a proposed
    // version can never change (or remove) the right to switch back.
    public Task<bool> CanActivatePolicyVersionAsync(DemoUser user, string version) =>
        IsAllowedAsync(user, (version, Resource.NewInstance("policy_version", version)), "activate", PolicyVersions.Default);

    public static (string, Resource) SectionResource(string section) =>
        (section, Resource.NewInstance("app_section", section));

    public static (string, Resource) ExpenseResource(Expense e) =>
        (e.Id, Resource.NewInstance("expense", e.Id)
            .WithAttribute("ownerId", AttributeValue.StringValue(e.OwnerId))
            .WithAttribute("department", AttributeValue.StringValue(e.Department))
            .WithAttribute("amount", AttributeValue.DoubleValue(e.Amount))
            .WithAttribute("status", AttributeValue.StringValue(e.Status)));

    private static Principal ToPrincipal(DemoUser user)
    {
        var principal = Principal.NewInstance(user.Id, user.Role);
        return user.Department is null
            ? principal
            : principal.WithAttribute("department", AttributeValue.StringValue(user.Department));
    }
}
