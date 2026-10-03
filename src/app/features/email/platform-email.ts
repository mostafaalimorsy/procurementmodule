import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { map } from 'rxjs';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { problemMessage } from '../../core/localization/product-problem';
import {
  EmailPreview,
  EmailTemplateDetail,
  EmailTemplateSummary,
  PlatformEmailApi,
  PlatformEmailSettings,
  languageLabel,
  templateLabel,
} from './email.api';
import { MailServerAdapter, MailServerPanel } from './mail-server-panel';

/**
 * The platform's default mail server and the controlled email templates (Platform Operator). A template is
 * plain text with allow-listed placeholders; every save is a new version, and each sent email records the
 * version it used, so history stays readable after edits.
 */
@Component({
  selector: 'app-platform-email',
  imports: [FormsModule, BusinessDatePipe, MailServerPanel],
  styleUrl: './email.scss',
  templateUrl: './platform-email.html',
})
export class PlatformEmailPage implements OnInit {
  private readonly api = inject(PlatformEmailApi);
  readonly templateLabel = templateLabel;
  readonly languageLabel = languageLabel;
  /** A placeholder as it is written in a template, e.g. {{TenderTitle}}. */
  readonly token = (name: string) => `{{${name}}}`;
  readonly settings = signal<PlatformEmailSettings | null>(null);
  readonly templates = signal<readonly EmailTemplateSummary[]>([]);
  readonly selected = signal<EmailTemplateDetail | null>(null);
  readonly preview = signal<EmailPreview | null>(null);
  readonly error = signal('');
  readonly templateError = signal('');
  readonly templateMessage = signal('');
  readonly busy = signal(false);
  subject = '';
  body = '';

  readonly adapter: MailServerAdapter = {
    save: (input, version) =>
      this.api.save(input, version).pipe(map((settings) => settings.server)),
    replaceCredentials: (username, password, version) =>
      this.api
        .replaceCredentials(username, password, version)
        .pipe(map((settings) => settings.server)),
    test: (version, recipient) => this.api.test(recipient, version),
    setEnabled: (enabled, version) =>
      this.api.setEnabled(enabled, version).pipe(map((settings) => settings.server)),
  };

  ngOnInit(): void {
    this.load();
    this.api.templates().subscribe({
      next: (templates) => this.templates.set(templates),
      error: (error: unknown) =>
        this.templateError.set(problemMessage(error, { plane: 'platform' })),
    });
  }

  load(): void {
    this.error.set('');
    this.api.server().subscribe({
      next: (settings) => this.settings.set(settings),
      error: (error: unknown) => this.error.set(problemMessage(error, { plane: 'platform' })),
    });
  }

  isSelected(template: EmailTemplateSummary): boolean {
    const current = this.selected();
    return !!current && current.key === template.key && current.locale === template.locale;
  }

  open(template: EmailTemplateSummary): void {
    this.templateError.set('');
    this.templateMessage.set('');
    this.preview.set(null);
    this.api.template(template.key, template.locale).subscribe({
      next: (detail) => this.show(detail),
      error: (error: unknown) =>
        this.templateError.set(problemMessage(error, { plane: 'platform' })),
    });
  }

  restoreBuiltIn(): void {
    const current = this.selected();
    if (!current) return;
    this.subject = current.builtInSubject;
    this.body = current.builtInBody;
    this.preview.set(null);
  }

  showPreview(): void {
    const current = this.selected();
    if (!current || this.busy()) return;
    this.templateError.set('');
    this.api.preview(current.key, current.locale, this.subject, this.body).subscribe({
      next: (preview) => this.preview.set(preview),
      error: (error: unknown) =>
        this.templateError.set(problemMessage(error, { plane: 'platform' })),
    });
  }

  save(): void {
    const current = this.selected();
    if (!current || this.busy()) return;
    this.busy.set(true);
    this.templateError.set('');
    this.templateMessage.set('');
    this.api
      .saveTemplate(current.key, current.locale, this.subject, this.body, current.currentVersion)
      .subscribe({
        next: (detail) => {
          this.busy.set(false);
          this.show(detail);
          this.templateMessage.set(
            $localize`:@@templates.saved:Saved as version ${detail.currentVersion}:version:. Emails sent from now on use it; earlier emails keep the version they used.`,
          );
          this.templates.update((list) =>
            list.map((item) =>
              item.key === detail.key && item.locale === detail.locale
                ? { ...item, currentVersion: detail.currentVersion }
                : item,
            ),
          );
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.templateError.set(
            error instanceof HttpErrorResponse &&
              error.status === 409 &&
              error.error?.code === 'concurrency.stale'
              ? $localize`:@@templates.stale:Someone saved a newer version of this template. Reopen it to see the latest text.`
              : problemMessage(error, { plane: 'platform' }),
          );
        },
      });
  }

  private show(detail: EmailTemplateDetail): void {
    this.selected.set(detail);
    this.subject = detail.subject;
    this.body = detail.body;
    this.preview.set(null);
  }
}
