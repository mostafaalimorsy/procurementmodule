import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { tenderTypeLabel } from '../../core/localization/labels';
import {
  TENDER_PERMISSIONS,
  TenderTemplate,
  TenderingApi,
  isStale,
  tenderProblemMessage,
} from './tendering.api';

/**
 * CF-084 (ADR-098): the company's tender templates. A template is saved from a tender (its content, optionally its
 * documents); every save adds an immutable version and a new draft records which version it came from. Here a
 * template is renamed, described, or switched off; versions are never edited.
 */
@Component({
  selector: 'app-tender-templates',
  imports: [RouterLink, BusinessDatePipe],
  styleUrl: './tendering.scss',
  template: `
    <section class="prj-page">
      <nav class="prj-crumbs" aria-label="Breadcrumb" i18n-aria-label="@@a11y.breadcrumb">
        <a routerLink="/tenders" i18n="@@nav.tenders">Tenders</a><span aria-hidden="true">/</span>
        <span i18n="@@tenderTemplates.crumb">Templates</span>
      </nav>
      <div class="prj-head">
        <div>
          <h1 i18n="@@tenderTemplates.title">Tender templates</h1>
          <p i18n="@@tenderTemplates.intro">
            Save a tender as a template from its page. A new tender can then start from the template
            on any work package with an approved shortlist. Each save is kept as a version; a draft
            records the version it came from.
          </p>
        </div>
      </div>
      @if (error()) {
        <p class="prj-note prj-note--error" role="alert">{{ error() }}</p>
      }
      @if (notice()) {
        <p class="prj-note" role="status">{{ notice() }}</p>
      }
      @if (loading()) {
        <p class="prj-note" i18n="@@tenderTemplates.loading">Loading templates…</p>
      } @else if (!templates().length) {
        <p class="prj-empty" i18n="@@tenderTemplates.empty">
          No templates yet. Open a tender and choose “Save as template”.
        </p>
      } @else {
        @for (template of templates(); track template.id) {
          <section class="prj-section" [attr.aria-labelledby]="'tpl-' + template.id">
            <div class="prj-section-head">
              <h2 [id]="'tpl-' + template.id">
                <bdi>{{ template.name }}</bdi>
                &ngsp;
                @if (!template.isActive) {
                  <span class="prj-chip" i18n="@@tenderTemplates.inactive">Not offered</span>
                }
              </h2>
            </div>
            @if (template.description) {
              <p>
                <bdi>{{ template.description }}</bdi>
              </p>
            }
            <div
              class="prj-table-wrap"
              role="region"
              [attr.aria-label]="template.name"
              tabindex="0"
            >
              <table class="prj-table">
                <thead>
                  <tr>
                    <th scope="col" i18n="@@tenderTemplates.version">Version</th>
                    <th scope="col" i18n="@@tenderTemplates.content">Content</th>
                    <th scope="col" i18n="@@tenderTemplates.savedBy">Saved</th>
                  </tr>
                </thead>
                <tbody>
                  @for (version of template.versions; track version.number) {
                    <tr>
                      <td>v{{ version.number }}</td>
                      <td>
                        {{ typeLabel(version.type) }} · <bdi>{{ version.title }}</bdi>
                        <br />
                        <span class="prj-hint" i18n="@@tenderTemplates.counts"
                          >{{ version.requiredDocuments }} required documents ·
                          {{ version.documents }} tender documents ·
                          {{ version.scheduleItems }} schedule items</span
                        >
                      </td>
                      <td>
                        {{ version.createdAtUtc | businessDate: 'instant' }} ·
                        <bdi>{{ version.createdByName }}</bdi>
                        @if (version.sourceTenderReference) {
                          · <bdi dir="ltr">{{ version.sourceTenderReference }}</bdi>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (canManage()) {
              <div class="prj-actions">
                <button
                  class="prj-btn prj-btn--ghost"
                  type="button"
                  [disabled]="busy()"
                  (click)="setActive(template, !template.isActive)"
                >
                  @if (template.isActive) {
                    <ng-container i18n="@@tenderTemplates.deactivate">Stop offering</ng-container>
                  } @else {
                    <ng-container i18n="@@tenderTemplates.activate">Offer again</ng-container>
                  }
                </button>
              </div>
            }
          </section>
        }
      }
    </section>
  `,
})
export class TenderTemplatesPage implements OnInit {
  private readonly api = inject(TenderingApi);
  private readonly session = inject(SessionService);

  readonly typeLabel = tenderTypeLabel;
  readonly templates = signal<readonly TenderTemplate[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');

  canManage(): boolean {
    return this.session.hasPermission(TENDER_PERMISSIONS.create);
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.templates().subscribe({
      next: (templates) => {
        this.templates.set(templates);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(tenderProblemMessage(error));
        this.loading.set(false);
      },
    });
  }

  setActive(template: TenderTemplate, isActive: boolean): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .updateTemplate(template.id, {
        name: template.name,
        description: template.description,
        isActive,
        version: template.version,
      })
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.templates.update((all) =>
            all.map((item) => (item.id === updated.id ? updated : item)),
          );
          this.notice.set($localize`:@@tenderTemplates.saved:Template updated.`);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          if (isStale(error)) this.load();
          this.error.set(tenderProblemMessage(error));
        },
      });
  }
}
