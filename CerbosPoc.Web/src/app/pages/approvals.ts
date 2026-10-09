import { Component, effect, inject, signal } from '@angular/core';
import { ApiService, Expense } from '../api.service';
import { Session } from '../session';
import { ExpenseTable } from './expense-table';

@Component({
  selector: 'app-approvals',
  imports: [ExpenseTable],
  template: `
    <h1 class="mb-4 text-2xl font-bold">Approvals</h1>
    <p class="mb-4 text-gray-500">Expenses you can approve right now: submitted, in your department, up to $10,000 and not your own.</p>
    <app-expense-table [expenses]="expenses()" (changed)="load()" />
  `,
})
export class ApprovalsPage {
  private readonly session = inject(Session);
  private readonly api = inject(ApiService);
  protected readonly expenses = signal<Expense[]>([]);

  constructor() {
    effect(() => {
      this.session.context();
      this.load();
    });
  }

  load() {
    this.api.approvals().subscribe({ next: (e) => this.expenses.set(e), error: () => this.expenses.set([]) });
  }
}
