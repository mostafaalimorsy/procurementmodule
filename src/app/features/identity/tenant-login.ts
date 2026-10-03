import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { safeReturnUrl } from '../../core/auth/return-url';
import { knownProductProblem } from '../../core/localization/product-problem';
import { SessionService, TenantMfaChallenge } from '../../core/auth/session.service';

@Component({
  selector: 'app-tenant-login',
  imports: [FormsModule, RouterLink],
  template: `
    <section class="auth-layout" aria-labelledby="sign-in-title">
      <div class="auth-intro">
        <p class="eyebrow" i18n="@@login.workspace">Company workspace</p>
        <h1 id="sign-in-title" i18n="@@login.welcome">Welcome back.</h1>
        <p i18n="@@login.intro">
          Sign in with the company account you activated from your secure invitation.
        </p>
        <div class="trust-note">
          <span class="directional-icon" aria-hidden="true">↳</span>
          <p i18n="@@login.trust">
            Your company and access rights are resolved securely after sign in.
          </p>
        </div>
      </div>

      @if (recoveryCodes(); as codes) {
        <section
          class="auth-card"
          aria-labelledby="recovery-codes-title"
          data-testid="recovery-codes"
        >
          <h2 id="recovery-codes-title" i18n="@@mfa.recoveryTitle">Save your recovery codes</h2>
          <p i18n="@@mfa.recoveryIntro">
            If you lose your phone, each of these codes signs you in once instead of an
            authenticator code. Keep them somewhere safe; they are shown only now.
          </p>
          <ul class="recovery-codes" dir="ltr">
            @for (code of codes; track code) {
              <li>
                <code>{{ code }}</code>
              </li>
            }
          </ul>
          <button
            class="primary"
            type="button"
            (click)="continueAfterCodes()"
            i18n="@@mfa.recoverySaved"
          >
            I have saved these codes
          </button>
        </section>
      } @else if (step(); as current) {
        <form class="auth-card" (ngSubmit)="verify(current)" #codeForm="ngForm">
          <div>
            <p class="form-index" aria-hidden="true">
              <bdi dir="ltr">02</bdi> / <span i18n="@@mfa.index">VERIFY</span>
            </p>
            <h2 i18n="@@mfa.title">Authenticator code</h2>
          </div>
          @if (current.status === 'enrollment_required') {
            <p i18n="@@mfa.enrollIntro">
              Your company signs your role in with an authenticator app (for example Microsoft
              Authenticator or Google Authenticator). Add an account with this key, or open the link
              on the phone that has the app, then enter the code it shows. The key is shown only
              now.
            </p>
            <p class="ltr-token" dir="ltr" data-testid="mfa-secret">
              <strong>{{ grouped(current.secret ?? '') }}</strong>
            </p>
            @if (current.provisioningUri) {
              <a class="text-link" [href]="current.provisioningUri" i18n="@@mfa.openApp"
                >Open in the authenticator app</a
              >
            }
          } @else {
            <p i18n="@@mfa.codeIntro">
              Enter the 6-digit code from your authenticator app, or one of your recovery codes.
            </p>
          }
          <label for="tenant-code" i18n="@@mfa.code">Code</label>
          <input
            id="tenant-code"
            name="code"
            dir="ltr"
            class="ltr-token"
            inputmode="text"
            autocomplete="one-time-code"
            maxlength="12"
            required
            [(ngModel)]="code"
          />
          @if (error()) {
            <p role="alert" class="error">{{ error() }}</p>
          }
          <button class="primary" [disabled]="codeForm.invalid || busy()">
            @if (busy()) {
              <span i18n="@@login.busy">Signing in…</span>
            } @else {
              <span i18n="@@mfa.verify">Verify and sign in</span>
            }
          </button>
          <button class="text-link" type="button" (click)="restart()" i18n="@@mfa.restart">
            Start again
          </button>
        </form>
      } @else {
        <form class="auth-card" (ngSubmit)="submit()" #form="ngForm">
          <div>
            <p class="form-index" aria-hidden="true">
              <bdi dir="ltr">01</bdi> / <span i18n="@@login.index">SIGN IN</span>
            </p>
            <h2 i18n="@@login.account">Company account</h2>
          </div>
          @if (notice()) {
            <p role="status" class="notice">{{ notice() }}</p>
          }
          <label for="tenant-email" i18n="@@login.email">Email address</label>
          <input
            id="tenant-email"
            name="email"
            type="email"
            dir="ltr"
            class="ltr-token"
            autocomplete="username"
            inputmode="email"
            required
            [(ngModel)]="email"
            #emailControl="ngModel"
            email
            aria-describedby="email-validation"
          />
          @if (emailControl.touched && emailControl.invalid) {
            <p id="email-validation" class="error" role="alert" i18n="@@login.validEmail">
              Enter a valid email address.
            </p>
          }
          <label for="tenant-password" i18n="@@login.password">Password</label>
          <input
            id="tenant-password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
            [(ngModel)]="password"
          />
          @if (error()) {
            <p role="alert" class="error">{{ error() }}</p>
          }
          <button class="primary" [disabled]="form.invalid || busy()">
            @if (busy()) {
              <span i18n="@@login.busy">Signing in…</span>
            } @else {
              <span i18n="@@login.submit">Sign in</span>
            }
          </button>
          <a class="text-link" routerLink="/forgot-password" i18n="@@login.forgot"
            >Forgot your password?</a
          >
        </form>
      }
    </section>
  `,
  styleUrl: './identity-auth.scss',
})
export class TenantLogin {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  email = '';
  password = '';
  code = '';
  readonly step = signal<TenantMfaChallenge | null>(null);
  readonly recoveryCodes = signal<readonly string[] | null>(null);
  protected readonly grouped = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal(this.readNotice());

