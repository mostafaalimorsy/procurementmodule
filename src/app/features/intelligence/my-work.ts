import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BusinessDatePipe } from '../../core/localization/business-format';
import {
  IntelligenceApi,
  MyWork,
  MyWorkItem,
  intelligenceProblemMessage,
} from './intelligence.api';

/**
 * CF-001 (ADR-115): what is waiting on you, first on Home — each item names the record, how long it has waited and why, and opens the place where
 * the work is done. The server derives it per reader on every read (permission, the person a record routes to, the plan); nothing is stored.
 */
@Component({
  selector: 'app-my-work',
  imports: [RouterLink, BusinessDatePipe],
  template: `
    <section class="dash-block my-work" aria-labelledby="my-work-title">
      <h3 id="my-work-title" i18n="@@myWork.title">My work</h3>
      @if (error()) {
        <p class="prj-note prj-note--error" role="alert">{{ error() }}</p>
      } @else if (work(); as view) {
        @if (view.items.length === 0) {
          <p class="prj-hint" i18n="@@myWork.empty">Nothing is waiting on you.</p>
        } @else {
          @if (own(view).length === 0) {
            <p class="prj-hint" i18n="@@myWork.empty">Nothing is waiting on you.</p>
          }
          <ul class="my-work-list" role="list">
            @for (item of own(view); track item.kind + item.recordId) {
              <li>
                <a [routerLink]="link(item)" [queryParams]="query(item)">{{ label(item) }}</a>
                · <bdi dir="ltr">{{ item.reference }}</bdi>
                @if (item.title) {
                  · <bdi>{{ item.title }}</bdi>
                }
                <small class="prj-hint tnd-block" i18n="@@myWork.since"
                  >Waiting since {{ item.sinceUtc | businessDate: 'instant' }}</small
                >
                @if (item.reason === 'unassigned') {
                  <small class="prj-hint tnd-block" i18n="@@myWork.noProjectManager"
                    >No Project Manager is assigned to this project.</small
                  >
                }
                @if (item.dueAtUtc) {
                  @if (overdueDays(item); as days) {
                    <small class="my-work-overdue tnd-block" i18n="@@myWork.overdue">{days, plural,
                      =1 {Overdue by 1 day}
                      other {Overdue by {{ days }} days}
                    }</small>
                  } @else {
                    <small class="prj-hint tnd-block" i18n="@@myWork.due"
                      >Due {{ item.dueAtUtc | businessDate: 'instant' }}</small
                    >
                  }
                }
              </li>
            }
          </ul>
          @if (others(view); as rest) {
            @if (rest.length > 0) {
              <!-- CF-036: closeout work on projects another Project Manager is assigned to — visible, but not presented as yours. -->
              <h4 class="my-work-others" i18n="@@myWork.otherProjects">Other projects</h4>
              <ul class="my-work-list" role="list">
                @for (item of rest; track item.kind + item.recordId) {
                  <li>
                    <a [routerLink]="link(item)" [queryParams]="query(item)">{{ label(item) }}</a>
                    · <bdi dir="ltr">{{ item.reference }}</bdi>
                    @if (item.title) {
                      · <bdi>{{ item.title }}</bdi>
                    }
                  </li>
                }
              </ul>
            }
          }
          @if (view.total > view.items.length) {
            <p class="prj-hint" i18n="@@myWork.more">
              And {{ view.total - view.items.length }} more, oldest first.
            </p>
          }
        }
      }
    </section>
  `,
  styles: `
    .my-work-list {
      margin: 0;
      padding-inline-start: 1.25rem;
    }
    .my-work-list li + li {
      margin-block-start: 0.5rem;
    }
    .my-work-others {
      margin-block: 1rem 0.25rem;
      font-size: 1rem;
    }
    .my-work-overdue {
      color: var(--color-danger);
      font-weight: 600;
    }
  `,
})
export class MyWorkPanel implements OnInit {
  private readonly api = inject(IntelligenceApi);
  readonly work = signal<MyWork | null>(null);
  readonly error = signal('');

  /** CF-036: everything except closeout work routed to another project's assigned Project Manager. */
  own(view: MyWork): readonly MyWorkItem[] {
    return view.items.filter((item) => item.reason !== 'other_project');
  }

  others(view: MyWork): readonly MyWorkItem[] {
    return view.items.filter((item) => item.reason === 'other_project');
  }

  ngOnInit(): void {
    this.api.myWork().subscribe({
      next: (work) => this.work.set(work),
      error: (error: unknown) => this.error.set(intelligenceProblemMessage(error)),
    });
  }

  /** CF-010: whole days past the due date, against the server's clock (0 or none: not overdue). */
  overdueDays(item: MyWorkItem): number {
    const view = this.work();
    if (!item.dueAtUtc || !view) return 0;
    const late = Date.parse(view.generatedAtUtc) - Date.parse(item.dueAtUtc);
    return late > 0 ? Math.max(1, Math.floor(late / 86_400_000)) : 0;
  }

