using Cerbos.Sdk;
using Cerbos.Sdk.Builder;
using CerbosPoc.Demo;

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();

// Pass the full http:// URI: under ASP.NET Core, Grpc.Net treats a bare "host:port" as a URI whose
// scheme is the host name and fails with "No address resolver configured for the scheme 'localhost'".
var grpcTarget = builder.Configuration["CERBOS_GRPC"] ?? "http://localhost:3593";

builder.Services.AddSingleton<ICerbosClient>(_ => CerbosClientBuilder.ForTarget(grpcTarget).WithPlaintext().Build());
builder.Services.AddSingleton<CerbosAuthorizer>();
builder.Services.AddSingleton<ExpenseStore>();
builder.Services.AddSingleton<PolicyVersions>();
builder.Services.AddProblemDetails();

var app = builder.Build();

app.MapDefaultEndpoints();

var api = app.MapGroup("/api");

// Anonymous: lets the UI populate its user switcher.
api.MapGet("/users", () => DemoUsers.All);

// Everything below requires a demo user and asks Cerbos before doing anything.
var secured = api.MapGroup("").AddEndpointFilter(async (context, next) =>
{
    var header = context.HttpContext.Request.Headers[DemoUsers.HeaderName].ToString();
    if (DemoUsers.Find(header) is not { } user)
        return Results.Problem(statusCode: 401, detail: $"Send a known user id in the {DemoUsers.HeaderName} header.");

    context.HttpContext.Items[nameof(DemoUser)] = user;
    return await next(context);
});

// What the current user may see: drives navigation and section visibility in the UI.
secured.MapGet("/me", async (HttpContext http, CerbosAuthorizer cerbos, PolicyVersions versions) =>
{
    var user = CurrentUser(http);
    var sections = await cerbos.CheckSectionsAsync(user);
    var canCreate = await cerbos.IsAllowedAsync(user, CerbosAuthorizer.ExpenseResource(NewExpenseFor(user, 0, "DRAFT")), "create");

    return new
    {
        user,
        sections = sections.ToDictionary(s => s.Key, s => s.Value["view"]),
        canCreateExpense = canCreate,
        policyVersion = versions.Active,
        canChangePolicyVersion = await cerbos.CanActivatePolicyVersionAsync(user, versions.Active),
    };
});

// Which Cerbos policy version the app evaluates against. Readable by everyone so the UI can show it.
secured.MapGet("/policy-versions", (PolicyVersions versions) => PolicyVersionState(versions));

secured.MapPut("/policy-versions/active", async (HttpContext http, CerbosAuthorizer cerbos, PolicyVersions versions, ActivatePolicyVersionRequest body) =>
{
    var user = CurrentUser(http);
    if (!PolicyVersions.Exists(body.Version))
        return Results.Problem(statusCode: 400, detail: $"Unknown policy version '{body.Version}'.");

    if (!await cerbos.CanActivatePolicyVersionAsync(user, body.Version))
        return Forbidden(user, "activate", $"policy_version:{body.Version}");

    versions.Activate(body.Version);
    return Results.Ok(PolicyVersionState(versions));
});

secured.MapGet("/expenses", async (HttpContext http, CerbosAuthorizer cerbos, ExpenseStore store) =>
{
    var user = CurrentUser(http);
    if (await DenySection(cerbos, user, "expenses") is { } denied) return denied;

    return Results.Ok(await VisibleExpenses(cerbos, store, user));
});

secured.MapPost("/expenses", async (HttpContext http, CerbosAuthorizer cerbos, ExpenseStore store, CreateExpenseRequest body) =>
{
    var user = CurrentUser(http);
    var status = body.Submit ? "SUBMITTED" : "DRAFT";
    var candidate = NewExpenseFor(user, body.Amount, status);

    if (!await cerbos.IsAllowedAsync(user, CerbosAuthorizer.ExpenseResource(candidate), "create"))
        return Forbidden(user, "create", "expense");

    var created = store.Add(candidate.OwnerId, candidate.Department, body.Amount, status, body.Description);
    return Results.Created($"/api/expenses/{created.Id}", created);
});

secured.MapPost("/expenses/{id}/approve", async (string id, HttpContext http, CerbosAuthorizer cerbos, ExpenseStore store) =>
{
    var user = CurrentUser(http);
    if (store.Find(id) is not { } expense) return Results.NotFound();

    if (!await cerbos.IsAllowedAsync(user, CerbosAuthorizer.ExpenseResource(expense), "approve"))
        return Forbidden(user, "approve", id);

    store.Replace(expense with { Status = "APPROVED" });
    return Results.NoContent();
});

secured.MapDelete("/expenses/{id}", async (string id, HttpContext http, CerbosAuthorizer cerbos, ExpenseStore store) =>
{
    var user = CurrentUser(http);
    if (store.Find(id) is not { } expense) return Results.NotFound();

    if (!await cerbos.IsAllowedAsync(user, CerbosAuthorizer.ExpenseResource(expense), "delete"))
        return Forbidden(user, "delete", id);

    store.Remove(id);
    return Results.NoContent();
});