  submit(): void {
    if (this.busy()) return;
    if (!this.email.trim() || !this.password) {
      this.error.set(knownProductProblem({ code: 'validation.required' })!);
      return;
    }
    this.busy.set(true);
    this.error.set('');
    const password = this.password;
    this.password = '';
    this.session.login(this.email.trim(), password).subscribe({
      next: (challenge) => {
        this.busy.set(false);
        if (challenge) {
          this.code = '';
          this.step.set(challenge);
          return;
        }
        this.continue();
      },
      error: () => {
        this.busy.set(false);
        this.error.set(
          $localize`:@@login.failed:Sign in failed. Check your credentials and try again.`,
        );
      },
    });
  }

  /** CF-065 (ADR-145): the authenticator or recovery code. */
  verify(challenge: TenantMfaChallenge): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const code = this.code.trim();
    this.code = '';
    this.session.verify(challenge.challenge, code).subscribe({
      next: (codes) => {
        this.busy.set(false);
        this.step.set(null);
        if (codes && codes.length > 0) this.recoveryCodes.set(codes);
        else this.continue();
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
          $localize`:@@mfa.failed:That code was not accepted. Enter the current code, or start again if this step expired.`,
        );
      },
    });
  }

  continueAfterCodes(): void {
    this.recoveryCodes.set(null);
    this.continue();
  }

  restart(): void {
    this.step.set(null);
    this.code = '';
    this.error.set('');
  }

  private continue(): void {
    // CF-011: back to the page that sent here, when it is a page of this workspace.
    void this.router.navigateByUrl(
      safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')) ?? '/',
    );
  }

  private readNotice(): string {
    if (this.route.snapshot.queryParamMap.has('invitationAccepted')) {
      return $localize`:@@login.activated:Your account is active. Sign in with your new password.`;
    }
    if (this.route.snapshot.queryParamMap.has('expired')) {
      return $localize`:@@login.expired:You were signed out after a period without activity. Sign in again.`;
    }
    if (this.route.snapshot.queryParamMap.has('passwordReset')) {
      return $localize`:@@login.reset:Your password has been reset. Sign in with your new password.`;
    }
    return '';
  }
}
