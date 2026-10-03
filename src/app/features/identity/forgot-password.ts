import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TenantIdentityApi } from './tenant-identity.api';

@Component({
  selector: 'app-forgot-password',
  imports: [FormsModule, RouterLink],
  template: `
    <section class="auth-layout" aria-labelledby="forgot-title">
      <div class="auth-intro">
        <p class="eyebrow" i18n="@@recovery.eyebrow">Account recovery</p>
        <h1 id="forgot-title" i18n="@@forgot.title">Reset access.</h1>
        <p i18n="@@forgot.intro">
          Enter your company email and we’ll send password reset instructions when eligible.
        </p>
      </div>

      <form class="auth-card" (ngSubmit)="submit()" #form="ngForm">
        <div>
          <p class="form-index" aria-hidden="true">
            <bdi dir="ltr">01</bdi> / <span i18n="@@forgot.index">REQUEST</span>
          </p>
          <h2 i18n="@@forgot.heading">Forgot password</h2>
        </div>
        @if (complete()) {
          <p role="status" class="notice" i18n="@@forgot.sent">
            If an eligible account matches that email, reset instructions have been sent.
          </p>
        } @else {
          <label for="recovery-email" i18n="@@login.email">Email address</label>
          <input
            dir="ltr"
            class="ltr-token"
            id="recovery-email"
            name="email"
            type="email"
            autocomplete="email"
            inputmode="email"
            required
            [(ngModel)]="email"
          />
          @if (error()) {
            <p role="alert" class="error">{{ error() }}</p>
          }
          <button class="primary" [disabled]="form.invalid || busy()">
            @if (busy()) {
              <span i18n="@@forgot.busy">Submitting…</span>
            } @else {
              <span i18n="@@forgot.submit">Send reset instructions</span>
            }
          </button>
        }
        <a class="text-link" routerLink="/login" i18n="@@auth.returnToSignIn">Return to sign in</a>
      </form>
    </section>
  `,
  styleUrl: './identity-auth.scss',
})
export class ForgotPassword {
  private readonly api = inject(TenantIdentityApi);
  email = '';
  readonly busy = signal(false);
  readonly complete = signal(false);
  readonly error = signal('');

  submit(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.forgotPassword(this.email.trim()).subscribe({
      next: () => {
        this.busy.set(false);
        this.complete.set(true);
        this.email = '';
      },
      error: () => {
        this.busy.set(false);
        this.error.set(
          $localize`:@@forgot.failed:The request could not be submitted. Please try again.`,
        );
      },
    });
  }
}
