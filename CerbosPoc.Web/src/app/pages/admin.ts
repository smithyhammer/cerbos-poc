import { Component, effect, inject, signal } from '@angular/core';
import { ApiService, Section, UserSections } from '../api.service';
import { Notifier, Session } from '../session';

@Component({
  selector: 'app-admin',
  template: `
    <h1 class="mb-4 text-2xl font-bold">Admin</h1>

    <div class="card">
      <h3 class="mb-2 text-lg font-semibold">Section access matrix</h3>
      <p class="mb-4 text-gray-500">Evaluated live against the Cerbos PDP. Edit <code>policies/app_section.yaml</code> and reload to see changes.</p>
      <table class="data-table">
        <thead>
          <tr>
            <th>User</th>
            @for (s of sections; track s) { <th>{{ s }}</th> }
          </tr>
        </thead>
        <tbody>
          @for (row of matrix(); track row.user.id) {
            <tr>
              <td>{{ row.user.id }} <span class="text-gray-500">({{ row.user.role }}{{ row.user.department ? ', ' + row.user.department : '' }})</span></td>
              @for (s of sections; track s) {
                <td [class]="row.sections[s] ? 'allow' : 'deny'">{{ row.sections[s] ? 'ALLOW' : 'DENY' }}</td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>

    <div class="card">
      <h3 class="mb-2 text-lg font-semibold">Demo data</h3>
      <button class="btn" (click)="reset()">Reset expenses</button>
    </div>
  `,
})
export class AdminPage {
  private readonly session = inject(Session);
  private readonly api = inject(ApiService);
  private readonly notifier = inject(Notifier);

  protected readonly sections: Section[] = ['expenses', 'approvals', 'reports', 'admin'];
  protected readonly matrix = signal<UserSections[]>([]);

  constructor() {
    effect(() => {
      this.session.context();
      this.api.adminUsers().subscribe({ next: (m) => this.matrix.set(m), error: () => this.matrix.set([]) });
    });
  }

  protected reset() {
    this.api.reset().subscribe(() => this.notifier.info('Expenses reset to seed data'));
  }
}
