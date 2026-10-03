import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { LocaleService } from '../../core/localization/locale.service';
import { parseMoney } from '../../core/localization/money';
import { requestKey } from '../../shared/util/request-key';
import { money } from '../evaluation/evaluation-format';
import { DirectoryApi, SubcontractorSummary, TradeRef } from '../subcontractors/subcontractors.api';
import {
  NOTE_MAX,
  OUTCOME_TYPES,
  RATINGS,
  REASON_MIN,
  REHIRE_CHOICES,
  VARIATION_CAUSES,
  performanceProblemMessage,
} from './performance.api';
import {
  missingLabel,
  outcomeTypeLabel,
  rehireLabel,
  retrospectiveBadge,
  retrospectiveEventLabel,
  retrospectiveStatusLabel,
  signedPercent,
  variationCauseLabel,
} from './performance-labels';
import {
  RetrospectiveApi,
  RetrospectiveCommercialDraft,
  RetrospectiveExecutionDraft,
  RetrospectiveOutcome,
  retrospectiveCommercialDraft,
  retrospectiveExecutionDraft,
} from './retrospective.api';

/**
 * CF-002 (ADR-126): one retrospective outcome — recorded from documents by its section owners (Commercial/QS the money, the Project Manager
 * the dates, ratings and how it ended), then confirmed by procurement leadership who recorded none of it, attesting that it transcribes its
 * source. A correction needs a reason and appends a version. "new" opens the form that creates one.
 */
