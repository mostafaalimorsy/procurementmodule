import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NotInPlan } from '../../shared/ui/not-in-plan';
import { Observable } from 'rxjs';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';
import {
  deadlineStateLabel,
  tenderLifecycleLabel,
  tenderStatusLabel,
} from '../../core/localization/labels';
import { LocaleService } from '../../core/localization/locale.service';
import { SourcingApi } from '../sourcing/sourcing.api';
import {
  TENDERING_FEATURES,
  TENDER_PERMISSIONS,
  TenderDetail,
  TenderSummary,
  TenderTemplate,
  TenderType,
  TenderingApi,
  tenderProblemMessage,
} from './tendering.api';

/**
 * The work package's tender at a glance, or — once its shortlist is approved — the way to create one. Shown to
 * people who may see tenders in a company that bought tendering; the API decides again on every call.
 */
@Component({
  selector: 'app-work-package-tender',
  imports: [RouterLink, NotInPlan],
  template: `
    @if (visible()) {
      <section class="prj-section" aria-labelledby="wp-tender-title">
        <div class="prj-section-head">
          <h2 id="wp-tender-title" i18n="@@nav.tenders">Tenders</h2>
        </div>
        @if (error()) {
          <p class="prj-note prj-note--error" role="alert">{{ error() }}</p>
        }
        @if (loading()) {
          <p class="prj-hint" i18n="@@tenders.loadingOne">Loading tender…</p>
        } @else if (live(); as tender) {
          <p>
            <a [routerLink]="['/tenders', tender.id]"
              ><bdi dir="ltr">{{ tender.reference }}</bdi></a
            >
            · <bdi>{{ tender.title }}</bdi> ·
            <span class="prj-chip">{{
              tender.lifecycle || tender.stage
                ? stepLabel(tender.lifecycle || tender.stage)
                : statusLabel(tender.status)
            }}</span>
            @if (tender.deadlineState && tender.stage === 'OpenForBids') {
              &ngsp;<span class="prj-chip">{{ deadlineLabel(tender.deadlineState) }}</span>
            }
          </p>
          <!-- CF-009: from the package to its award and closeout, for readers of each (the pages check again). -->
          @if (tender.awardId && (canSeeDecision() || canSeeCloseout())) {
            <p class="prj-actions">
              @if (canSeeDecision()) {
                <a
                  class="prj-btn prj-btn--ghost"
                  [routerLink]="['/tenders', tender.id, 'decision']"
                  [queryParams]="{ tab: 'award' }"
                  i18n="@@tenders.awardLink"
                  >Award</a
                >
              }
              @if (canSeeCloseout() && closeoutOpen(tender)) {
                <a
                  class="prj-btn prj-btn--ghost"
                  [routerLink]="['/closeouts', tender.awardId]"
                  i18n="@@tenders.closeoutLink"
                  >Closeout</a
                >
              }
            </p>
          }
        } @else if (shortlistApproved()) {
          <p class="prj-hint" i18n="@@tenders.panelStart">
            The shortlist is approved. Prepare an RFQ or RFP for the approved subcontractors.
          </p>
          @if (canCreate()) {
            <div class="prj-actions">
              @for (type of types; track type) {
                <button
                  class="prj-btn"
                  [class.prj-btn--ghost]="type === 'Rfp'"
                  type="button"
                  [disabled]="creating()"
                  (click)="create(type)"
                >
                  @if (type === 'Rfq') {
                    <ng-container i18n="@@tenders.createRfq">Create RFQ</ng-container>
                  } @else {
                    <ng-container i18n="@@tenders.createRfp">Create RFP</ng-container>
                  }
                </button>
              }
            </div>
            <details (toggle)="loadSources()">
              <summary i18n="@@tenders.startFromSummary">
                Start from a template or an earlier tender
              </summary>
              @if (sourcesLoaded()) {
                @if (templates().length) {
                  <div class="prj-field">
                    <label for="wp-tender-template" i18n="@@tenders.templateLabel">Template</label>
                    <select
                      id="wp-tender-template"
                      [value]="templateId()"
                      (change)="templateId.set(value($event))"
                    >
                      <option value="" i18n="@@tenders.templateChoose">Choose a template</option>
                      @for (template of templates(); track template.id) {
                        <option [value]="template.id">
                          {{ template.name }} · v{{ template.currentVersion }}
                        </option>
                      }
                    </select>
                  </div>
                  <button
                    class="prj-btn prj-btn--ghost"
                    type="button"
                    [disabled]="creating() || !templateId()"
                    (click)="fromTemplate()"
                    i18n="@@tenders.createFromTemplate"
                  >
                    Create from template
                  </button>
                } @else if (sourcesLoaded()) {
                  <p class="prj-hint" i18n="@@tenders.noTemplates">No active templates yet.</p>
                }
                <div class="prj-field">
                  <label for="wp-tender-copy" i18n="@@tenders.copyLabel">Earlier tender</label>
                  <select
                    id="wp-tender-copy"
                    [value]="copyId()"
                    (change)="copyId.set(value($event))"
                  >
                    <option value="" i18n="@@tenders.copyChoose">Choose a tender to copy</option>
                    @for (tender of earlier(); track tender.id) {
                      <option [value]="tender.id">
                        {{ tender.reference }} · {{ tender.title }}
                      </option>
                    }
                  </select>
                </div>
                <label>
                  <input
                    type="checkbox"
                    [checked]="includeDocuments()"
                    (change)="includeDocuments.set(checked($event))"
                  />
                  <span i18n="@@tenders.copyIncludeDocuments">Copy its tender documents too</span>
                </label>
                <p class="prj-hint" i18n="@@tenders.copyHint">
                  The copy takes the scope, instructions, pricing, terms and schedule. Invitations,
                  the deadline and anything firms sent are never copied.
                </p>
                <button
                  class="prj-btn prj-btn--ghost"
                  type="button"
                  [disabled]="creating() || !copyId()"
                  (click)="copy()"
                  i18n="@@tenders.copyCreate"
                >
                  Create a copy
                </button>
              }
            </details>
          }
        } @else {
          <p class="prj-hint" i18n="@@tenders.panelNeedsShortlist">
            A tender can be created once the shortlist of this work package is approved in Sourcing.
          </p>
        }
      </section>
    } @else if (notInPlan(); as feature) {
      <section class="prj-section">
        <app-not-in-plan [feature]="feature" />
      </section>
    }
  `,
})
export class WorkPackageTender {
  private readonly api = inject(TenderingApi);
  private readonly sourcing = inject(SourcingApi);
  private readonly session = inject(SessionService);
  private readonly entitlements = inject(EntitlementsService);
  private readonly router = inject(Router);
  private readonly locale = inject(LocaleService).locale;

