import { LocaleService } from '../../core/localization/locale.service';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TenantIdentityApi, takeTokenFromFragment } from './tenant-identity.api';

@Component({
  selector: 'app-invitation-acceptance',
  imports: [FormsModule, RouterLink],
  template: `
    <section class="auth-layout" aria-labelledby="invitation-title">
      <div class="auth-intro">
        <p class="eyebrow" i18n="@@invitation.eyebrow">Secure invitation</p>
        <h1 id="invitation-title" i18n="@@invitation.title">Set your password.</h1>
        <p i18n="@@invitation.intro">
          Activate your company account by choosing a private, passphrase-friendly password.
        </p>
        <div class="trust-note">
          <span class="directional-icon" aria-hidden="true">↳</span>
          <p i18n="@@invitation.trust">The invitation works once and expires automatically.</p>
        </div>
      </div>

      <form class="auth-card" (ngSubmit)="submit()" #form="ngForm">
        <div>
          <p class="form-index" aria-hidden="true">
            <bdi dir="ltr">01</bdi> / <span i18n="@@invitation.index">ACTIVATE</span>
          </p>
          <h2 i18n="@@invitation.heading">Create password</h2>
        </div>
        @if (!token) {
          <p role="alert" class="error" i18n="@@invitation.incomplete">
            This invitation link is incomplete or invalid.
          </p>
        }
        <label for="invitation-password" i18n="@@password.new">New password</label>
        <input
          id="invitation-password"
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
        <label for="invitation-confirm-password" i18n="@@password.confirm"
          >Confirm new password</label
        >
        <input
          id="invitation-confirm-password"
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
            <span i18n="@@invitation.busy">Activating…</span>
          } @else {
            <span i18n="@@invitation.submit">Activate account</span>
          }
        </button>
        <a class="text-link" routerLink="/login" i18n="@@auth.returnToSignIn">Return to sign in</a>
      </form>
    </section>
  `,
  styleUrl: './identity-auth.scss',
})
export class InvitationAcceptance {
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
    this.api.acceptInvitation(this.token, password).subscribe({
      next: () => {
        this.busy.set(false);
        void this.router.navigate(['/login'], {
          replaceUrl: true,
          queryParams: { invitationAccepted: '1' },
        });
      },
      error: () => {
        this.busy.set(false);
        this.error.set(
          $localize`:@@problem.invitationInvalid:This invitation link is invalid or expired. Ask your Company Admin to resend it.`,
        );
      },
    });
  }
}
