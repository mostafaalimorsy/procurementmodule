import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';
import { AWARD_FEATURES, DECISION_PERMISSIONS } from '../decision/decision.api';
import { EVALUATION_FEATURES, EVALUATION_PERMISSIONS } from '../evaluation/evaluation.api';
import { TENANT_PERMISSIONS } from '../identity/tenant-identity.api';
import { DIRECTORY_FEATURE, DIRECTORY_PERMISSIONS } from '../subcontractors/subcontractors.api';

interface Step {
  readonly key: string;
  readonly label: string;
  readonly hint: string;
  readonly link: string;
  readonly done: boolean;
  readonly optional?: boolean;
}

interface Candidate {
  readonly key: string;
  readonly permission: string;
  readonly features: readonly string[];
  readonly label: string;
  readonly hint: string;
  readonly link: string;
  readonly optional?: boolean;
  readonly check: () => Observable<boolean>;
}

/**
 * CF-013 (ADR-165): the company's first-run setup in order — each step read from what is already recorded, shown only to the people who
 * can do it, and only while something is left to do — so a missing policy is met here, not after bids are opened.
 */
@Component({
  selector: 'app-setup-checklist',
  imports: [RouterLink],
  template: `
    @if (visible()) {
      <section
        class="prj-card setup-checklist"
        aria-labelledby="setup-title"
        data-testid="setup-checklist"
      >
        <h2 id="setup-title" i18n="@@setup.title">Set up your company</h2>
        <p class="prj-hint" i18n="@@setup.progress">
          {{ doneCount() }} of {{ requiredCount() }} steps done. Each step is checked from what is
          already recorded.
        </p>
        <ol class="setup-steps">
          @for (step of steps(); track step.key) {
            <li [class.is-done]="step.done">
              <span class="setup-state" aria-hidden="true">{{ step.done ? '✓' : '○' }}</span>
              <span>
                <a [routerLink]="step.link">{{ step.label }}</a>
                @if (step.done) {
                  <span class="prj-visually-hidden" i18n="@@setup.doneState">done</span>
                }
                @if (step.optional) {
                  <span class="prj-hint setup-optional" i18n="@@setup.optional">(optional)</span>
                }
                <small class="prj-hint setup-hint">{{ step.hint }}</small>
              </span>
            </li>
          }
        </ol>
        <button
          type="button"
          class="prj-btn prj-btn--ghost setup-dismiss"
          (click)="dismiss()"
          i18n="@@setup.dismiss"
        >
          Hide these steps
        </button>
      </section>
    } @else if (dismissed() && mine().length > 0) {
      <!-- CF-013 AC4b: hidden by this person in this browser; one line brings the steps back. -->
      <p class="setup-restore" data-testid="setup-restore">
        <button type="button" class="setup-link" (click)="restore()" i18n="@@setup.restore">
          Show the setup steps
        </button>
      </p>
    }
  `,
  styles: `
    .setup-checklist {
      margin-block: 1.5rem;
    }

    .setup-steps {
      display: grid;
      gap: 0.6rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .setup-steps li {
      display: flex;
      gap: 0.6rem;
    }

    .setup-state {
      inline-size: 1.25rem;
      color: var(--color-accent);
      font-weight: 700;
    }

    .setup-steps a {
      color: var(--color-ink);
      font-weight: 600;
    }

    .is-done a {
      color: var(--color-muted);
      font-weight: 400;
    }

    .setup-optional {
      margin-inline-start: 0.35rem;
    }

    .setup-hint {
      display: block;
    }

    .setup-dismiss {
      margin-block-start: 1rem;
    }

    .setup-restore {
      margin-block: 1rem;
    }

    .setup-link {
      padding: 0.25rem 0;
      border: 0;
      background: none;
      color: var(--color-accent);
      font: inherit;
      text-decoration: underline;
      cursor: pointer;
    }
  `,
})
export class SetupChecklist {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  private readonly entitlements = inject(EntitlementsService);
  readonly steps = signal<readonly Step[]>([]);
  readonly requiredCount = computed(() => this.steps().filter((step) => !step.optional).length);
  readonly doneCount = computed(
    () => this.steps().filter((step) => !step.optional && step.done).length,
  );
  readonly visible = computed(
    () => !this.dismissed() && this.steps().some((step) => !step.optional && !step.done),
  );

  /**
   * CF-013 AC4b: "Hide these steps" is remembered per account in this browser (a hint, so per-browser storage is enough). Storage that
   * is unavailable or throws never hides the card on load; a hide then lasts for this page only.
   */
  private readonly dismissKey = computed(() => {
    const identity = this.session.identity();
    return identity ? `si.setup-dismissed:${identity.tenantId}:${identity.userId}` : null;
  });
  private readonly storageVersion = signal(0);
  private readonly hiddenHere = signal<string | null>(null);
  readonly dismissed = computed(() => {
    this.storageVersion();
    const key = this.dismissKey();
    if (!key) return false;
    if (this.hiddenHere() === key) return true;
    try {
      return globalThis.localStorage?.getItem(key) === '1';
    } catch {
      return false;
    }
  });

