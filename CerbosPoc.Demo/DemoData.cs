namespace CerbosPoc.Demo;

public record DemoUser(string Id, string Role, string? Department);

public record Expense(string Id, string OwnerId, string Department, double Amount, string Status, string Description);

// Hard-coded identities stand in for a real identity provider. The Angular app picks one
// via the X-Demo-User header; the API turns it into a Cerbos principal.
public static class DemoUsers
{
    public const string HeaderName = "X-Demo-User";

    public static readonly IReadOnlyList<DemoUser> All =
    [
        new("alice", "admin", null),
        new("bob", "employee", "ENG"),
        new("carol", "manager", "ENG"),
        new("dave", "employee", "SALES"),
        new("eve", "manager", "SALES"),
    ];

    public static DemoUser? Find(string? id) =>
        All.FirstOrDefault(u => string.Equals(u.Id, id, StringComparison.OrdinalIgnoreCase));
}

// In-memory expense store seeded with the same data used in tests/expense_test.yaml.
public class ExpenseStore
{
    private readonly Lock _gate = new();
    private readonly List<Expense> _expenses = [];
    private int _nextId;

    public ExpenseStore() => Reset();

    public IReadOnlyList<Expense> All()
    {
        lock (_gate) return [.. _expenses];
    }

    public Expense? Find(string id)
    {
        lock (_gate) return _expenses.FirstOrDefault(e => e.Id == id);
    }

    public Expense Add(string ownerId, string department, double amount, string status, string description)
    {
        lock (_gate)
        {
            var expense = new Expense($"exp-{++_nextId:000}", ownerId, department, amount, status, description);
            _expenses.Add(expense);
            return expense;
        }
    }

    public void Replace(Expense expense)
    {
        lock (_gate)
        {
            var index = _expenses.FindIndex(e => e.Id == expense.Id);
            if (index >= 0) _expenses[index] = expense;
        }
    }

    public void Remove(string id)
    {
        lock (_gate) _expenses.RemoveAll(e => e.Id == id);
    }

    public void Reset()
    {
        lock (_gate)
        {
            _expenses.Clear();
            _expenses.AddRange(
            [
                new("exp-001", "bob", "ENG", 9000, "DRAFT", "Conference travel"),
                new("exp-002", "bob", "ENG", 9000, "SUBMITTED", "Team offsite"),
                new("exp-003", "carol", "ENG", 15000, "SUBMITTED", "New laptops"),
                new("exp-004", "carol", "ENG", 500, "DRAFT", "Books"),
                new("exp-005", "frank", "ENG", 10000, "SUBMITTED", "Cloud credits"),
                new("exp-006", "dave", "SALES", 1200, "SUBMITTED", "Client dinner"),
                new("exp-007", "eve", "SALES", 3000, "DRAFT", "Trade show booth"),
            ]);
            _nextId = _expenses.Count;
        }
    }
}
