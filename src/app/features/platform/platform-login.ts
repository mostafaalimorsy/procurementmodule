import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  OperatorChallenge,
  PlatformSessionService,
} from '../../core/auth/platform-session.service';

/** "JBSWY3DPEHPK3PXP" → "JBSW Y3DP EHPK 3PXP": a secret is typed into an authenticator app in groups of four. */
export function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * CF-066 (ADR-142): operator sign-in in two steps — the password, then a code from an authenticator app (on the first sign-in the
 * operator enrolls the secret shown once). Nothing is signed in until the code is accepted.
 */
@Component({
  selector: 'app-platform-login',
  imports: [FormsModule],
  styleUrl: './platform.scss',
  template: `
    <section class="narrow">
      <p class="eyebrow" i18n="@@platformLogin.eyebrow">Platform administration</p>
      <h1 i18n="@@platformLogin.title">Operator sign in</h1>
      @if (step(); as current) {
        <form (ngSubmit)="verify(current)" #codeForm="ngForm">
          @if (current.status === 'enrollment_required') {
            <p i18n="@@platformLogin.enrollIntro">
              Set up your authenticator app (for example Microsoft Authenticator or Google
              Authenticator): add an account with this key, or open the link on the device that has
              the app. The key is shown only now.
            </p>
            <p class="ltr-token" dir="ltr" data-testid="totp-secret">
              <strong>{{ grouped(current.secret ?? '') }}</strong>
            </p>
            @if (current.provisioningUri) {
              <p>
                <a [href]="current.provisioningUri" i18n="@@platformLogin.openApp"
                  >Open in the authenticator app</a
                >
              </p>
            }
          } @else {
            <p i18n="@@platformLogin.codeIntro">
              Enter the 6-digit code your authenticator app shows for this console.
            </p>
          }
          <label
            ><span i18n="@@platformLogin.code">Code</span
            ><input
              dir="ltr"
              class="ltr-token"
              name="code"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="7"
              required
              [(ngModel)]="code"
          /></label>
          @if (error()) {
            <p role="alert" class="error">{{ error() }}</p>
          }
          <div class="actions">
            <button [disabled]="codeForm.invalid || busy()">
              @if (busy()) {
                <span i18n="@@login.busy">Signing in…</span>
              } @else {
                <span i18n="@@platformLogin.verify">Verify and sign in</span>
              }
            </button>
            <button
              class="secondary"
              type="button"
              (click)="restart()"
              i18n="@@platformLogin.restart"
            >
              Start again
            </button>
          </div>
        </form>
      } @else {
        <p i18n="@@platformLogin.intro">
          Access is restricted to provisioned Platform Operators. Company accounts cannot administer
          the platform.
        </p>
        <form (ngSubmit)="submit()" #form="ngForm">
          <label
            ><span i18n="@@login.email">Email address</span
            ><input
              dir="ltr"
              class="ltr-token"
              name="email"
              type="email"
              autocomplete="username"
              required
              [(ngModel)]="email"
          /></label>
          <label
            ><span i18n="@@login.password">Password</span
            ><input
              name="password"
              type="password"
              autocomplete="current-password"
              required
              [(ngModel)]="password"
          /></label>
          @if (error()) {
            <p role="alert" class="error">{{ error() }}</p>
          }
          <button [disabled]="form.invalid || busy()">
            @if (busy()) {
              <span i18n="@@login.busy">Signing in…</span>
            } @else {
              <span i18n="@@login.submit">Sign in</span>
            }
          </button>
        </form>
      }
    </section>
  `,
})
export class PlatformLogin {
  private readonly session = inject(PlatformSessionService);
  private readonly router = inject(Router);
  email = '';
  password = '';
  code = '';
  readonly busy = signal(false);
  readonly error = signal('');
  readonly step = signal<OperatorChallenge | null>(null);
  protected readonly grouped = groupSecret;

  submit(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const password = this.password;
    this.password = '';
    this.session.login(this.email, password).subscribe({
      next: (challenge) => {
        this.busy.set(false);
        this.code = '';
        this.step.set(challenge);
      },
      error: () => {
        this.busy.set(false);
        this.error.set(
          $localize`:@@login.failed:Sign in failed. Check your credentials and try again.`,
        );
      },
    });
  }

  verify(challenge: OperatorChallenge): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const code = this.code.replace(/\s/g, '');
    this.code = '';
    this.session.verify(challenge.challenge, code).subscribe({
      next: () => {
        this.busy.set(false);
        this.step.set(null);
        void this.router.navigate(['/platform/companies']);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        // Re-audit R-05: once the code budget is spent the step is over — back to the password, with the wait named.
        if ((error as { status?: number } | null)?.status === 429) {
          this.step.set(null);
          this.error.set(
            $localize`:@@problem.mfaExhausted:Too many codes were not accepted. Wait 15 minutes, then sign in again.`,
          );
          return;
        }
        this.error.set(
          $localize`:@@platformLogin.codeFailed:That code was not accepted. Enter the current code, or start again if this step expired.`,
        );
      },
    });
  }

  restart(): void {
    this.step.set(null);
    this.code = '';
    this.error.set('');
  }
}
