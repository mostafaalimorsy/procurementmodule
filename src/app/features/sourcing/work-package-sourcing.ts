import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NotInPlan } from '../../shared/ui/not-in-plan';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';
import {
  SOURCING_FEATURES,
  SOURCING_PERMISSIONS,
  SourcingApi,
  SourcingSummary,
  sourcingProblemMessage,
  sourcingStatusLabel,
} from './sourcing.api';

/**
 * The work package's sourcing at a glance: its state and a way in, or — for a live package — the way
 * to start it. Shown only to people who may see sourcing in a company that has bought it; the API
 * decides again on every call.
 */
@Component({
  selector: 'app-work-package-sourcing',
  imports: [RouterLink, NotInPlan],
  template: `
    @if (visible()) {
      <section class="prj-section" aria-labelledby="wp-sourcing-title">
        <div class="prj-section-head">
          <h2 id="wp-sourcing-title" i18n="@@nav.sourcing">Sourcing</h2>
        </div>
        @if (error()) {
          <p class="prj-note prj-note--error" role="alert">{{ error() }}</p>
        }
        @if (loading()) {
          <p class="prj-hint" i18n="@@sourcing.loadingOne">Loading sourcing…</p>
        } @else if (summary(); as item) {
          <p>
            <span class="prj-chip" [class.prj-chip--Active]="item.status === 'ShortlistApproved'">{{
              statusLabel(item.status)
            }}</span>
            &ngsp;
            <span class="prj-hint" i18n="@@sourcing.panelCounts"
              >Candidates: {{ item.candidateCount }} · Qualified: {{ item.qualifiedCount }} ·
              Shortlisted: {{ item.shortlistedCount }}</span
            >
          </p>
          <a
            class="prj-btn prj-btn--ghost"
            [routerLink]="['/sourcing', item.id]"
            i18n="@@sourcing.open"
            >Open sourcing</a
          >
        } @else if (packageStatus() === 'Active') {
          <p class="prj-hint" i18n="@@sourcing.panelStart">
            Consider subcontractors from your directory, prequalify them and approve a shortlist for
            tendering.
          </p>
          @if (canStart()) {
            <button class="prj-btn" type="button" [disabled]="starting()" (click)="start()">
              @if (starting()) {
                <ng-container i18n="@@common.working">Working…</ng-container>
              } @else {
                <ng-container i18n="@@sourcing.start">Start sourcing</ng-container>
              }
            </button>
          }
        } @else {
          <p class="prj-hint" i18n="@@sourcing.panelNotLive">
            Sourcing starts once the work package is active.
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
export class WorkPackageSourcing {
  private readonly api = inject(SourcingApi);
  private readonly session = inject(SessionService);
  private readonly entitlements = inject(EntitlementsService);
  private readonly router = inject(Router);

  readonly workPackageId = input.required<string>();
  readonly packageStatus = input.required<string>();
  readonly statusLabel = sourcingStatusLabel;
  readonly summary = signal<SourcingSummary | null>(null);
  readonly loading = signal(false);
  readonly starting = signal(false);
  readonly error = signal('');

  /** CF-105: a reader who could source here, on a plan without sourcing, is told so instead of seeing nothing. */
  notInPlan(): string | null {
    return this.session.hasPermission(SOURCING_PERMISSIONS.view)
      ? this.entitlements.missing(SOURCING_FEATURES)
      : null;
  }

  visible(): boolean {
    return (
      this.session.hasPermission(SOURCING_PERMISSIONS.view) &&
      SOURCING_FEATURES.every((feature) => this.entitlements.has(feature))
    );
  }

  canStart(): boolean {
    return this.session.hasPermission(SOURCING_PERMISSIONS.manage);
  }

  constructor() {
    // Loads when the package is known and the person may see sourcing, including when the session or
    // the plan arrives after the panel is shown.
    effect(() => {
      const id = this.workPackageId();
      if (this.visible()) untracked(() => this.load(id));
    });
  }

  private load(workPackageId: string): void {
    this.loading.set(true);
    this.error.set('');
    this.api.list({ workPackageId }).subscribe({
      next: (page) => {
        this.summary.set(page.items[0] ?? null);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(sourcingProblemMessage(error));
        this.loading.set(false);
      },
    });
  }

  start(): void {
    if (this.starting()) return;
    this.starting.set(true);
    this.error.set('');
    this.api.start(this.workPackageId(), []).subscribe({
      next: (sourcing) => void this.router.navigate(['/sourcing', sourcing.id]),
      error: (error: unknown) => {
        this.error.set(sourcingProblemMessage(error));
        this.starting.set(false);
        // Someone else started it first: show theirs instead of offering Start again.
        if (error instanceof HttpErrorResponse && error.error?.code === 'sourcing.already_started')
          this.load(this.workPackageId());
      },
    });
  }
}
