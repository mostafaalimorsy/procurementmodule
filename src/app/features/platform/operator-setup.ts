import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PlatformSessionService } from '../../core/auth/platform-session.service';

/** CF-066 (ADR-142): a new operator sets their own password from the one-time link another operator handed them (then signs in). */
@Component({
  selector: 'app-operator-setup',
  imports: [FormsModule],
  styleUrl: './platform.scss',
  template: `
    <section class="narrow">
      <p class="eyebrow" i18n="@@platformLogin.eyebrow">Platform administration</p>
      <h1 i18n="@@operatorSetup.title">Set your operator password</h1>
      <p i18n="@@operatorSetup.intro">
        Choose a password of at least 14 characters. You then sign in and set up your authenticator
        app. The link works once and expires 24 hours after it was created.
      </p>
      <form (ngSubmit)="submit()" #form="ngForm">
        <label
          ><span i18n="@@login.password">Password</span
          ><input
            name="password"
            type="password"
            autocomplete="new-password"
            minlength="14"
            maxlength="128"
            required
            [(ngModel)]="password"
        /></label>
        <label
          ><span i18n="@@operatorSetup.confirm">Confirm password</span
          ><input
            name="confirm"
            type="password"
            autocomplete="new-password"
            required
            [(ngModel)]="confirm"
        /></label>
        @if (error()) {
          <p role="alert" class="error">{{ error() }}</p>
        }
        <button
          [disabled]="form.invalid || password !== confirm || busy()"
          i18n="@@operatorSetup.save"
        >
          Set password
        </button>
      </form>
    </section>
  `,
})
export class OperatorSetup {
  private readonly session = inject(PlatformSessionService);
  private readonly router = inject(Router);
  private readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '';
  password = '';
  confirm = '';
  readonly busy = signal(false);
  readonly error = signal('');

  submit(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const password = this.password;
    this.password = '';
    this.confirm = '';
    this.session.setup(this.token, password).subscribe({
      next: () => {
        this.busy.set(false);
        void this.router.navigate(['/platform/login']);
      },
      error: () => {
        this.busy.set(false);
        this.error.set(
          $localize`:@@operatorSetup.failed:This setup link is invalid or has expired. Ask another operator for a new one.`,
        );
      },
    });
  }
}
