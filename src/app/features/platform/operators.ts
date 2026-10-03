import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlatformSessionService } from '../../core/auth/platform-session.service';
import { BusinessDatePipe } from '../../core/localization/business-format';
import {
  CreatedOperator,
  PlatformApi,
  PlatformOperator,
  problemMessage,
} from './platform-api.service';

/**
 * CF-066 (ADR-142): the named operators. An operator creates another (a one-time setup link to hand over out of band), disables or
 * re-enables them, or resets their authenticator after a lost device — never their own access. Every change is in the platform audit.
 */
@Component({
  selector: 'app-platform-operators',
  imports: [FormsModule, BusinessDatePipe],
  styleUrl: './platform.scss',
  template: `
    <p class="eyebrow" i18n="@@companies.eyebrow">Platform control plane</p>
    <h1 i18n="@@operators.title">Operators</h1>
    <p i18n="@@operators.intro">
      Every operator signs in with their own password and an authenticator app. Keep at least two
      active operators, so one can always restore the other.
    </p>
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    @if (operators().length > 0 && activeCount() < 2) {
      <p class="error" role="note" data-testid="single-operator" i18n="@@operators.single">
        Only one operator is active. Add a second named operator before the pilot.
      </p>
    }
    <section class="panel" aria-labelledby="operators-list-title">
      <h2 id="operators-list-title" i18n="@@operators.list">Named operators</h2>
      <div class="table-scroll">
        <table data-testid="operators-table">
          <thead>
            <tr>
              <th scope="col" i18n="@@operators.colOperator">Operator</th>
              <th scope="col" i18n="@@operators.colStatus">Status</th>
              <th scope="col" i18n="@@operators.colLastSignIn">Last sign-in</th>
              <th scope="col">
                <span class="visually-hidden" i18n="@@residency.colActions">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            @for (item of operators(); track item.id) {
              <tr>
                <td>
                  <bdi>{{ item.displayName }}</bdi> ·
                  <bdi dir="ltr" class="ltr-token">{{ item.email }}</bdi>
                  @if (item.id === me()) {
                    <span class="state-chip" i18n="@@operators.you">You</span>
                  }
                </td>
                <td>
                  @if (item.status === 'Disabled') {
                    <span class="state-chip state-chip--suspended" i18n="@@operators.disabled"
                      >Disabled</span
                    >
                  } @else if (item.setupPending) {
                    <span class="state-chip state-chip--muted" i18n="@@operators.setupPending"
                      >Setup link not used yet</span
                    >
                  } @else if (!item.totpEnrolled) {
                    <span class="state-chip state-chip--muted" i18n="@@operators.enrollPending"
                      >Authenticator not set up yet</span
                    >
                  } @else {
                    <span class="state-chip" i18n="@@status.active">Active</span>
                  }
                </td>
                <td>
                  @if (item.lastSignInAtUtc) {
                    <bdi>{{ item.lastSignInAtUtc | businessDate: 'instant' }}</bdi>
                  } @else {
                    —
                  }
                </td>
                <td>
                  @if (item.id !== me()) {
                    @if (item.status === 'Active') {
                      <button
                        class="secondary"
                        type="button"
                        [disabled]="busy()"
                        (click)="act(item, 'disable')"
                        i18n="@@operators.disable"
                      >
                        Disable
                      </button>
                      @if (item.totpEnrolled) {
                        <button
                          class="secondary"
                          type="button"
                          [disabled]="busy()"
                          (click)="act(item, 'reset-totp')"
                          i18n="@@operators.resetTotp"
                        >
                          Reset authenticator
                        </button>
                      }
                    } @else {
                      <button
                        class="secondary"
                        type="button"
                        [disabled]="busy()"
                        (click)="act(item, 'enable')"
                        i18n="@@operators.enable"
                      >
                        Enable
                      </button>
                    }
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
    <section class="panel" aria-labelledby="operator-create-title">
      <h2 id="operator-create-title" i18n="@@operators.createTitle">Add an operator</h2>
      @if (created(); as done) {
        <p role="status" data-testid="setup-link" i18n="@@operators.created">
          Hand this one-time setup link to <bdi>{{ done.operator.displayName }}</bdi> yourself (not
          by email to a shared mailbox). It works once, until
          <bdi>{{ done.expiresAtUtc | businessDate: 'instant' }}</bdi
          >, and is not shown again:
        </p>
        <p class="ltr-token" dir="ltr">
          <code>{{ setupLink(done) }}</code>
        </p>
      }
      <form (ngSubmit)="create()" #form="ngForm">
        <label
          ><span i18n="@@operators.name">Name</span
          ><input name="displayName" required maxlength="160" [(ngModel)]="displayName"
        /></label>
        <label
          ><span i18n="@@login.email">Email address</span
          ><input
            dir="ltr"
            class="ltr-token"
            name="email"
            type="email"
            required
            [(ngModel)]="email"
        /></label>
        <button [disabled]="form.invalid || busy()" i18n="@@operators.create">
          Create setup link
        </button>
      </form>
    </section>
  `,
})
export class PlatformOperators implements OnInit {
  private readonly api = inject(PlatformApi);
  private readonly session = inject(PlatformSessionService);
  readonly operators = signal<PlatformOperator[]>([]);
  readonly created = signal<CreatedOperator | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  email = '';
  displayName = '';

  protected me(): string | undefined {
    return this.session.identity()?.id;
  }

  protected activeCount(): number {
    return this.operators().filter((item) => item.status === 'Active').length;
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.operators().subscribe({
      next: (items) => this.operators.set(items),
      error: (error: unknown) => this.error.set(problemMessage(error)),
    });
  }

  create(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.createOperator(this.email.trim(), this.displayName.trim()).subscribe({
      next: (done) => {
        this.busy.set(false);
        this.created.set(done);
        this.email = '';
        this.displayName = '';
        this.load();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(problemMessage(error));
      },
    });
  }

  act(item: PlatformOperator, action: 'disable' | 'enable' | 'reset-totp'): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.operatorAction(item.id, action).subscribe({
      next: () => {
        this.busy.set(false);
        this.load();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(problemMessage(error));
      },
    });
  }

  protected setupLink(done: CreatedOperator): string {
    return `${location.origin}/platform/setup?token=${encodeURIComponent(done.setupToken)}`;
  }
}
