import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import {
  TENDER_PERMISSIONS,
  TenderDetail,
  TenderTemplate,
  TenderingApi,
  tenderProblemMessage,
} from './tendering.api';

/**
 * CF-057 / CF-084 (ADR-098): where a tender came from (template version or earlier tender) and, for people who
 * may create tenders, saving its content as a new template or as the next version of an existing one.
 */
@Component({
  selector: 'app-tender-origin',
  imports: [FormsModule, RouterLink],
  template: `
    @if (tender().origin; as origin) {
      <p class="prj-hint">
        @if (origin.templateName) {
          <ng-container i18n="@@tenderOrigin.template"
            >Made from template <bdi>{{ origin.templateName }}</bdi
            >, version {{ origin.templateVersion }}.</ng-container
          >
        }
        @if (origin.clonedFromTenderId) {
          &ngsp;<ng-container i18n="@@tenderOrigin.copy"
            >Copied from
            <a [routerLink]="['/tenders', origin.clonedFromTenderId]"
              ><bdi dir="ltr">{{ origin.clonedFromReference }}</bdi></a
            >.</ng-container
          >
        }
      </p>
    }
    @if (canSave()) {
      <details (toggle)="loadTemplates()">
        <summary i18n="@@tenderOrigin.saveSummary">Save as template</summary>
        @if (error()) {
          <p class="prj-note prj-note--error" role="alert">{{ error() }}</p>
        }
        <form class="prj-form" (ngSubmit)="save()">
          <div class="prj-field">
            <label for="tpl-target" i18n="@@tenderOrigin.target">Save to</label>
            <select id="tpl-target" name="target" [(ngModel)]="target">
              <option value="" i18n="@@tenderOrigin.newTemplate">A new template</option>
              @for (template of templates(); track template.id) {
                <option [value]="template.id" i18n="@@tenderOrigin.nextVersion">
                  {{ template.name }} — new version {{ template.currentVersion + 1 }}
                </option>
              }
            </select>
          </div>
          @if (!target) {
            <div class="prj-field">
              <label for="tpl-name" i18n="@@tenderOrigin.name">Template name</label>
              <input id="tpl-name" name="name" maxlength="120" [(ngModel)]="name" required />
            </div>
            <div class="prj-field">
              <label for="tpl-description" i18n="@@tenderOrigin.description"
                >Description (optional)</label
              >
              <input
                id="tpl-description"
                name="description"
                maxlength="1000"
                [(ngModel)]="description"
              />
            </div>
          }
          <label>
            <input type="checkbox" name="includeDocuments" [(ngModel)]="includeDocuments" />
            <ng-container i18n="@@tenderOrigin.includeDocuments"
              >Keep the tender documents in the template</ng-container
            >
          </label>
          <p class="prj-hint" i18n="@@tenderOrigin.hint">
            The template keeps the scope, instructions, required documents, pricing, terms and
            schedule. Invitees, dates and anything firms sent are never saved.
          </p>
          <div class="prj-form-actions">
            <button
              class="prj-btn"
              type="submit"
              [disabled]="busy() || (!target && !name.trim())"
              i18n="@@tenderOrigin.save"
            >
              Save template
            </button>
          </div>
        </form>
      </details>
    }
  `,
})
export class TenderOrigin {
  private readonly api = inject(TenderingApi);
  private readonly session = inject(SessionService);

  readonly tender = input.required<TenderDetail>();
  readonly announce = output<string>();
  readonly templates = signal<readonly TenderTemplate[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  private loaded = false;
  target = '';
  name = '';
  description = '';
  includeDocuments = true;

  canSave(): boolean {
    return this.session.hasPermission(TENDER_PERMISSIONS.create);
  }

  loadTemplates(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.api.templates().subscribe({
      next: (templates) => this.templates.set(templates),
      error: (error: unknown) => this.error.set(tenderProblemMessage(error)),
    });
  }

  save(): void {
    if (this.busy()) return;
    const existing = this.templates().find((template) => template.id === this.target);
    this.busy.set(true);
    this.error.set('');
    this.api
      .saveTemplate({
        tenderId: this.tender().id,
        name: existing ? null : this.name.trim(),
        description: existing ? null : this.description.trim() || null,
        includeDocuments: this.includeDocuments,
        ...(existing ? { templateId: existing.id, version: existing.version } : {}),
      })
      .subscribe({
        next: (saved) => {
          this.busy.set(false);
          this.templates.update((all) => [saved, ...all.filter((item) => item.id !== saved.id)]);
          this.target = '';
          this.name = '';
          this.description = '';
          this.announce.emit(
            $localize`:@@tenderOrigin.saved:Saved as template ${saved.name}:name:, version ${saved.currentVersion}:version:.`,
          );
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(tenderProblemMessage(error));
        },
      });
  }
}
