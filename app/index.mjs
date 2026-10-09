// Prints an allow/deny matrix of every demo user against the stored expenses. The decisions come
// from the Web API, which queries the Cerbos PDP; this script never talks to Cerbos directly.
const apiUrl = process.env.API_URL ?? "http://localhost:5180";
const asUser = process.env.DEMO_USER ?? "alice"; // the endpoint requires access to the admin section

const response = await fetch(`${apiUrl}/api/admin/expense-matrix`, {
  headers: { "X-Demo-User": asUser },
});
if (!response.ok) {
  const problem = await response.json().catch(() => ({}));
  console.error(`API returned ${response.status}: ${problem.detail ?? response.statusText}`);
  process.exit(1);
}

const { policyVersion, actions, expenses, users } = await response.json();

const label = (e) => `${e.id} ${e.ownerId}'s ${e.status} $${e.amount.toLocaleString("en-US")}`;
const width = Math.max(...expenses.map((e) => label(e).length));
const mark = (allowed) => (allowed ? "ALLOW" : "deny ");

for (const { user, decisions } of users) {
  console.log(`\n${user.id} (${user.role}${user.department ? ", dept=" + user.department : ""})`);
  for (const expense of expenses) {
    const row = actions.map((a) => `${a}=${mark(decisions[expense.id][a])}`).join("  ");
    console.log(`  ${label(expense).padEnd(width)}  ${row}`);
  }
}

console.log(`\nDone. Decisions served by the Web API at ${apiUrl} (Cerbos policy version "${policyVersion}")`);
