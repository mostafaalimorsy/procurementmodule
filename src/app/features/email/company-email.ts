import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { map } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { mailFailureLabel } from '../../core/localization/labels';
import { problemMessage } from '../../core/localization/product-problem';
import { CompanyEmailApi, CompanyEmailSettings } from './email.api';
import { MailServerAdapter, MailServerPanel } from './mail-server-panel';

/**
 * The company's email delivery: who tender emails come from now, and — when the plan includes a company mail
 * server — that server's settings, password, test and switch. Company Admin only; the API decides again.
 */
@Component({
  selector: 'app-company-email',
  imports: [MailServerPanel],
  styleUrl: './email.scss',
  template: `
    <section class="prj-page">
      <div class="prj-head">
        <div>
          <p class="prj-eyebrow" i18n="@@companyEmail.eyebrow">Company administration</p>
          <h1 i18n="@@companyEmail.title">Email delivery</h1>
          <p i18n="@@companyEmail.intro">
            How tender invitations and reminders are sent for your company.
          </p>
        </div>
      </div>
      @if (error()) {
        <p class="prj-note prj-note--error" role="alert">{{ error() }}</p>
      }
      @if (settings(); as current) {
        <div
          class="mail-status"
          [class.mail-status--problem]="!current.effectiveSender.ready"
          role="status"
        >
          <span class="prj-hint" i18n="@@companyEmail.currentSender"
            >Tender emails currently come from</span
          >
          @if (current.effectiveSender.fromAddress) {
            <strong
              ><bdi>{{ current.effectiveSender.fromName ?? '' }}</bdi
              >&ngsp;<bdi dir="ltr">&lt;{{ current.effectiveSender.fromAddress }}&gt;</bdi></strong
            >
          }
          <span>
            @if (current.effectiveSender.source === 'Company') {
              <ng-container i18n="@@companyEmail.viaCompany"
                >through your company's own mail server</ng-container
              >
            } @else {
              <ng-container i18n="@@companyEmail.viaPlatform"
                >through the platform's mail service</ng-container
              >
            }
          </span>
          @if (!current.effectiveSender.ready) {
            <span class="mail-result--failed">
              <ng-container i18n="@@companyEmail.notReady"
                >Emails cannot be sent right now:</ng-container
              >&ngsp;{{ failureLabel(current.effectiveSender.problem) }}.
            </span>
          }
        </div>
        @if (!current.customSmtpEntitled) {
          <p class="prj-note" role="note" i18n="@@companyEmail.notEntitled">
            Your plan uses the platform's mail service. Sending through your own company mail server
            is part of the Company mail server capability; ask your platform operator if you need
            it.
          </p>
          @if (current.server; as server) {
            <p class="prj-hint" i18n="@@companyEmail.dormant">
              A company server is configured but is not used while the plan does not include it.
            </p>
            @if (server.isEnabled) {
              <p class="prj-hint" i18n="@@companyEmail.dormantEnabled">
                It is still switched on, so it would be used again if the plan includes it later.
              </p>
              <div class="prj-form-actions">
                <button
                  class="prj-btn prj-btn--ghost"
                  type="button"
                  [disabled]="busy()"
                  (click)="switchOff(server.version)"
                  i18n="@@companyEmail.switchOff"
                >
                  Switch the company server off
                </button>
              </div>
            }
          }
        } @else {
          <app-mail-server-panel
            [server]="current.server"
            [adapter]="adapter"
            [company]="true"
            [requireCompanyServer]="current.requireCompanyServer"
            [testRecipient]="email()"
            [secretProtectionAvailable]="current.secretProtectionAvailable"
            (changed)="load()"
          />
        }
      } @else if (!error()) {
        <p class="prj-note" i18n="@@companyEmail.loading">Loading email settings…</p>
      }
    </section>
  `,
})
export class CompanyEmailPage implements OnInit {
  private readonly api = inject(CompanyEmailApi);
  private readonly session = inject(SessionService);
  readonly settings = signal<CompanyEmailSettings | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly failureLabel = mailFailureLabel;
  readonly email = computed(() => this.session.identity()?.email ?? null);

  readonly adapter: MailServerAdapter = {
    save: (input, version) =>
      this.api.save(input, version).pipe(map((settings) => settings.server)),
    replaceCredentials: (username, password, version) =>
      this.api
        .replaceCredentials(username, password, version)
        .pipe(map((settings) => settings.server)),
    test: (version) => this.api.test(version),
    setEnabled: (enabled, version) =>
      this.api.setEnabled(enabled, version).pipe(map((settings) => settings.server)),
  };

  ngOnInit(): void {
    this.load();
  }

  /** Disabling needs no plan capability, so a downgraded company can still stop a dormant server. */
  switchOff(version: string): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.setEnabled(false, version).subscribe({
      next: (settings) => {
        this.busy.set(false);
        this.settings.set(settings);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(problemMessage(error, { plane: 'tenant' }));
      },
    });
  }

  load(): void {
    this.error.set('');
    this.api.get().subscribe({
      next: (settings) => this.settings.set(settings),
      error: (error: unknown) => this.error.set(problemMessage(error, { plane: 'tenant' })),
    });
  }
}
