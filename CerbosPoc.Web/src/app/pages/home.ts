import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Section } from '../api.service';
import { Session } from '../session';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <h1 class="mb-4 text-2xl font-bold">Cerbos authorization demo</h1>
    <p class="mb-4 text-gray-500">
      Switch users in the header. Navigation, sections and buttons are shown or hidden based on
      decisions the Web API gets from the Cerbos PDP. Turn on <strong>Reveal hidden UI</strong> to show
      denied controls and watch the API reject them with <code>403</code>.
    </p>

    @if (session.me(); as me) {
      <div class="card">
        <h3 class="mb-2 text-lg font-semibold">Cerbos policy versions</h3>
        <p class="mb-4 text-gray-500">
          Every decision below is evaluated against the active version.
          {{ me.canChangePolicyVersion ? 'As an admin you can switch it from the header.' : 'Only admins can switch it.' }}
        </p>
        <div class="grid gap-4 sm:grid-cols-2">
          @for (v of session.policyVersions(); track v.id) {
            <div class="rounded-md border p-3"
                 [class]="v.id === me.policyVersion ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-400' : 'border-gray-200'">
              <div class="mb-1 flex items-center justify-between">
                <span class="font-semibold">{{ v.label }} <code class="text-xs text-gray-500">{{ v.id }}</code></span>
                @if (v.id === me.policyVersion) {
                  <span class="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">Active</span>
                }
              </div>
              <p class="mb-2 text-sm text-gray-500">{{ v.description }}</p>
              <ul class="list-disc space-y-0.5 pl-5 text-sm">
                @for (c of v.changes; track c) { <li>{{ c }}</li> }
              </ul>
            </div>
          }
        </div>
      </div>

      <div class="card">
        <h3 class="mb-2 text-lg font-semibold">{{ me.user.id }} &middot; {{ me.user.role }}{{ me.user.department ? ' · ' + me.user.department : '' }}</h3>
        <table class="data-table">
          <thead>
            <tr><th>Section (app_section policy)</th><th>Decision</th></tr>
          </thead>
          <tbody>
            @for (s of sections; track s) {
              <tr>
                <td>
                  @if (session.canSee(s)) { <a class="text-blue-600 underline hover:text-blue-800" [routerLink]="'/' + s">{{ s }}</a> } @else { {{ s }} }
                </td>
                <td [class]="me.sections[s] ? 'allow' : 'deny'">{{ me.sections[s] ? 'ALLOW' : 'DENY' }}</td>
              </tr>
            }
            <tr>
              <td>Create expense (expense policy)</td>
              <td [class]="me.canCreateExpense ? 'allow' : 'deny'">{{ me.canCreateExpense ? 'ALLOW' : 'DENY' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    } @else {
      <p>Loading decisions&hellip;</p>
    }
  `,
})
export class HomePage {
  protected readonly session = inject(Session);
  protected readonly sections: Section[] = ['expenses', 'approvals', 'reports', 'admin'];
}