  link(item: MyWorkItem): unknown[] {
    const tender = ['/tenders', item.tenderId];
    switch (item.kind) {
      case 'shortlist.awaiting_approval':
      case 'shortlist.approved_no_tender':
        return ['/sourcing', item.recordId];
      case 'round.past_deadline':
        return [...tender, 'negotiation'];
      case 'evaluation.scorecards_missing':
      case 'evaluation.leveling':
      case 'evaluation.ready_to_complete':
      case 'evaluation.refresh_required':
      case 'tender.awaiting_opening':
        return [...tender, 'evaluation'];
      case 'decision.to_prepare':
      case 'decision.awaiting_my_approval':
      case 'award.to_issue':
      case 'award.answer_pending':
      case 'award.withdrawal_to_decide':
        return [...tender, 'decision'];
      case 'closeout.execution_missing':
      case 'closeout.commercial_missing':
      case 'closeout.to_finalize':
      case 'closeout.reopened':
        return ['/closeouts', item.recordId];
      case 'closeout.pm_unassigned':
        return ['/projects', item.recordId, 'edit'];
      default:
        return tender;
    }
  }

  query(item: MyWorkItem): Record<string, string> | null {
    switch (item.kind) {
      case 'evaluation.scorecards_missing':
        return { tab: 'technical' };
      case 'evaluation.leveling':
        return { tab: 'commercial' };
      case 'decision.awaiting_my_approval':
        return { tab: 'approval' };
      case 'award.to_issue':
      case 'award.answer_pending':
      case 'award.withdrawal_to_decide':
        return { tab: 'award' };
      default:
        return null;
    }
  }

  label(item: MyWorkItem): string {
    const count = item.step ?? 0;
    switch (item.kind) {
      case 'shortlist.awaiting_approval':
        return $localize`:@@myWork.shortlistApproval:Shortlist submitted for your approval`;
      case 'shortlist.approved_no_tender':
        return $localize`:@@myWork.shortlistNoTender:Shortlist approved — prepare the tender`;
      case 'clarification.open':
        return $localize`:@@myWork.questions:Bidder questions to answer: ${count}:count:`;
      case 'addendum.draft':
        return $localize`:@@myWork.addendum:Draft addendum to issue`;
      case 'outside_bid.unconfirmed':
        return $localize`:@@myWork.outsideBid:Bid received outside the portal — confirm the transcription`;
      case 'tender.publish_requested':
        return $localize`:@@myWork.publish:Draft marked ready — publish it`;
      case 'tender.awaiting_opening':
        // Re-audit AW (H4): the deadline passed — the bids wait for those who open them.
        return $localize`:@@myWork.openBids:Bidding closed — open the bids`;
      case 'round.past_deadline':
        return $localize`:@@myWork.roundOverdue:Negotiation round ${count}:round: past its deadline — close it`;
      case 'evaluation.scorecards_missing':
        return $localize`:@@myWork.scorecards:Bids to score: ${count}:count:`;
      case 'evaluation.leveling':
        return $localize`:@@myWork.leveling:Commercial leveling to finish`;
      case 'evaluation.ready_to_complete':
        return $localize`:@@myWork.completeEvaluation:Evaluation ready to complete`;
      case 'evaluation.refresh_required':
        // Red-team B-001-5 (H8): a negotiation round closed after the evaluation — refresh it before the decision.
        return $localize`:@@myWork.refreshEvaluation:Round closed — take its responses into the evaluation`;
      case 'decision.to_prepare':
        switch (item.reason) {
          case 'ready':
            return $localize`:@@myWork.prepareReady:Evidence ready — prepare the decision`;
          case 'returned':
            return $localize`:@@myWork.prepareReturned:Decision returned for changes`;
          case 'rejected':
            return $localize`:@@myWork.prepareRejected:Proposal rejected — prepare it again`;
          case 'withdrawn':
            return $localize`:@@myWork.prepareWithdrawn:Submission withdrawn — prepare it again`;
          case 'released':
            return $localize`:@@myWork.prepareReleased:Award ended — prepare a new decision`;
          default:
            return $localize`:@@myWork.prepareDraft:Decision draft to finish`;
        }
      case 'decision.awaiting_my_approval':
        return $localize`:@@myWork.approval:Approval step ${count}:step: is yours`;
      case 'award.to_issue':
        return $localize`:@@myWork.issue:Approved — issue the award`;
      case 'award.answer_pending':
        return $localize`:@@myWork.answer:Record the firm's answer to the award`;
      case 'award.withdrawal_to_decide':
        return $localize`:@@myWork.withdrawal:Award withdrawal awaiting your decision`;
      case 'closeout.execution_missing':
        return $localize`:@@myWork.execution:Closeout: record the execution section`;
      case 'closeout.commercial_missing':
        return $localize`:@@myWork.commercial:Closeout: record the commercial section`;
      case 'closeout.to_finalize':
        return $localize`:@@myWork.finalize:Closeout ready to finalize`;
      case 'closeout.reopened':
        // Red-team B-001-5 (H14): a reopened closeout is its own kind, routed like the finalization.
        return $localize`:@@myWork.reopened:Closeout reopened for correction — correct it and finalize again`;
      case 'closeout.pm_unassigned':
        return $localize`:@@myWork.assignProjectManager:Accepted award without a Project Manager — assign one to the project`;
      default:
        return item.kind;
    }
  }
}
