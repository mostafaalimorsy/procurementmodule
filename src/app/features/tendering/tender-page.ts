import { DOCUMENT } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  deadlineStateLabel,
  tenderLifecycleLabel,
  tenderStatusLabel,
  tenderTypeLabel,
} from '../../core/localization/labels';
import { TenderBuilder } from './tender-builder';
import { TenderControl } from './tender-control';
import { TenderOrigin } from './tender-origin';
import { TenderDetail, TenderingApi, tenderProblemMessage } from './tendering.api';
import { TenderStageHeader } from './tender-stage-header';

/**
 * One tender. A draft opens in the builder; a published or cancelled tender opens in the Tender Control
 * Center. Both work on the same server-returned tender, so the page always shows what the server decided.
 */
@Component({
  selector: 'app-tender-page',
  imports: [TenderStageHeader, RouterLink, TenderBuilder, TenderControl, TenderOrigin],
  styleUrl: './tendering.scss',
  template: `
    <section class="prj-page">
      <nav class="prj-crumbs" aria-label="Breadcrumb" i18n-aria-label="@@a11y.breadcrumb">
        <a routerLink="/tenders" i18n="@@nav.tenders">Tenders</a><span aria-hidden="true">/</span>
        <span>
          @if (tender(); as item) {
            <bdi dir="ltr">{{ item.reference }}</bdi>
          } @else {
            <ng-container i18n="@@tenders.crumb">Tender</ng-container>
          }
        </span>
      </nav>

      @if (error()) {
        <p class="prj-note prj-note--error" role="alert">
          {{ error() }}
          <button
            class="prj-btn prj-btn--ghost"
            type="button"
            (click)="load()"
            i18n="@@common.reload"
          >
            Reload
          </button>
        </p>
      }
      @if (notice()) {
        <p id="tender-notice" class="prj-note" role="status" tabindex="-1">{{ notice() }}</p>
      }

      @if (loading()) {
        <p class="prj-note" i18n="@@tenders.loadingOne">Loading tender…</p>
      } @else if (tender(); as item) {
        <div class="prj-head">
          <div>
            <p class="prj-eyebrow">
              <bdi dir="ltr">{{ item.reference }}</bdi> · {{ typeLabel(item.type) }}
            </p>
            <h1>
              <bdi>{{ item.title }}</bdi>
            </h1>
            <p class="tnd-meta">
              <!-- CF-009: where the tender is (its stage), never the stored "Published". -->
              <span class="prj-chip tnd-status tnd-status--{{ item.status }}">{{
                item.stage ? stepLabel(item.stage) : statusLabel(item.status)
              }}</span>
              @if (item.deadlineState && item.stage === 'OpenForBids') {
                &ngsp;<span class="prj-chip tnd-deadline tnd-deadline--{{ item.deadlineState }}">{{
                  deadlineLabel(item.deadlineState)
                }}</span>
              }
              &ngsp;
              <span class="prj-hint">
                <a [routerLink]="['/work-packages', item.workPackage.id]"
                  ><bdi dir="ltr">{{ item.workPackage.code }}</bdi> ·
                  <bdi>{{ item.workPackage.title }}</bdi></a
                >
                ·
                <a [routerLink]="['/projects', item.workPackage.projectId]"
                  ><bdi>{{ item.workPackage.projectName }}</bdi></a
                >
              </span>
            </p>
            <app-tender-origin [tender]="item" (announce)="announce($event)" />
          </div>
        </div>
        <app-tender-stage-header [tenderId]="item.id" page="tender" [refresh]="item.version" />
        @if (item.status === 'Draft') {
          <app-tender-builder
            [tender]="item"
            (changed)="replace($event)"
            (announce)="announce($event)"
            (reloadRequested)="load($event)"
          />
        } @else {
          <app-tender-control
            [tender]="item"
            (changed)="replace($event)"
            (announce)="announce($event)"
            (reloadRequested)="load($event)"
          />
        }
      }
    </section>
  `,
})
export class TenderPage implements OnInit {
  private readonly api = inject(TenderingApi);
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);

  readonly statusLabel = tenderStatusLabel;
  readonly stepLabel = tenderLifecycleLabel;
  readonly typeLabel = tenderTypeLabel;
  readonly deadlineLabel = deadlineStateLabel;
  readonly tender = signal<TenderDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  private id = '';

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.load();
  }

  load(afterNotice = ''): void {
    this.loading.set(this.tender() === null);
    this.error.set('');
    this.api.get(this.id).subscribe({
      next: (tender) => {
        this.tender.set(tender);
        this.loading.set(false);
        if (afterNotice) this.announce(afterNotice);
      },
      error: (error: unknown) => {
        this.error.set(tenderProblemMessage(error));
        this.loading.set(false);
      },
    });
  }

  replace(tender: TenderDetail): void {
    this.tender.set(tender);
  }

  /** Announced politely, and focused when the control that triggered it may have disappeared. */
  announce(message: string): void {
    this.notice.set(message);
    if (message)
      setTimeout(() =>
        this.document.getElementById('tender-notice')?.focus({ preventScroll: false }),
      );
  }
}