@Component({
  selector: 'app-retrospective-page',
  imports: [FormsModule, RouterLink, BusinessDatePipe],
  template: `
    <section class="prj-page" aria-labelledby="retro-page-title">
      <p>
        <a routerLink="/retrospective-outcomes" i18n="@@retrospective.back">All past outcomes</a>
      </p>
      <p class="prj-chip dc-state dc-state--muted" data-testid="retro-badge">{{ badge }}</p>
      @if (error()) {
        <p id="retro-error" class="prj-note prj-note--error" role="alert" tabindex="-1">
          {{ error() }}
        </p>
      }
      @if (creating()) {
        <h1 id="retro-page-title" i18n="@@retrospective.newTitle">Record a past outcome</h1>
        <form class="prj-section prj-form" (ngSubmit)="create()">
          <div class="prj-field">
            <label for="retro-firm-search" i18n="@@retrospective.firmSearch"
              >Subcontractor (search by code or name)</label
            >
            <input
              id="retro-firm-search"
              name="firmSearch"
              type="search"
              [(ngModel)]="firmSearch"
              (ngModelChange)="findFirms()"
            />
            @if (firms().length > 0) {
              <select
                id="retro-firm"
                name="firm"
                [(ngModel)]="firmId"
                aria-labelledby="retro-firm-search"
              >
                <option value="" i18n="@@retrospective.chooseFirm">Choose…</option>
                @for (firm of firms(); track firm.id) {
                  <option [value]="firm.id">{{ firm.code }} — {{ firm.legalName }}</option>
                }
              </select>
            }
          </div>
          <div class="prj-field">
            <label for="retro-trade" i18n="@@retrospective.trade"
              >Trade (the history category)</label
            >
            <select id="retro-trade" name="trade" [(ngModel)]="tradeId">
              <option value="" i18n="@@retrospective.chooseTrade">Choose…</option>
              @for (trade of trades(); track trade.id) {
                <option [value]="trade.id">{{ trade.name }}</option>
              }
            </select>
          </div>
          <div class="prj-grid">
            <div class="prj-field">
              <label for="retro-project" i18n="@@retrospective.project">Project</label>
              <input id="retro-project" name="project" [(ngModel)]="projectLabel" maxlength="200" />
            </div>
            <div class="prj-field">
              <label for="retro-package" i18n="@@retrospective.package">Work package</label>
              <input id="retro-package" name="package" [(ngModel)]="packageLabel" maxlength="200" />
            </div>
            <div class="prj-field">
              <label for="retro-currency" i18n="@@retrospective.currency"
                >Currency (ISO code)</label
              >
              <input
                id="retro-currency"
                name="currency"
                dir="ltr"
                maxlength="3"
                [(ngModel)]="currency"
              />
            </div>
          </div>
          <div class="prj-field">
            <label for="retro-source" i18n="@@retrospective.source"
              >Source document (final account, completion certificate — reference or
              description)</label
            >
            <textarea
              id="retro-source"
              name="source"
              rows="2"
              maxlength="500"
              [(ngModel)]="sourceReference"
            ></textarea>
          </div>
          <button class="prj-btn" type="submit" [disabled]="busy()" i18n="@@retrospective.create">
            Create the record
          </button>
        </form>
      } @else if (record(); as view) {
        <h1 id="retro-page-title">
          <bdi dir="ltr" class="tnd-code">{{ view.subcontractorCode }}</bdi>
          <bdi>{{ view.subcontractorName }}</bdi>
        </h1>
        <p>
          <span class="prj-chip">{{ statusLabel(view.status) }}</span>
          @if (view.imported) {
            <span class="prj-chip" i18n="@@retrospective.imported">Imported</span>
          }
        </p>
        <dl class="dc-facts">
          <div>
            <dt i18n="@@retrospective.project">Project</dt>
            <dd>
              <bdi>{{ view.projectLabel }}</bdi>
            </dd>
          </div>
          <div>
            <dt i18n="@@retrospective.package">Work package</dt>
            <dd>
              <bdi>{{ view.packageLabel }}</bdi>
            </dd>
          </div>
          <div>
            <dt i18n="@@retrospective.trade">Trade (the history category)</dt>
            <dd>
              <bdi>{{ view.category }}</bdi>
            </dd>
          </div>
          <div>
            <dt i18n="@@retrospective.sourceShort">Source</dt>
            <dd>
              <bdi>{{ view.sourceReference }}</bdi>
            </dd>
          </div>
          <div>
            <dt i18n="@@retrospective.recordedBy">Recorded</dt>
            <dd>
              <bdi>{{ view.createdByName }}</bdi> ·
              <bdi>{{ view.recordedAtUtc | businessDate: 'instant' }}</bdi>
            </dd>
          </div>
          @if (view.confirmedByName) {
            <div>
              <dt i18n="@@retrospective.confirmedBy">Confirmed</dt>
              <dd>
                <bdi>{{ view.confirmedByName }}</bdi> ·
                <bdi>{{ view.confirmedAtUtc | businessDate: 'instant' }}</bdi>
              </dd>
            </div>
          }
        </dl>

        <form
          class="prj-section prj-form"
          (ngSubmit)="saveCommercial()"
          aria-labelledby="retro-commercial-title"
        >
          <h2 id="retro-commercial-title" i18n="@@retrospective.commercialTitle">
            Commercial (Commercial/QS)
          </h2>
          @if (!view.commercialVisible) {
            <p class="prj-hint" i18n="@@retrospective.commercialHidden">
              The amounts are visible to commercial roles.
            </p>
          }
          <fieldset class="pf-fieldset" [disabled]="!view.access.editCommercial || busy()">
            <div class="prj-grid">
              <div class="prj-field">
                <label for="retro-award" i18n="@@retrospective.awardValue"
                  >Awarded value (<bdi dir="ltr">{{ view.currency }}</bdi
                  >)</label
                >
                <input
                  id="retro-award"
                  name="awardValue"
                  dir="ltr"
                  inputmode="decimal"
                  [(ngModel)]="commercial.awardValue"
                />
              </div>
              <div class="prj-field">
                <label for="retro-final" i18n="@@retrospective.finalCost"
                  >Final cost (<bdi dir="ltr">{{ view.currency }}</bdi
                  >)</label
                >
                <input
                  id="retro-final"
                  name="finalCost"
                  dir="ltr"
                  inputmode="decimal"
                  [(ngModel)]="commercial.actualFinalCost"
                />
              </div>
              <div class="prj-field">
                <label for="retro-variation" i18n="@@retrospective.variationValue"
                  >Variations value (optional)</label
                >
                <input
                  id="retro-variation"
                  name="variationValue"
                  dir="ltr"
                  inputmode="decimal"
                  [(ngModel)]="commercial.variationValue"
                />
              </div>
              <div class="prj-field">
                <label for="retro-cause" i18n="@@retrospective.variationCause"
                  >Main variation cause (optional)</label
                >
                <select
                  id="retro-cause"
                  name="variationCause"
                  [(ngModel)]="commercial.variationCause"
                >
                  <option value="" i18n="@@retrospective.none">—</option>
                  @for (cause of causes; track cause) {
                    <option [value]="cause">{{ causeLabel(cause) }}</option>
                  }
                </select>
              </div>
            </div>
            @if (moneyError()) {
              <p class="prj-error-text" role="alert">{{ moneyError() }}</p>
            }
            @if (view.access.editCommercial) {
              <button class="prj-btn" type="submit" i18n="@@retrospective.saveCommercial">
                Save the commercial section
              </button>
            }
          </fieldset>
        </form>

        <form
          class="prj-section prj-form"
          (ngSubmit)="saveExecution()"
          aria-labelledby="retro-execution-title"
        >
          <h2 id="retro-execution-title" i18n="@@retrospective.executionTitle">
            Execution (Project Manager)
          </h2>
          <fieldset class="pf-fieldset" [disabled]="!view.access.editExecution || busy()">
            <div class="prj-grid">
              <div class="prj-field">
                <label for="retro-outcome" i18n="@@closeout.outcomeType"
                  >How did the subcontract end?</label
                >
                <select id="retro-outcome" name="outcomeType" [(ngModel)]="execution.outcomeType">
                  <option value="" i18n="@@closeout.outcomeChoose">Choose…</option>
                  @for (option of outcomeTypes; track option) {
                    <option [value]="option">{{ outcomeLabel(option) }}</option>
                  }
                </select>
              </div>
              @if (execution.outcomeType && execution.outcomeType !== 'Completed') {
                <div class="prj-field">
                  <label for="retro-percent" i18n="@@closeout.percentComplete"
                    >Share of the work completed by the subcontractor, % (optional)</label
                  >
                  <input
                    id="retro-percent"
                    name="percentComplete"
                    type="number"
                    min="0"
                    max="100"
                    dir="ltr"
                    [(ngModel)]="execution.percentComplete"
                  />
                </div>
              }
              <div class="prj-field">
                <label for="retro-duration" i18n="@@retrospective.duration"
                  >Awarded duration, days (optional)</label
                >
                <input
                  id="retro-duration"
                  name="duration"
                  type="number"
                  min="1"
                  dir="ltr"
                  [(ngModel)]="execution.plannedDurationDays"
                />
              </div>
              <div class="prj-field">
                <label for="retro-start" i18n="@@closeout.actualStart">Actual start date</label>
                <input
                  id="retro-start"
                  name="start"
                  type="date"
                  [(ngModel)]="execution.actualStartDate"
                />
              </div>
              <div class="prj-field">
                <label for="retro-completion" i18n="@@retrospective.completion"
                  >Actual completion or end date</label
                >
                <input
                  id="retro-completion"
                  name="completion"
                  type="date"
                  [(ngModel)]="execution.actualCompletionDate"
                />
              </div>
              <div class="prj-field">
                <label for="retro-quality" i18n="@@closeout.qualityRating">Quality</label>
                <select id="retro-quality" name="quality" [(ngModel)]="execution.qualityRating">
                  <option [ngValue]="null" i18n="@@retrospective.none">—</option>
                  @for (rating of ratings; track rating) {
                    <option [ngValue]="rating">{{ rating }}</option>
                  }
                </select>
              </div>
              <div class="prj-field">
                <label for="retro-hse" i18n="@@closeout.hseRating">HSE / safety</label>
                <select id="retro-hse" name="hse" [(ngModel)]="execution.hseRating">
                  <option [ngValue]="null" i18n="@@retrospective.none">—</option>
                  @for (rating of ratings; track rating) {
                    <option [ngValue]="rating">{{ rating }}</option>
                  }
                </select>
              </div>
              <div class="prj-field">
                <label for="retro-rehire" i18n="@@closeout.rehireShort">Would work again</label>
                <select id="retro-rehire" name="rehire" [(ngModel)]="execution.wouldWorkAgain">
                  <option value="" i18n="@@retrospective.none">—</option>
                  @for (choice of rehireChoices; track choice) {
                    <option [value]="choice">{{ rehireLabel(choice) }}</option>
                  }
                </select>
              </div>
            </div>
            @if (execution.wouldWorkAgain && execution.wouldWorkAgain !== 'Yes') {
              <div class="prj-field">
                <label for="retro-rationale" i18n="@@retrospective.rationale"
                  >Why not an unconditional yes? (required)</label
                >
                <textarea
                  id="retro-rationale"
                  name="rationale"
                  rows="2"
                  [maxlength]="noteMax"
                  [(ngModel)]="execution.wouldWorkAgainRationale"
                ></textarea>
              </div>
            }
            @if (view.access.editExecution) {
              <button class="prj-btn" type="submit" i18n="@@retrospective.saveExecution">
                Save the execution section
              </button>
            }
          </fieldset>
        </form>

        <section class="prj-section" aria-labelledby="retro-confirm-title">
          <h2 id="retro-confirm-title" i18n="@@retrospective.confirmTitle">Confirmation</h2>
          @if (view.completeness.missing.length > 0) {
            <p class="prj-hint" i18n="@@retrospective.missing">Still missing:</p>
            <ul>
              @for (key of view.completeness.missing; track key) {
                <li>{{ missingLabel(key) }}</li>
              }
            </ul>
          }
          @if (view.access.confirm) {
            <label class="tnd-choice tnd-close-confirm">
              <input id="retro-attest" type="checkbox" name="attested" [(ngModel)]="attested" />
              <span i18n="@@retrospective.attest"
                >I recorded none of this and it transcribes its source documents.</span
              >
            </label>
            <button
              class="prj-btn"
              type="button"
              [disabled]="!attested || busy()"
              (click)="confirm()"
              i18n="@@retrospective.confirm"
            >
              Confirm the past outcome
            </button>
          } @else if (view.status !== 'Confirmed') {
            <p class="prj-hint" i18n="@@retrospective.confirmOwner">
              Procurement leadership who recorded none of it confirms the past outcome once every
              item is recorded.
            </p>
          }
          @if (view.access.correct) {
            <div class="prj-field">
              <label for="retro-reason" i18n="@@retrospective.correctReason"
                >Why does it need a correction? (required)</label
              >
              <textarea id="retro-reason" name="reason" rows="2" [(ngModel)]="reason"></textarea>
            </div>
            <button
              class="prj-btn prj-btn--ghost"
              type="button"
              [disabled]="reason.trim().length < reasonMin || busy()"
              (click)="correct()"
              i18n="@@retrospective.correct"
            >
              Open for correction
            </button>
          }
        </section>

        @if (view.versions.length > 0) {
          <section class="prj-section" aria-labelledby="retro-versions-title">
            <h2 id="retro-versions-title" i18n="@@retrospective.versionsTitle">
              Confirmed versions
            </h2>
            <ol class="prj-cards" reversed>
              @for (version of view.versions; track version.number) {
                <li class="prj-card">
                  <h3>
                    <span i18n="@@closeout.versionNumber"
                      >Version <bdi dir="ltr">{{ version.number }}</bdi></span
                    >
                    @if (version.authoritative) {
                      <span class="prj-chip dc-state dc-state--good" i18n="@@retrospective.current"
                        >Current</span
                      >
                    }
                  </h3>
                  <p class="prj-hint">
                    {{ outcomeLabel(version.outcomeType) }} ·
                    <span i18n="@@retrospective.costShort"
                      >cost <bdi dir="ltr">{{ percent(version.costVariancePercent) }}</bdi></span
                    >
                    ·
                    <span i18n="@@retrospective.ratingsShort"
                      >quality <bdi dir="ltr">{{ version.qualityRating }}</bdi> · HSE
                      <bdi dir="ltr">{{ version.hseRating }}</bdi></span
                    >
                    · {{ rehireLabel(version.wouldWorkAgain) }}
                  </p>
                  <p class="prj-hint">
                    <span i18n="@@retrospective.versionBy"
                      >Confirmed by <bdi>{{ version.confirmedByName }}</bdi> on
                      <bdi>{{ version.confirmedAtUtc | businessDate: 'instant' }}</bdi></span
                    >
                    @if (version.correctionReason) {
                      ·
                      <span i18n="@@retrospective.versionReason"
                        >Correction: <bdi>{{ version.correctionReason }}</bdi></span
                      >
                    }
                  </p>
                  @if (version.fingerprintVerified) {
                    <span class="dc-state dc-state--good" i18n="@@closeout.fingerprintOk"
                      >Verified</span
                    >
                  } @else {
                    <span class="dc-state dc-state--warn" i18n="@@closeout.fingerprintBad"
                      >Does not match — contact support</span
                    >
                  }
                </li>
              }
            </ol>
          </section>
        }
        <section class="prj-section" aria-labelledby="retro-events-title">
          <h2 id="retro-events-title" i18n="@@closeout.eventsTitle">Lifecycle</h2>
          <ul>
            @for (event of view.events; track $index) {
              <li>
                {{ eventLabel(event.kind, event.versionNumber) }} ·
                <bdi>{{ event.actorName }}</bdi> ·
                <bdi>{{ event.atUtc | businessDate: 'instant' }}</bdi>
                @if (event.reason) {
                  · <bdi>{{ event.reason }}</bdi>
                }
              </li>
            }
          </ul>
        </section>
      } @else if (!error()) {
        <p class="prj-hint" i18n="@@retrospective.loadingOne">Loading the past outcome…</p>
      }
    </section>
  `,
})
export class RetrospectivePage implements OnInit {
  private readonly api = inject(RetrospectiveApi);
  private readonly directory = inject(DirectoryApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly locale = inject(LocaleService).locale;
  readonly badge = retrospectiveBadge();
  readonly statusLabel = retrospectiveStatusLabel;
  readonly eventLabel = retrospectiveEventLabel;
  readonly outcomeLabel = outcomeTypeLabel;
  readonly causeLabel = variationCauseLabel;
  readonly rehireLabel = rehireLabel;
  readonly missingLabel = missingLabel;
  readonly percent = signedPercent;
  readonly outcomeTypes = OUTCOME_TYPES;
  readonly causes = VARIATION_CAUSES;
  readonly ratings = RATINGS;
  readonly rehireChoices = REHIRE_CHOICES;
  readonly noteMax = NOTE_MAX;
  readonly reasonMin = REASON_MIN;
  readonly creating = signal(false);
  readonly record = signal<RetrospectiveOutcome | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly moneyError = signal('');
  readonly firms = signal<readonly SubcontractorSummary[]>([]);
  readonly trades = signal<readonly TradeRef[]>([]);
  firmSearch = '';
  firmId = '';
  tradeId = '';
  projectLabel = '';
  packageLabel = '';
  currency = '';
  sourceReference = '';
  attested = false;
  reason = '';
  commercial: RetrospectiveCommercialDraft = retrospectiveCommercialDraft({
    awardValue: null,
    actualFinalCost: null,
    variationValue: null,
    variationCause: null,
    sectionVersion: null,
    updatedAtUtc: null,
    updatedByName: null,
  });
  execution: RetrospectiveExecutionDraft = retrospectiveExecutionDraft({
    plannedDurationDays: null,
    actualStartDate: null,
    actualCompletionDate: null,
    qualityRating: null,
    hseRating: null,
    wouldWorkAgain: null,
    wouldWorkAgainRationale: null,
    outcomeType: null,
    percentComplete: null,
    sectionVersion: null,
    updatedAtUtc: null,
    updatedByName: null,
  });
  /** Kept across a retry of the same create or confirm, so a lost response never acts twice. */
  private actionKey = requestKey();

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    if (id === 'new') {
      this.creating.set(true);
      this.directory.trades().subscribe({
        next: (trades) => this.trades.set(trades.filter((trade) => trade.isActive)),
        error: (error: unknown) => this.error.set(performanceProblemMessage(error)),
      });
      return;
    }
    this.load(id);
  }

