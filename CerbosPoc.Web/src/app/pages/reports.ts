import { CurrencyPipe, KeyValuePipe } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { ApiService, DepartmentReport } from '../api.service';
import { Session } from '../session';

@Component({
  selector: 'app-reports',
  imports: [CurrencyPipe, KeyValuePipe],
  template: `
    <h1 class="mb-4 text-2xl font-bold">Reports</h1>
    <p class="mb-4 text-gray-500">Totals only include expenses Cerbos lets you view, so managers see their own department.</p>
    <table class="data-table">
      <thead>
        <tr><th>Department</th><th>Expenses</th><th>Total</th><th>By status</th></tr>
      </thead>
      <tbody>
        @for (r of reports(); track r.department) {
          <tr>
            <td>{{ r.department }}</td>
            <td>{{ r.count }}</td>
            <td>{{ r.total | currency }}</td>
            <td>
              @for (s of r.byStatus | keyvalue; track s.key) {
                <span class="status" [class]="s.key">{{ s.key }} {{ s.value | currency }}</span>&nbsp;
              }
            </td>
          </tr>
        } @empty {
          <tr><td colspan="4" class="text-gray-500">No report data.</td></tr>
        }
      </tbody>
    </table>
  `,
})
export class ReportsPage {
  private readonly session = inject(Session);
  private readonly api = inject(ApiService);
  protected readonly reports = signal<DepartmentReport[]>([]);

  constructor() {
    effect(() => {
      this.session.context();
      this.api.reports().subscribe({ next: (r) => this.reports.set(r), error: () => this.reports.set([]) });
    });
  }
}
