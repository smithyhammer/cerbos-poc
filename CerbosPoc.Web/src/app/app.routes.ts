import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { Section } from './api.service';
import { AdminPage } from './pages/admin';
import { ApprovalsPage } from './pages/approvals';
import { ExpensesPage } from './pages/expenses';
import { HomePage } from './pages/home';
import { ReportsPage } from './pages/reports';
import { Session } from './session';

// Client-side guard for UX only; the API enforces the same Cerbos decision on every call.
const sectionGuard = (section: Section): CanActivateFn => () => {
  const session = inject(Session);
  const router = inject(Router);
  return toObservable(session.me).pipe(
    filter((me) => me !== null),
    take(1),
    map(() => session.canSee(section) || router.createUrlTree(['/'])),
  );
};

export const routes: Routes = [
  { path: '', component: HomePage },
  { path: 'expenses', component: ExpensesPage, canActivate: [sectionGuard('expenses')], data: { section: 'expenses' } },
  { path: 'approvals', component: ApprovalsPage, canActivate: [sectionGuard('approvals')], data: { section: 'approvals' } },
  { path: 'reports', component: ReportsPage, canActivate: [sectionGuard('reports')], data: { section: 'reports' } },
  { path: 'admin', component: AdminPage, canActivate: [sectionGuard('admin')], data: { section: 'admin' } },
  { path: '**', redirectTo: '' },
];
