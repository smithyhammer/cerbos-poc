import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { tap } from 'rxjs';
import { ApiService, DemoUser, Me, PolicyVersion, Section } from './api.service';

const storageKey = 'cerbos-poc.user';

// Kept separate from Session so the HTTP interceptor can read it without a circular dependency.
@Injectable({ providedIn: 'root' })
export class CurrentUser {
  readonly id = signal(localStorage.getItem(storageKey) ?? 'bob');

  set(id: string) {
    localStorage.setItem(storageKey, id);
    this.id.set(id);
  }
}

@Injectable({ providedIn: 'root' })
export class Notifier {
  readonly message = signal<{ text: string; kind: 'error' | 'info' } | null>(null);

  error(text: string) {
    this.message.set({ text, kind: 'error' });
  }

  info(text: string) {
    this.message.set({ text, kind: 'info' });
  }
}

// Holds the Cerbos decisions for the current user. The UI only hides/shows things based on
// these; the API re-checks every request, so "reveal hidden UI" lets you prove that.
@Injectable({ providedIn: 'root' })
export class Session {
  private readonly api = inject(ApiService);
  private readonly notifier = inject(Notifier);
  readonly currentUser = inject(CurrentUser);

  readonly users = signal<DemoUser[]>([]);
  readonly me = signal<Me | null>(null);
  readonly revealHidden = signal(false);
  readonly policyVersions = signal<PolicyVersion[]>([]);
  readonly activePolicyVersion = computed(() => this.policyVersions().find((v) => v.id === this.me()?.policyVersion));

  // Bumped when an admin switches the policy version, since every decision may change.
  private readonly policyRevision = signal(0);

  // Pages read this in their load effects so they refetch Cerbos-filtered data on user or policy changes.
  readonly context = computed(() => ({ user: this.currentUser.id(), policyRevision: this.policyRevision() }));

  constructor() {
    this.api.users().subscribe((users) => this.users.set(users));
    this.api.policyVersions().subscribe((state) => this.policyVersions.set(state.versions));

    effect(() => {
      this.context();
      this.reloadMe();
    });
  }

  activatePolicyVersion(version: string) {
    this.api.activatePolicyVersion(version).subscribe({
      next: (state) => {
        this.notifier.info(`Now evaluating Cerbos policy version "${state.active}"`);
        this.policyRevision.update((n) => n + 1);
      },
      // Re-render the header so the version picker snaps back to the version still in force.
      error: () => this.reloadMe(),
    });
  }

  private reloadMe() {
    this.me.set(null);
    this.api.me().subscribe((me) => this.me.set(me));
  }

  isAllowed(section: Section) {
    return this.me()?.sections[section] ?? false;
  }

  canSee(section: Section) {
    return this.revealHidden() || this.isAllowed(section);
  }
}

export const demoUserInterceptor: HttpInterceptorFn = (req, next) => {
  const user = inject(CurrentUser);
  const notifier = inject(Notifier);

  return next(req.clone({ setHeaders: { 'X-Demo-User': user.id() } })).pipe(
    tap({
      error: (err: HttpErrorResponse) =>
        notifier.error(`${err.status} ${err.error?.title ?? err.statusText}: ${err.error?.detail ?? err.message}`),
    }),
  );
};