  readonly workPackageId = input.required<string>();
  /** Whether Sourcing reports an approved shortlist in force for this work package. */
  readonly shortlistApproved = signal(false);
  readonly types: readonly TenderType[] = ['Rfq', 'Rfp'];
  readonly statusLabel = tenderStatusLabel;
  readonly stepLabel = tenderLifecycleLabel;
  readonly canSeeDecision = () =>
    this.entitlements.has('award') && this.session.hasPermission('Decision.View');
  readonly canSeeCloseout = () =>
    this.entitlements.has('performance') && this.session.hasPermission('Performance.View');
  /** A closeout can be opened once the award is accepted (or was issued before answers were recorded), and while it runs or is finalized. */
  closeoutOpen(tender: TenderSummary): boolean {
    return ['Awarded', 'CloseoutInProgress', 'CloseoutFinalized'].includes(tender.lifecycle ?? '');
  }
  readonly deadlineLabel = deadlineStateLabel;
  readonly live = signal<TenderSummary | null>(null);
  readonly loading = signal(false);
  readonly creating = signal(false);
  readonly error = signal('');
  readonly templates = signal<readonly TenderTemplate[]>([]);
  readonly earlier = signal<readonly TenderSummary[]>([]);
  readonly sourcesLoaded = signal(false);
  readonly templateId = signal('');
  readonly copyId = signal('');
  readonly includeDocuments = signal(true);

  /** CF-105: a reader who could tender here, on a plan without tendering, is told so instead of seeing nothing. */
  notInPlan(): string | null {
    return this.session.hasPermission(TENDER_PERMISSIONS.view)
      ? this.entitlements.missing(TENDERING_FEATURES)
      : null;
  }

  visible(): boolean {
    return (
      this.session.hasPermission(TENDER_PERMISSIONS.view) &&
      TENDERING_FEATURES.every((feature) => this.entitlements.has(feature))
    );
  }

  canCreate(): boolean {
    return this.session.hasPermission(TENDER_PERMISSIONS.create);
  }

  constructor() {
    effect(() => {
      const id = this.workPackageId();
      if (this.visible()) untracked(() => this.load(id));
    });
  }

  private load(workPackageId: string): void {
    this.loading.set(true);
    this.error.set('');
    this.sourcing.list({ workPackageId }).subscribe({
      next: (page) => this.shortlistApproved.set(page.items[0]?.status === 'ShortlistApproved'),
      error: () => this.shortlistApproved.set(false),
    });
    this.api.forWorkPackage(workPackageId).subscribe({
      next: (page) => {
        this.live.set(page.items.find((tender) => tender.status !== 'Cancelled') ?? null);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(tenderProblemMessage(error));
        this.loading.set(false);
      },
    });
  }

  /** CF-057 / CF-084: the active templates and the company's recent tenders, loaded when the section opens. */
  loadSources(): void {
    if (this.sourcesLoaded()) return;
    this.sourcesLoaded.set(true);
    this.api.templates().subscribe({
      next: (templates) => this.templates.set(templates.filter((template) => template.isActive)),
      error: (error: unknown) => this.error.set(tenderProblemMessage(error)),
    });
    this.api.list().subscribe({
      next: (page) =>
        this.earlier.set(
          page.items.filter((tender) => tender.workPackage.id !== this.workPackageId()),
        ),
      error: (error: unknown) => this.error.set(tenderProblemMessage(error)),
    });
  }

  value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  create(type: TenderType): void {
    this.start(this.api.create(this.workPackageId(), type, this.locale));
  }

  fromTemplate(): void {
    if (this.templateId())
      this.start(this.api.createFromTemplate(this.templateId(), this.workPackageId()));
  }

  copy(): void {
    if (this.copyId())
      this.start(this.api.clone(this.copyId(), this.workPackageId(), this.includeDocuments()));
  }

  private start(request: Observable<TenderDetail>): void {
    if (this.creating()) return;
    this.creating.set(true);
    this.error.set('');
    request.subscribe({
      next: (tender) => void this.router.navigate(['/tenders', tender.id]),
      error: (error: unknown) => {
        this.creating.set(false);
        this.error.set(tenderProblemMessage(error));
        this.load(this.workPackageId());
      },
    });
  }
}
