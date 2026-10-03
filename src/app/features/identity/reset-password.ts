import { LocaleService } from '../../core/localization/locale.service';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TenantIdentityApi, takeTokenFromFragment } from './tenant-identity.api';

@Component({
  selector: 'app-reset-password',
  imports: [FormsModule, RouterLink],
  template: `
    <section class="auth-layout" aria-labelledby="reset-title">
      <div class="auth-intro">
        <p class="eyebrow" i18n="@@recovery.eyebrow">Account recovery</p>
        <h1 id="reset-title" i18n="@@reset.title">Choose a new password.</h1>
        <p i18n="@@reset.intro">
          Completing this reset signs out older company sessions for this account.
        </p>
      </div>

      <form class="auth-card" (ngSubmit)="submit()" #form="ngForm">
        <div>
          <p class="form-index" aria-hidden="true">
            <bdi dir="ltr">02</bdi> / <span i18n="@@reset.index">RESET</span>
          </p>
          <h2 i18n="@@password.new">New password</h2>
        </div>
        @if (!token) {
          <p role="alert" class="error" i18n="@@reset.incomplete">
            This reset link is incomplete or invalid.
          </p>
        }
        <label for="reset-password" i18n="@@password.new">New password</label>
        <input
          id="reset-password"
          name="password"
          type="password"
          autocomplete="new-password"
          minlength="12"
          required
          [(ngModel)]="password"
        />
        <p class="field-help" i18n="@@password.help">
          Use at least 12 characters. A memorable passphrase works well.
        </p>
        <label for="reset-confirm-password" i18n="@@password.confirm">Confirm new password</label>
        <input
          id="reset-confirm-password"
          name="confirmPassword"
          type="password"
          autocomplete="new-password"
          minlength="12"
          required
          [(ngModel)]="confirmPassword"
        />
        @if (mismatch()) {
          <p role="alert" class="error" i18n="@@password.mismatch">The passwords do not match.</p>
        }
        @if (error()) {
          <p role="alert" class="error">{{ error() }}</p>
        }
        <button class="primary" [disabled]="form.invalid || mismatch() || !token || busy()">
          @if (busy()) {
            <span i18n="@@reset.busy">Resetting…</span>
          } @else {
            <span i18n="@@reset.submit">Reset password</span>
          }
        </button>
        <a class="text-link" routerLink="/login" i18n="@@auth.returnToSignIn">Return to sign in</a>
      </form>
    </section>
  `,
  styleUrl: './identity-auth.scss',
})
export class ResetPassword {
  private readonly api = inject(TenantIdentityApi);
  private readonly router = inject(Router);
  readonly token = takeTokenFromFragment();

  constructor() {
    inject(DestroyRef).onDestroy(inject(LocaleService).preserveLinkForSwitch(this.token));
  }
  password = '';
  confirmPassword = '';
  readonly busy = signal(false);
  readonly error = signal('');

  mismatch(): boolean {
    return this.confirmPassword.length > 0 && this.password !== this.confirmPassword;
  }

  submit(): void {
    if (this.busy() || !this.token || this.password.length < 12 || this.mismatch()) return;
    this.busy.set(true);
    this.error.set('');
    const password = this.password;
    this.password = '';
    this.confirmPassword = '';
    this.api.resetPassword(this.token, password).subscribe({
      next: () => {
        this.busy.set(false);
        void this.router.navigate(['/login'], {
          replaceUrl: true,
          queryParams: { passwordReset: '1' },
        });
      },
      error: () => {
        this.busy.set(false);
        this.error.set(
          $localize`:@@problem.resetInvalid:This reset link is invalid or expired. Request a new password reset.`,
        );
      },
    });
  }
}
