using Cerbos.Sdk.Builder;

namespace CerbosPoc.Demo;

// Turns a (kind, id) pair from an API caller into a Cerbos resource for POST /api/verify.
// Attributes are always loaded server-side, so callers can't sway a decision by sending their own.
// To expose a new resource kind, implement this and register it as an IResourceResolver singleton.
public interface IResourceResolver
{
    string Kind { get; }

    // Actions callers may ask about; also the default set when a request names none.
    string[] Actions { get; }

    // Policy version to evaluate against; null means the active version.
    string? PolicyVersion => null;

    (string Id, Resource Resource)? Resolve(string id);
}

public class ExpenseResolver(ExpenseStore store) : IResourceResolver
{
    public string Kind => "expense";
    public string[] Actions => CerbosAuthorizer.ExpenseActions;

    public (string Id, Resource Resource)? Resolve(string id) =>
        store.Find(id) is { } expense ? CerbosAuthorizer.ExpenseResource(expense) : null;
}

public class AppSectionResolver : IResourceResolver
{
    public string Kind => "app_section";
    public string[] Actions => ["view"];

    public (string Id, Resource Resource)? Resolve(string id) =>
        CerbosAuthorizer.Sections.Contains(id) ? CerbosAuthorizer.SectionResource(id) : null;
}

// Mirrors CerbosAuthorizer.CanActivatePolicyVersionAsync: always judged by the default version.
public class PolicyVersionResolver : IResourceResolver
{
    public string Kind => "policy_version";
    public string[] Actions => ["activate"];
    public string? PolicyVersion => PolicyVersions.Default;

    public (string Id, Resource Resource)? Resolve(string id) =>
        PolicyVersions.Exists(id) ? (id, Resource.NewInstance("policy_version", id)) : null;
}