  findFirms(): void {
    const search = this.firmSearch.trim();
    if (search.length < 2) {
      this.firms.set([]);
      return;
    }
    this.directory.list({ search, pageSize: 20 }).subscribe({
      next: (page) => this.firms.set(page.items),
      error: () => this.firms.set([]),
    });
  }

  create(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .create({
        subcontractorId: this.firmId,
        tradeId: this.tradeId,
        projectLabel: this.projectLabel,
        packageLabel: this.packageLabel,
        currency: this.currency.trim().toUpperCase(),
        sourceReference: this.sourceReference,
        requestKey: this.actionKey,
      })
      .subscribe({
        next: (created) => {
          this.busy.set(false);
          void this.router.navigate(['/retrospective-outcomes', created.id]);
        },
        error: (error: unknown) => this.fail(error),
      });
  }

  saveCommercial(): void {
    const view = this.record();
    if (!view || this.busy()) return;
    const draft = { ...this.commercial };
    for (const field of ['awardValue', 'actualFinalCost', 'variationValue'] as const) {
      const parsed = parseMoney(draft[field], 3, field !== 'awardValue');
      if (parsed.problem) {
        this.moneyError.set(
          $localize`:@@retrospective.moneyInvalid:Enter amounts as plain numbers with a point for decimals, for example 1250000.50.`,
        );
        return;
      }
      draft[field] = parsed.value ?? '';
    }
    this.moneyError.set('');
    this.act(this.api.saveCommercial(view.id, view.commercial.sectionVersion, draft));
  }

