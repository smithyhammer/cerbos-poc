import { Component, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Section } from './api.service';
import { Notifier, Session } from './session';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
})
export class App {
  protected readonly session = inject(Session);
  protected readonly notifier = inject(Notifier);
  private readonly router = inject(Router);

  protected readonly nav: { section: Section; label: string }[] = [
    { section: 'expenses', label: 'Expenses' },
    { section: 'approvals', label: 'Approvals' },
    { section: 'reports', label: 'Reports' },
    { section: 'admin', label: 'Admin' },
  ];

  constructor() {
    // When the user switches (or hidden UI is concealed again), leave any section they can no longer see.
    effect(() => {
      if (!this.session.me()) return;
      const section = this.router.routerState.snapshot.root.firstChild?.data['section'] as Section | undefined;
      if (section && !this.session.canSee(section)) this.router.navigate(['/']);
    });
  }

  protected switchUser(id: string) {
    this.notifier.message.set(null);
    this.session.currentUser.set(id);
  }
}
