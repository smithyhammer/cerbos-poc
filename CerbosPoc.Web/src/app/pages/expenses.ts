import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Expense } from '../api.service';
import { Notifier, Session } from '../session';
import { ExpenseTable } from './expense-table';

@Component({
  selector: 'app-expenses',
  imports: [FormsModule, ExpenseTable],
  template: `
    <h1 class="mb-4 text-2xl font-bold">Expenses</h1>

    @if (session.me()?.canCreateExpense || session.revealHidden()) {
      <div class="card" [class.card-denied]="!session.me()?.canCreateExpense">
        <h3 class="mb-2 text-lg font-semibold">New expense</h3>
        <form class="flex flex-wrap items-end gap-3" (ngSubmit)="create()">
          <label class="flex flex-col gap-1 text-sm">Description <input type="text" class="field" name="description" [(ngModel)]="description" required /></label>
          <label class="flex flex-col gap-1 text-sm">Amount <input type="number" class="field" name="amount" [(ngModel)]="amount" min="1" /></label>
          <label class="flex items-center gap-1.5 py-1 text-sm"><input type="checkbox" class="accent-blue-600" name="submit" [(ngModel)]="submit" /> Submit for approval</label>
          <button type="submit" class="btn" [class.btn-denied]="!session.me()?.canCreateExpense">Create</button>
        </form>
      </div>
    }

    <app-expense-table [expenses]="expenses()" (changed)="load()" />
  `,
})
export class ExpensesPage {
  protected readonly session = inject(Session);
  private readonly api = inject(ApiService);
  private readonly notifier = inject(Notifier);

  protected readonly expenses = signal<Expense[]>([]);
  protected description = '';
  protected amount = 250;
  protected submit = false;

  constructor() {
    effect(() => {
      this.session.context();
      this.load();
    });
  }

  load() {
    this.api.expenses().subscribe({ next: (e) => this.expenses.set(e), error: () => this.expenses.set([]) });
  }

  protected create() {
    this.api.createExpense(this.amount, this.description || 'Untitled', this.submit).subscribe((e) => {
      this.notifier.info(`Created ${e.id}`);
      this.description = '';
      this.load();
    });
  }
}