  saveExecution(): void {
    const view = this.record();
    if (!view || this.busy()) return;
    this.act(this.api.saveExecution(view.id, view.execution.sectionVersion, { ...this.execution }));
  }

  confirm(): void {
    const view = this.record();
    if (!view || !this.attested || this.busy()) return;
    this.act(this.api.confirm(view.id, view.version, this.actionKey), true);
  }

  correct(): void {
    const view = this.record();
    if (!view || this.busy()) return;
    this.act(this.api.correct(view.id, view.version, this.reason.trim(), this.actionKey), true);
  }

  private act(request: ReturnType<RetrospectiveApi['get']>, keyed = false): void {
    this.busy.set(true);
    this.error.set('');
    request.subscribe({
      next: (updated) => {
        this.busy.set(false);
        if (keyed) {
          this.actionKey = requestKey();
          this.attested = false;
          this.reason = '';
        }
        this.apply(updated);
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  private load(id: string): void {
    this.api.get(id).subscribe({
      next: (view) => this.apply(view),
      error: (error: unknown) => this.error.set(performanceProblemMessage(error)),
    });
  }

  private apply(view: RetrospectiveOutcome): void {
    this.record.set(view);
    this.commercial = retrospectiveCommercialDraft(view.commercial);
    this.execution = retrospectiveExecutionDraft(view.execution);
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    this.error.set(performanceProblemMessage(error));
    // A stale save means a colleague changed it: show the current state with the explanation.
    if (error instanceof HttpErrorResponse && error.status === 409 && this.record())
      this.load(this.record()!.id);
  }

  money(amount: string | null): string {
    return money(amount, this.locale);
  }
}
