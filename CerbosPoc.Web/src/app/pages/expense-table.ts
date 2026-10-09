import { CurrencyPipe } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { ApiService, Expense } from '../api.service';
import { Notifier, Session } from '../session';

type ActionFilter = '' | 'approve' | 'delete';

const distinct = (values: string[]) => [...new Set(values)].sort();
const toAmount = (value: string) => (value === '' ? null : Number(value));

// Expense rows with per-row action buttons driven by the expense policy decisions the API returns.
// Filtering is client-side over rows Cerbos already allowed, so filter options never reveal hidden data.
@Component({
  selector: 'app-expense-table',
  imports: [CurrencyPipe],
  template: `
    <div class="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
      <label class="flex flex-col gap-1 text-xs font-medium text-gray-600">
        Search
        <input type="text" class="field w-48 text-sm font-normal" placeholder="Id, owner or description"
               [value]="search()" (input)="search.set($any($event.target).value)" />
      </label>

      <label class="flex flex-col gap-1 text-xs font-medium text-gray-600">
        Owner
        <select class="field text-sm font-normal" [value]="owner()" (change)="owner.set($any($event.target).value)">
          <option value="">All</option>
          @for (o of owners(); track o) { <option [value]="o" [selected]="o === owner()">{{ o }}</option> }
        </select>
      </label>

      <label class="flex flex-col gap-1 text-xs font-medium text-gray-600">
        Dept
        <select class="field text-sm font-normal" [value]="department()" (change)="department.set($any($event.target).value)">
          <option value="">All</option>
          @for (d of departments(); track d) { <option [value]="d" [selected]="d === department()">{{ d }}</option> }
        </select>
      </label>

      <label class="flex flex-col gap-1 text-xs font-medium text-gray-600">
        Status
        <select class="field text-sm font-normal" [value]="status()" (change)="status.set($any($event.target).value)">
          <option value="">All</option>
          @for (s of statuses(); track s) { <option [value]="s" [selected]="s === status()">{{ s }}</option> }
        </select>
      </label>

      <div class="flex flex-col gap-1 text-xs font-medium text-gray-600">
        Amount
        <div class="flex items-center gap-1">
          <input type="number" class="field w-24 text-sm font-normal" placeholder="Min" min="0" aria-label="Minimum amount"
                 [value]="minAmount() ?? ''" (input)="minAmount.set(toAmount($any($event.target).value))" />
          <span class="text-gray-400">&ndash;</span>
          <input type="number" class="field w-24 text-sm font-normal" placeholder="Max" min="0" aria-label="Maximum amount"
                 [value]="maxAmount() ?? ''" (input)="maxAmount.set(toAmount($any($event.target).value))" />
        </div>
      </div>

      <label class="flex flex-col gap-1 text-xs font-medium text-gray-600" title="Filters on the per-row decisions returned by Cerbos">
        Allowed action
        <select class="field text-sm font-normal" [value]="action()" (change)="action.set($any($event.target).value)">
          <option value="">Any</option>
          <option value="approve">I can approve</option>
          <option value="delete">I can delete</option>
        </select>
      </label>

      <div class="ml-auto flex items-center gap-3 self-center">
        <span class="text-sm text-gray-500">Showing {{ filtered().length }} of {{ expenses().length }}</span>
        @if (hasFilters()) {
          <button type="button" class="btn btn-secondary mr-0" (click)="clearFilters()">Clear filters</button>
        }
      </div>
    </div>

    <table class="data-table">
      <thead>
        <tr><th>Id</th><th>Owner</th><th>Dept</th><th>Description</th><th>Amount</th><th>Status</th><th>Actions</th></tr>
      </thead>
      <tbody>
        @for (e of filtered(); track e.id) {
          <tr>
            <td>{{ e.id }}</td>
            <td>{{ e.ownerId }}</td>
            <td>{{ e.department }}</td>
            <td>{{ e.description }}</td>
            <td>{{ e.amount | currency }}</td>
            <td><span class="status" [class]="e.status">{{ e.status }}</span></td>
            <td>
              @if (e.allowedActions.approve || session.revealHidden()) {
                <button class="btn" [class.btn-denied]="!e.allowedActions.approve" (click)="approve(e)">Approve</button>
              }
              @if (e.allowedActions.delete || session.revealHidden()) {
                <button class="btn btn-secondary" [class.btn-denied]="!e.allowedActions.delete" (click)="remove(e)">Delete</button>
              }
            </td>
          </tr>
        } @empty {
          <tr>
            <td colspan="7" class="text-gray-500">
              @if (expenses().length) { No expenses match the filters. } @else { Cerbos allows you to view no expenses here. }
            </td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class ExpenseTable {
  readonly expenses = input.required<Expense[]>();
  readonly changed = output();

  protected readonly session = inject(Session);
  private readonly api = inject(ApiService);
  private readonly notifier = inject(Notifier);

  protected readonly toAmount = toAmount;

  protected readonly search = signal('');
  protected readonly owner = signal('');
  protected readonly department = signal('');
  protected readonly status = signal('');
  protected readonly minAmount = signal<number | null>(null);
  protected readonly maxAmount = signal<number | null>(null);
  protected readonly action = signal<ActionFilter>('');

  protected readonly owners = computed(() => distinct(this.expenses().map((e) => e.ownerId)));
  protected readonly departments = computed(() => distinct(this.expenses().map((e) => e.department)));
  protected readonly statuses = computed(() => distinct(this.expenses().map((e) => e.status)));

  protected readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();
    const [owner, department, status, action] = [this.owner(), this.department(), this.status(), this.action()];
    const [min, max] = [this.minAmount(), this.maxAmount()];

    return this.expenses().filter(
      (e) =>
        (!query || [e.id, e.ownerId, e.description].some((v) => v.toLowerCase().includes(query))) &&
        (!owner || e.ownerId === owner) &&
        (!department || e.department === department) &&
        (!status || e.status === status) &&
        (min === null || e.amount >= min) &&
        (max === null || e.amount <= max) &&
        (!action || e.allowedActions[action]),
    );
  });

  protected readonly hasFilters = computed(
    () =>
      !!(this.search() || this.owner() || this.department() || this.status() || this.action()) ||
      this.minAmount() !== null ||
      this.maxAmount() !== null,
  );

  constructor() {
    // A different user or policy version sees different rows, so stale filters would only hide them.
    effect(() => {
      this.session.context();
      this.clearFilters();
    });
  }

  protected clearFilters() {
    this.search.set('');
    this.owner.set('');
    this.department.set('');
    this.status.set('');
    this.minAmount.set(null);
    this.maxAmount.set(null);
    this.action.set('');
  }

  protected approve(e: Expense) {
    this.api.approve(e.id).subscribe(() => {
      this.notifier.info(`Approved ${e.id}`);
      this.changed.emit();
    });
  }

  protected remove(e: Expense) {
    this.api.delete(e.id).subscribe(() => {
      this.notifier.info(`Deleted ${e.id}`);
      this.changed.emit();
    });
  }
}