  dismiss(): void {
    const key = this.dismissKey();
    if (!key) return;
    this.hiddenHere.set(key);
    try {
      globalThis.localStorage?.setItem(key, '1');
    } catch {
      // Kept for this page only.
    }
    this.storageVersion.update((version) => version + 1);
  }

  restore(): void {
    const key = this.dismissKey();
    this.hiddenHere.set(null);
    try {
      if (key) globalThis.localStorage?.removeItem(key);
    } catch {
      // Nothing was stored.
    }
    this.storageVersion.update((version) => version + 1);
  }

  private readonly candidates: readonly Candidate[] = [
    {
      key: 'users',
      permission: TENANT_PERMISSIONS.usersInvite,
      features: [],
      label: $localize`:@@setup.users:Invite your team`,
      hint: $localize`:@@setup.usersHint:Give each person the role they need; a second Company Admin keeps access from depending on one person.`,
      link: '/admin/users',
      check: () =>
        this.http
          .get<{ status: string }[]>('/api/v1/admin/users')
          .pipe(map((users) => users.filter((user) => user.status !== 'Suspended').length >= 2)),
    },
    {
      key: 'trades',
      permission: DIRECTORY_PERMISSIONS.manageTrades,
      features: [DIRECTORY_FEATURE],
      label: $localize`:@@setup.trades:Set up your trade list`,
      hint: $localize`:@@setup.tradesHint:Work packages and firms are matched by trade.`,
      link: '/subcontractors/trades',
      check: () =>
        this.http
          .get<{ isActive: boolean }[]>('/api/v1/trades')
          .pipe(map((trades) => trades.some((trade) => trade.isActive))),
    },
    {
      key: 'subcontractors',
      permission: DIRECTORY_PERMISSIONS.create,
      features: [DIRECTORY_FEATURE],
      label: $localize`:@@setup.subcontractors:Add or import your subcontractors`,
      hint: $localize`:@@setup.subcontractorsHint:A spreadsheet import previews every row before anything is saved.`,
      link: '/subcontractors',
      check: () =>
        this.http
          .get<{ totalCount: number }>('/api/v1/subcontractors', {
            params: { page: 1, pageSize: 1 },
          })
          .pipe(map((page) => page.totalCount > 0)),
    },
    {
      key: 'scorecard',
      permission: EVALUATION_PERMISSIONS.managePolicy,
      features: EVALUATION_FEATURES,
      label: $localize`:@@setup.scorecard:Activate a scorecard policy`,
      hint: $localize`:@@setup.scorecardHint:Technical evaluators score against it once bids are opened; start from the example.`,
      link: '/evaluation-policies',
      check: () =>
        this.http
          .get<{ status: string }[]>('/api/v1/evaluation-policies')
          .pipe(map((policies) => policies.some((policy) => policy.status === 'Active'))),
    },
    {
      key: 'recommendation',
      permission: DECISION_PERMISSIONS.managePolicy,
      features: AWARD_FEATURES,
      label: $localize`:@@setup.recommendation:Activate a recommendation policy`,
      hint: $localize`:@@setup.recommendationHint:It weighs technical, commercial and past performance into an explainable ranking.`,
      link: '/recommendation-policies',
      check: () =>
        this.http
          .get<{ status: string }[]>('/api/v1/recommendation-policies')
          .pipe(map((policies) => policies.some((policy) => policy.status === 'Active'))),
    },
    {
      key: 'approvals',
      permission: DECISION_PERMISSIONS.manageMatrix,
      features: AWARD_FEATURES,
      label: $localize`:@@setup.approvals:Review the approval rules`,
      hint: $localize`:@@setup.approvalsHint:Without a rule, every decision needs one approval by an Approver / Director.`,
      link: '/approval-matrix',
      optional: true,
      check: () =>
        this.http
          .get<{ rules: unknown[] }>('/api/v1/approval-rules')
          .pipe(map((matrix) => matrix.rules.length > 0)),
    },
  ];

  /** The steps this person may do on this plan — re-read when the session or the plan arrives (a full page load renders first). */
  protected readonly mine = computed(
    () =>
      this.candidates.filter(
        (candidate) =>
          this.session.hasPermission(candidate.permission) &&
          candidate.features.every((feature) => this.entitlements.has(feature)),
      ),
    {
      equal: (a, b) =>
        a.length === b.length && a.every((candidate, index) => candidate === b[index]),
    },
  );

  constructor() {
    effect((onCleanup) => {
      const mine = this.mine();
      const dismissed = this.dismissed();
      untracked(() => this.steps.set([]));
      // Hidden: nothing is read until the steps are shown again.
      if (mine.length === 0 || dismissed) return;
      // A step that cannot be read (a transient failure) is left out rather than shown as undone.
      const subscription = forkJoin(
        mine.map((candidate) =>
          candidate.check().pipe(
            map((done) => ({ ...candidate, done }) as Step | null),
            catchError(() => of(null)),
          ),
        ),
      ).subscribe((steps) => this.steps.set(steps.filter((step): step is Step => step !== null)));
      onCleanup(() => subscription.unsubscribe());
    });
  }
}
