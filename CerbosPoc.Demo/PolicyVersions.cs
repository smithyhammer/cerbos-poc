namespace CerbosPoc.Demo;

public record PolicyVersion(string Id, string Label, string Description, string[] Changes);

// The Cerbos policy version the whole app evaluates against. Held in memory and shared by all
// users, so an admin can flip it and then switch users to see the effect.
public class PolicyVersions
{
    // Cerbos' built-in version: used when a request doesn't name one, and for the unversioned files.
    public const string Default = "default";

    public static readonly IReadOnlyList<PolicyVersion> All =
    [
        new(Default, "Current", "The rules in production today.",
        [
            "Managers approve submitted expenses in their department up to $10,000",
            "Owners can delete only DRAFT expenses",
            "Reports are for managers and admins",
        ]),
        new("v2", "Proposed", "Candidate rules under review (policies/v2).",
        [
            "Approval limit drops to $5,000",
            "Owners can also withdraw SUBMITTED expenses",
            "Employees get the Reports section (their own expenses only)",
        ]),
    ];

    private volatile string _active = Default;

    public string Active => _active;

    public static bool Exists(string id) => All.Any(v => v.Id == id);

    public void Activate(string id)
    {
        if (!Exists(id)) throw new ArgumentException($"Unknown policy version '{id}'.", nameof(id));
        _active = id;
    }
}
