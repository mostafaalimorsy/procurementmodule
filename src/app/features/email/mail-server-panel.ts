import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { mailFailureLabel } from '../../core/localization/labels';
import { problemMessage } from '../../core/localization/product-problem';
import {
  MAIL_SECURITY,
  MailSecurity,
  MailServer,
  MailServerInput,
  MailTestResult,
  securityLabel,
  testStatusLabel,
} from './email.api';

/** How the panel talks to its server (company or platform); every call returns the refreshed server. */
export interface MailServerAdapter {
  save(input: MailServerInput, version: string | null): Observable<MailServer | null>;
  replaceCredentials(
    username: string | null,
    password: string,
    version: string,
  ): Observable<MailServer | null>;
  test(version: string, recipient: string): Observable<MailTestResult>;
  setEnabled(enabled: boolean, version: string): Observable<MailServer | null>;
}

interface ServerForm {
  host: string;
  port: string;
  security: MailSecurity;
  authenticate: boolean;
  username: string;
  fromName: string;
  fromAddress: string;
  replyToAddress: string;
  requireCompanyServer: boolean;
}

/**
 * One SMTP server's settings, write-only password, test and on/off switch. The stored password never comes
 * back from the server; the panel only knows whether one is set. A passing test proves that this server
 * accepted a message from this sender to the test address — nothing more is claimed.
 */
@Component({
  selector: 'app-mail-server-panel',
  imports: [FormsModule, BusinessDatePipe],
  templateUrl: './mail-server-panel.html',
  styleUrl: './email.scss',
})
export class MailServerPanel {
  readonly server = input<MailServer | null>(null);
  readonly adapter = input.required<MailServerAdapter>();
  /** Company servers offer the "never fall back to the platform" policy; the platform server does not. */
  readonly company = input(false);
  readonly requireCompanyServer = input(false);
  /** The address a company test goes to (the administrator); the platform operator types one. */
  readonly testRecipient = input<string | null>(null);
  readonly secretProtectionAvailable = input(true);
  readonly changed = output<MailServer | null>();

  readonly securities = MAIL_SECURITY;
  readonly securityLabel = securityLabel;
  readonly statusLabel = testStatusLabel;
  readonly failureLabel = mailFailureLabel;
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly result = signal<MailTestResult | null>(null);
  form: ServerForm = this.empty();
  password = '';
  passwordUser = '';
  recipient = '';

  constructor() {
    effect(() => {
      const server = this.server();
      const require = this.requireCompanyServer();
      untracked(() => this.reset(server, require));
    });
  }

  save(): void {
    if (this.busy()) return;
    const port = Number(this.form.port);
    if (
      !this.form.host.trim() ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      !this.form.fromAddress.trim()
    ) {
      this.error.set(
        $localize`:@@mail.formIncomplete:Enter the host, a port from 1 to 65535 and the sender address.`,
      );
      return;
    }
    const text = (value: string) => value.trim() || null;
    this.call(
      this.adapter().save(
        {
          host: this.form.host.trim(),
          port,
          security: this.form.security,
          authenticate: this.form.authenticate,
          username: this.form.authenticate ? text(this.form.username) : null,
          fromName: text(this.form.fromName),
          fromAddress: this.form.fromAddress.trim(),
          replyToAddress: text(this.form.replyToAddress),
          requireCompanyServer: this.company() && this.form.requireCompanyServer,
        },
        this.server()?.version ?? null,
      ),
      $localize`:@@mail.saved:Settings saved. Test them before the server is used.`,
    );
  }

  replacePassword(): void {
    const server = this.server();
    if (!server || this.busy() || !this.password) return;
    const password = this.password;
    this.password = '';
    this.call(
      this.adapter().replaceCredentials(this.passwordUser.trim() || null, password, server.version),
      $localize`:@@mail.passwordSaved:Password replaced. It is stored encrypted and is never shown again.`,
    );
  }

  test(): void {
    const server = this.server();
    if (!server || this.busy()) return;
    const recipient = this.testRecipient() ?? this.recipient.trim();
    if (!recipient) {
      this.error.set(
        $localize`:@@mail.recipientNeeded:Enter the address the test message should go to.`,
      );
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    this.result.set(null);
    this.adapter()
      .test(server.version, recipient)
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          this.result.set(result);
          this.changed.emit(result.server);
        },
        error: (error: unknown) => this.fail(error),
      });
  }

  setEnabled(enabled: boolean): void {
    const server = this.server();
    if (!server || this.busy()) return;
    this.call(
      this.adapter().setEnabled(enabled, server.version),
      enabled
        ? $localize`:@@mail.enabledNotice:The server is now used for this email.`
        : $localize`:@@mail.disabledNotice:The server is switched off.`,
    );
  }

  private call(request: Observable<MailServer | null>, success: string): void {
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    this.result.set(null);
    request.subscribe({
      next: (server) => {
        this.busy.set(false);
        this.message.set(success);
        this.changed.emit(server);
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    this.error.set(
      error instanceof HttpErrorResponse &&
        error.status === 409 &&
        error.error?.code === 'concurrency.stale'
        ? $localize`:@@mail.stale:These settings were changed elsewhere. The latest version is shown; check it and try again.`
        : problemMessage(error, { plane: this.company() ? 'tenant' : 'platform' }),
    );
    if (
      error instanceof HttpErrorResponse &&
      error.status === 409 &&
      error.error?.code === 'concurrency.stale'
    )
      this.changed.emit(this.server());
  }

  private reset(server: MailServer | null, require: boolean): void {
    this.form = server
      ? {
          host: server.host,
          port: String(server.port),
          security: server.security,
          authenticate: server.authenticate,
          username: server.username ?? '',
          fromName: server.fromName ?? '',
          fromAddress: server.fromAddress,
          replyToAddress: server.replyToAddress ?? '',
          requireCompanyServer: require,
        }
      : { ...this.empty(), requireCompanyServer: require };
    this.passwordUser = server?.username ?? '';
  }

  private empty(): ServerForm {
    return {
      host: '',
      port: '587',
      security: 'StartTls',
      authenticate: true,
      username: '',
      fromName: '',
      fromAddress: '',
      replyToAddress: '',
      requireCompanyServer: false,
    };
  }
}