// Expenses the user could approve right now.
secured.MapGet("/approvals", async (HttpContext http, CerbosAuthorizer cerbos, ExpenseStore store) =>
{
    var user = CurrentUser(http);
    if (await DenySection(cerbos, user, "approvals") is { } denied) return denied;

    var expenses = await VisibleExpenses(cerbos, store, user);
    return Results.Ok(expenses.Where(e => e.AllowedActions["approve"]));
});

// Totals per department, aggregated only over expenses Cerbos lets the user view.
secured.MapGet("/reports", async (HttpContext http, CerbosAuthorizer cerbos, ExpenseStore store) =>
{
    var user = CurrentUser(http);
    if (await DenySection(cerbos, user, "reports") is { } denied) return denied;

    var expenses = await VisibleExpenses(cerbos, store, user);
    return Results.Ok(expenses
        .GroupBy(e => e.Department)
        .Select(g => new
        {
            department = g.Key,
            count = g.Count(),
            total = g.Sum(e => e.Amount),
            byStatus = g.GroupBy(e => e.Status).ToDictionary(s => s.Key, s => s.Sum(e => e.Amount)),
        })
        .OrderBy(r => r.department));
});

secured.MapGet("/admin/users", async (HttpContext http, CerbosAuthorizer cerbos) =>
{
    var user = CurrentUser(http);
    if (await DenySection(cerbos, user, "admin") is { } denied) return denied;

    var decisions = new List<object>();
    foreach (var u in DemoUsers.All)
    {
        var sections = await cerbos.CheckSectionsAsync(u);
        decisions.Add(new { user = u, sections = sections.ToDictionary(s => s.Key, s => s.Value["view"]) });
    }
    return Results.Ok(decisions);
});

// Every demo user's decisions on every stored expense, batched as one PDP call per user.
// Lets clients such as app/index.mjs show the matrix without talking to Cerbos themselves.
secured.MapGet("/admin/expense-matrix", async (HttpContext http, CerbosAuthorizer cerbos, ExpenseStore store, PolicyVersions versions) =>
{
    var user = CurrentUser(http);
    if (await DenySection(cerbos, user, "admin") is { } denied) return denied;

    string[] actions = ["view", "create", "approve", "delete"];
    var expenses = store.All();
    var users = new List<object>();
    foreach (var u in DemoUsers.All)
    {
        var decisions = await cerbos.CheckAsync(u, expenses.Select(CerbosAuthorizer.ExpenseResource), actions);
        users.Add(new { user = u, decisions });
    }
    return Results.Ok(new { policyVersion = versions.Active, actions, expenses, users });
});

secured.MapPost("/admin/reset", async (HttpContext http, CerbosAuthorizer cerbos, ExpenseStore store) =>
{
    var user = CurrentUser(http);
    if (await DenySection(cerbos, user, "admin") is { } denied) return denied;

    store.Reset();
    return Results.NoContent();
});

app.Run();

static DemoUser CurrentUser(HttpContext http) => (DemoUser)http.Items[nameof(DemoUser)]!;

static object PolicyVersionState(PolicyVersions versions) =>
    new { active = versions.Active, versions = PolicyVersions.All };

static Expense NewExpenseFor(DemoUser user, double amount, string status) =>
    new("new", user.Id, user.Department ?? "HQ", amount, status, "");

static IResult Forbidden(DemoUser user, string action, string resource) =>
    Results.Problem(statusCode: 403, title: "Denied by Cerbos",
        detail: $"Cerbos denied '{action}' on '{resource}' for {user.Id} ({user.Role}).");

static async Task<IResult?> DenySection(CerbosAuthorizer cerbos, DemoUser user, string section) =>
    await cerbos.IsAllowedAsync(user, CerbosAuthorizer.SectionResource(section), "view")
        ? null
        : Forbidden(user, "view", $"app_section:{section}");

static async Task<List<ExpenseView>> VisibleExpenses(CerbosAuthorizer cerbos, ExpenseStore store, DemoUser user)
{
    var expenses = store.All();
    var decisions = await cerbos.CheckAsync(user, expenses.Select(CerbosAuthorizer.ExpenseResource), CerbosAuthorizer.ExpenseActions);

    return expenses
        .Where(e => decisions[e.Id]["view"])
        .Select(e => new ExpenseView(e.Id, e.OwnerId, e.Department, e.Amount, e.Status, e.Description, decisions[e.Id]))
        .ToList();
}

record CreateExpenseRequest(double Amount, string Description, bool Submit);

record ActivatePolicyVersionRequest(string Version);

record ExpenseView(
    string Id, string OwnerId, string Department, double Amount, string Status, string Description,
    Dictionary<string, bool> AllowedActions);
