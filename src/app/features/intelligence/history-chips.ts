import { Component, input } from '@angular/core';
import { BusinessDatePipe } from '../../core/localization/business-format';
import type { DiscoveryEvidence } from '../sourcing/sourcing.api';
import type { SubcontractorHistory } from '../subcontractors/subcontractors.api';
import { strengthLabel } from './intelligence-labels';

/**
 * CF-014 (ADR-130): a firm's history where invitees are chosen — a discovery row, in the work package's category. Counts only; the
 * would-work-again pattern only when the server sent it (performance access). No history is said in words, never as zero.
 */
@Component({
  selector: 'app-discovery-history',
  imports: [BusinessDatePipe],
  template: `
    <span class="prj-hint tnd-block" data-testid="discovery-history">
      @if (evidence().completedProjects === 0) {
        <span i18n="@@historyChip.noneInCategory">No history in this category</span>
      } @else {
        <span i18n="@@historyChip.closeouts">{evidence().completedProjects, plural,
          =1 {1 finalized closeout}
          other {{{ evidence().completedProjects }} finalized closeouts}
        }</span
        >&ngsp;<span i18n="@@historyChip.inCategory"
          >in this category · {{ strength(evidence().strength) }}</span
        >
        @if (evidence().latestClosedAtUtc; as latest) {
          <span i18n="@@historyChip.latest">
            · latest <bdi>{{ latest | businessDate: 'instant' }}</bdi></span
          >
        }
        @if (evidence().wouldWorkAgainYes !== null) {
          <span i18n="@@historyChip.rehire">
            · would work again yes <bdi dir="ltr">{{ evidence().wouldWorkAgainYes }}</bdi> ·
            conditional <bdi dir="ltr">{{ evidence().wouldWorkAgainConditional }}</bdi> · no
            <bdi dir="ltr">{{ evidence().wouldWorkAgainNo }}</bdi></span
          >
        }
      }
    </span>
  `,
})
export class DiscoveryHistoryChip {
  readonly evidence = input.required<DiscoveryEvidence>();
  readonly strength = strengthLabel;
}

/** CF-014 (ADR-130): the directory list's history chip — finalized closeouts across categories (never a combined score) and the latest. */
@Component({
  selector: 'app-directory-history',
  imports: [BusinessDatePipe],
  template: `
    <span class="prj-hint tnd-block" data-testid="directory-history">
      @if (history().closeouts === 0) {
        <span i18n="@@historyChip.none">No closeout history yet</span>
      } @else {
        <span i18n="@@historyChip.closeouts">{history().closeouts, plural,
          =1 {1 finalized closeout}
          other {{{ history().closeouts }} finalized closeouts}
        }</span
        >&ngsp;<span i18n="@@historyChip.categories">{history().categories, plural,
          =1 {in 1 category}
          other {in {{ history().categories }} categories}
        }</span>
        @if (history().latestClosedAtUtc; as latest) {
          <span i18n="@@historyChip.latest">
            · latest <bdi>{{ latest | businessDate: 'instant' }}</bdi></span
          >
        }
      }
    </span>
  `,
})
export class DirectoryHistoryChip {
  readonly history = input.required<SubcontractorHistory>();
}
