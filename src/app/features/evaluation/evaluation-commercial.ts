import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  WritableSignal,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BusinessDatePipe, ZonedInstantPipe } from '../../core/localization/business-format';
import { scheduleItemTypeLabel } from '../../core/localization/labels';
import { parseMoney, trimDecimal } from '../../core/localization/money';
import { LocaleService } from '../../core/localization/locale.service';
import { AutofocusDirective } from '../../shared/ui/autofocus.directive';
import { FocusTrapDirective } from '../../shared/ui/focus-trap.directive';
import { requestKey } from '../../shared/util/request-key';
import { REASON_MAX, REASON_MIN, fileSize, isStale } from '../tendering/tendering.api';
import {
  ADJUSTMENT_CATEGORIES,
  Adjustment,
  AdjustmentCategory,
  CarryOutcome,
  CommercialBid,
  CommercialLine,
  CommercialWorkspace,
  EvaluationApi,
  NOTE_MAX,
  NoteKind,
  ScopeMatrixRow,
  evaluationProblemMessage,
  ScheduleLevelingCell,
  ScheduleLevelingRow,
} from './evaluation.api';
import { compareAmounts, money, percentFrom, signedMoney } from './evaluation-format';
import { adjustmentCategoryLabel, flagLabel, vatTreatmentLabel } from './evaluation-labels';
import type { TenderTerms } from '../tendering/tendering.api';
import { validityBasisLabel, validityStateLabel } from '../decision/decision-labels';

type BidOrder = 'position' | 'leveledAscending';
type MatrixFilter = 'all' | ScopeMatrixRow['kind'];

/**
 * Commercial leveling (Part 9): the opened bids side by side, desktop-first, with identifier rows frozen while bidder columns
 * scroll, the submitted value always beside the buyer's leveled value, explicit "not provided" for missing data, and variance
 * shown as text as well as emphasis. Normalization never rewrites a submission: an adjustment records the original value, the
 * leveled value, the reason, who and when, and a mistaken one is withdrawn, not deleted. On a phone the matrix becomes one
 * card per bid; the evidence drawer holds the detail either way. The order of bidders is neutral unless the user chooses to
 * sort by leveled total, and nothing is labelled "best" or "recommended".
 */
@Component({
  selector: 'app-evaluation-commercial',
  imports: [
    FormsModule,
    BusinessDatePipe,
    ZonedInstantPipe,
    AutofocusDirective,
    FocusTrapDirective,
  ],
  templateUrl: './evaluation-commercial.html',
  styleUrl: './evaluation-commercial.scss',
})
export class EvaluationCommercial {
  private readonly api = inject(EvaluationApi);

  /** CF-003: the leveling workbook download (same origin; the session authorizes it). */
  exportUrl(): string {
    return this.api.levelingExportUrl(this.tenderId());
  }
  private readonly document = inject(DOCUMENT);
  readonly locale = inject(LocaleService).locale;

  readonly tenderId = input.required<string>();
  readonly changed = output<void>();
  readonly announce = output<string>();

  readonly flagLabel = flagLabel;
  readonly validityLabel = validityStateLabel;
  readonly basisLabel = validityBasisLabel;
  readonly categoryLabel = adjustmentCategoryLabel;
  readonly categories = ADJUSTMENT_CATEGORIES;
  readonly reasonMax = REASON_MAX;
  readonly noteMax = NOTE_MAX;
  readonly size = (bytes: number) => fileSize(bytes, this.locale);
  readonly money = (amount: string | null | undefined) => money(amount, this.locale);
  readonly signed = (amount: string | null | undefined) => signedMoney(amount, this.locale);

  readonly workspace = signal<CommercialWorkspace | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly order = signal<BidOrder>('position');
  readonly onlyDifferingLines = signal(false);
  readonly matrixFilter = signal<MatrixFilter>('all');
  readonly drawerId = signal<string | null>(null);
  readonly drawerError = signal('');
  priceThreshold = '';
  durationThreshold = '';
  readonly thresholdError = signal('');

  // The drawer's forms.
  lineTarget: number | null = null;
  lineAmount = '';
  lineCategory: AdjustmentCategory = 'Arithmetic';
  lineReason = '';
  scopeDirection: 'Add' | 'Deduct' = 'Add';
  scopeAmount = '';
  scopeCategory: AdjustmentCategory = 'MissingScope';
  scopeReason = '';
  withdrawTarget: string | null = null;
  withdrawReason = '';
  /** CF-090: the adjustment being confirmed not applicable, and the key of a review whose response may have been lost. */
  carryTarget: string | null = null;
  carryReason = '';
  private pendingCarry: { signature: string; key: string } | null = null;
  noteText = '';
  noteKind: NoteKind = 'Comment';
  /**
   * The request key of an adjustment whose outcome is unknown (no response, or a server error after it may have committed): a
   * retry of the same adjustment reuses it, so the server recognises the retry instead of recording the adjustment twice.
   */
  private pendingAdjustment: { signature: string; key: string } | null = null;
  private opener: HTMLElement | null = null;

  readonly bids = computed<readonly CommercialBid[]>(() => {
    const bids = [...(this.workspace()?.bids ?? [])];
    return this.order() === 'leveledAscending'
      ? bids.sort(
          (a, b) => compareAmounts(a.leveledTotal, b.leveledTotal) || a.position - b.position,
        )
      : bids.sort((a, b) => a.position - b.position);
  });
  /** Red-team G050: the company basis the bids' validity runs from (the same for every bid of the tender). */
  readonly validityBasis = computed(
    () => this.workspace()?.bids.find((bid) => bid.validityBasis)?.validityBasis ?? null,
  );

  /** Red-team B7 (CF-037 AC4): per-bid variance only for estimate readers and only when the estimate is in the bids' currency. */
  comparesWithEstimate(view: CommercialWorkspace): boolean {
    return !!view.estimate && view.estimateComparable !== false;
  }

  /** A signed percentage, isolated left-to-right ("+11.11 %"); "—" when a bid has no variance. */
  percent(value: string | null | undefined): string {
    if (value == null) return '—';
    return value.startsWith('-') ? `${value} %` : `+${value} %`;
  }

  /** Column index of each bid in the server's position order, for aligned-line and matrix cells. */
  private readonly positionIndex = computed(() => {
    const ordered = [...(this.workspace()?.bids ?? [])].sort((a, b) => a.position - b.position);
    return new Map(ordered.map((bid, index) => [bid.openingBidId, index]));
  });
  readonly alignedLines = computed(() => {
    const lines = this.workspace()?.alignedLines ?? [];
    if (!this.onlyDifferingLines()) return lines;
    return lines.filter(
      (line) => new Set(line.leveledAmounts.filter((value) => value !== null)).size > 1,
    );
  });
  /** CF-004: the schedule rows, every item aligned by its key. */
  readonly scheduleRows = computed(() => this.workspace()?.schedule ?? []);
  readonly scheduleTypeLabel = scheduleItemTypeLabel;

  scheduleCell(row: ScheduleLevelingRow, bid: CommercialBid): ScheduleLevelingCell | null {
    return row.bids[this.positionIndex().get(bid.openingBidId) ?? -1] ?? null;
  }

  exact(value: string | null, keep = 0): string {
    return trimDecimal(value, keep);
  }

  readonly matrix = computed(() =>
    (this.workspace()?.scopeMatrix ?? []).filter(
      (row) => this.matrixFilter() === 'all' || row.kind === this.matrixFilter(),
    ),
  );
  readonly drawer = computed(
    () => this.workspace()?.bids.find((bid) => bid.openingBidId === this.drawerId()) ?? null,
  );
  /** The decimals of the bid being adjusted: the server writes each bid's amounts in its own currency's minor units. */
  readonly decimals = computed(() => {
    const sample =
      this.drawer()?.submittedTotal ?? this.workspace()?.bids[0]?.submittedTotal ?? '0.00';
    return sample.includes('.') ? sample.split('.')[1].length : 0;
  });
  readonly median = computed(() => this.workspace()?.comparison.medianLeveledTotal ?? null);

  constructor() {
    effect(() => {
      const id = this.tenderId();
      untracked(() => this.load(id));
    });
  }

  load(id = this.tenderId()): void {
    this.error.set('');
    this.api.commercial(id).subscribe({
      next: (workspace) => this.take(workspace),
      error: (error: unknown) => this.error.set(evaluationProblemMessage(error)),
    });
  }

  readonly vatLabel = vatTreatmentLabel;

  /** CF-055 (ADR-092): one comparison row per requested term, with the requested value as text. */
  termRows(asked: TenderTerms): { key: TermKey; label: string; requested: string }[] {
    const rows: { key: TermKey; label: string; requested: string }[] = [];
    if (asked.retentionPercent !== null)
      rows.push({
        key: 'retention',
        label: $localize`:@@terms.retention:Retention`,
        requested: `${asked.retentionPercent}%`,
      });
    if (asked.advancePaymentPercent !== null)
      rows.push({
        key: 'advance',
        label: $localize`:@@terms.advancePayment:Advance payment`,
        requested: `${asked.advancePaymentPercent}%`,
      });
    if (asked.performanceSecurityPercent !== null)
      rows.push({
        key: 'security',
        label: $localize`:@@terms.performanceSecurity:Performance security`,
        requested: `${asked.performanceSecurityPercent}%`,
      });
    if (asked.bidBondRequired)
      rows.push({
        key: 'bond',
        label: $localize`:@@terms.bidBond:Bid bond`,
        requested: yesNo(true),
      });
    return rows;
  }

  termAnswer(bid: CommercialBid, key: TermKey): string | null {
    const terms = bid.terms;
    if (!terms) return null;
    switch (key) {
      case 'retention':
        return terms.retentionPercent === null ? null : `${terms.retentionPercent}%`;
      case 'advance':
        return terms.advancePaymentPercent === null ? null : `${terms.advancePaymentPercent}%`;
      case 'security':
        return terms.performanceSecurityPercent === null
          ? null
          : `${terms.performanceSecurityPercent}%`;
      default:
        return terms.bidBondProvided === null ? null : yesNo(terms.bidBondProvided);
    }
  }

  cell(values: readonly (string | null)[], bid: CommercialBid): string | null {
    return values[this.positionIndex().get(bid.openingBidId) ?? -1] ?? null;
  }

  stated(row: ScopeMatrixRow, bid: CommercialBid): boolean {
    return row.statedBy[this.positionIndex().get(bid.openingBidId) ?? -1] ?? false;
  }

  kindLabel(kind: ScopeMatrixRow['kind']): string {
    return kind === 'exclusion'
      ? $localize`:@@evaluation.kindExclusion:Exclusion`
      : kind === 'commercialDeviation'
        ? $localize`:@@evaluation.kindCommercialDeviation:Commercial deviation`
        : $localize`:@@evaluation.kindTechnicalDeviation:Technical deviation`;
  }

  /** Variance from the median, stated in words as well as shown: "+60.0% vs median". */
  variance(bid: CommercialBid): string | null {
    if (bid.currencyMismatch) return null;
    return percentFrom(bid.leveledTotal, this.median());
  }

  varianceClass(bid: CommercialBid): string {
    const flagged = bid.flags.some(
      (flag) => flag.key === 'priceAboveMedian' || flag.key === 'priceBelowMedian',
    );
    return flagged ? 'ev-variance ev-variance--outlier' : 'ev-variance';
  }

  unaligned(bid: CommercialBid): readonly CommercialLine[] {
    return bid.lines.filter((line) => !line.alignmentKey);
  }

  hasActiveLineAdjustment(bid: CommercialBid, line: CommercialLine): boolean {
    return !!line.adjustmentId;
  }

  openDrawer(bid: CommercialBid, opener?: HTMLElement): void {
    // The button is passed in: Safari does not focus a clicked button, so the active element is not a reliable opener.
    const active = this.document.activeElement;
    this.opener = opener ?? (active instanceof HTMLElement ? active : null);
    this.drawerId.set(bid.openingBidId);
    this.drawerError.set('');
    this.resetForms();
  }

  closeDrawer(): void {
    this.drawerId.set(null);
    // Focus returns to the control that opened the drawer.
    const opener = this.opener;
    setTimeout(() => opener?.isConnected && opener.focus());
  }

  saveThresholds(): void {
    const evaluation = this.workspace()?.evaluation;
    if (!evaluation || this.busy()) return;
    const price = Number(this.priceThreshold);
    const duration = Number(this.durationThreshold);
    if (
      !/^\d{1,3}$/.test(this.priceThreshold.trim()) ||
      !/^\d{1,3}$/.test(this.durationThreshold.trim()) ||
      price < 1 ||
      duration < 1 ||
      price > 200 ||
      duration > 200
    ) {
      this.thresholdError.set(
        $localize`:@@evaluation.thresholdFormat:Use whole percentages from 1 to 200.`,
      );
      return;
    }
    this.busy.set(true);
    this.api.thresholds(this.tenderId(), price, duration, evaluation.version).subscribe({
      next: (workspace) =>
        this.done(workspace, $localize`:@@evaluation.thresholdsSaved:Comparison thresholds saved.`),
      error: (error: unknown) => this.failed(error, this.thresholdError),
    });
  }

  completeLeveling(): void {
    const evaluation = this.workspace()?.evaluation;
    if (!evaluation || this.busy()) return;
    this.busy.set(true);
    this.api.completeLeveling(this.tenderId(), evaluation.version).subscribe({
      next: (workspace) =>
        this.done(
          workspace,
          $localize`:@@evaluation.levelingCompleted:Commercial leveling marked complete.`,
        ),
      error: (error: unknown) => this.failed(error, this.error),
    });
  }

  reopenLeveling(): void {
    const evaluation = this.workspace()?.evaluation;
    if (!evaluation || this.busy()) return;
    this.busy.set(true);
    this.api.reopenLeveling(this.tenderId(), evaluation.version).subscribe({
      next: (workspace) =>
        this.done(
          workspace,
          $localize`:@@evaluation.levelingReopened:Commercial leveling reopened.`,
        ),
      error: (error: unknown) => this.failed(error, this.error),
    });
  }

  pickLine(line: CommercialLine): void {
    this.lineTarget = line.position;
    this.lineAmount = '';
    this.lineReason = '';
    this.drawerError.set('');
  }

  saveLine(bid: CommercialBid): void {
    if (this.busy() || this.lineTarget === null) return;
    const parsed = parseMoney(this.lineAmount, this.decimals(), true);
    if (!parsed.value) {
      this.drawerError.set(this.amountProblem());
      return;
    }
    if (this.lineReason.trim().length < REASON_MIN) {
      this.drawerError.set(this.reasonProblem());
      return;
    }
    this.record(bid, {
      kind: 'Line',
      linePosition: this.lineTarget,
      leveledAmount: parsed.value,
      direction: null,
      amount: null,
      category: this.lineCategory,
      reason: this.lineReason.trim(),
    });
  }

  saveScope(bid: CommercialBid): void {
    if (this.busy()) return;
    const parsed = parseMoney(this.scopeAmount, this.decimals(), false);
    if (!parsed.value) {
      this.drawerError.set(this.amountProblem());
      return;
    }
    if (this.scopeReason.trim().length < REASON_MIN) {
      this.drawerError.set(this.reasonProblem());
      return;
    }
    this.record(bid, {
      kind: 'Scope',
      linePosition: null,
      leveledAmount: null,
      direction: this.scopeDirection,
      amount: parsed.value,
      category: this.scopeCategory,
      reason: this.scopeReason.trim(),
    });
  }

  startWithdraw(adjustment: Adjustment): void {
    this.withdrawTarget = adjustment.id;
    this.withdrawReason = '';
    this.drawerError.set('');
  }

  confirmWithdraw(adjustment: Adjustment): void {
    if (this.busy()) return;
    if (this.withdrawReason.trim().length < REASON_MIN) {
      this.drawerError.set(this.reasonProblem());
      return;
    }
    this.busy.set(true);
    this.api
      .withdraw(this.tenderId(), adjustment.id, this.withdrawReason.trim(), adjustment.version)
      .subscribe({
        next: (workspace) => {
          this.withdrawTarget = null;
          this.done(
            workspace,
            $localize`:@@evaluation.adjustmentWithdrawn:Adjustment withdrawn. It stays in the history with your reason.`,
          );
        },
        error: (error: unknown) => this.failed(error, this.drawerError),
      });
  }

  startNotApplicable(adjustment: Adjustment): void {
    this.carryTarget = adjustment.id;
    this.carryReason = '';
    this.drawerError.set('');
  }

  carry(adjustment: Adjustment, outcome: CarryOutcome): void {
    if (this.busy()) return;
    const reason = outcome === 'NotApplicable' ? this.carryReason.trim() : null;
    if (outcome === 'NotApplicable' && (reason ?? '').length < REASON_MIN) {
      this.drawerError.set(this.reasonProblem());
      return;
    }
    this.busy.set(true);
    this.drawerError.set('');
    const signature = JSON.stringify([adjustment.id, outcome, reason]);
    if (this.pendingCarry?.signature !== signature)
      this.pendingCarry = { signature, key: requestKey() };
    this.api
      .carry(this.tenderId(), adjustment.id, outcome, reason, this.pendingCarry.key)
      .subscribe({
        next: (workspace) => {
          this.pendingCarry = null;
          this.carryTarget = null;
          this.carryReason = '';
          this.done(
            workspace,
            outcome === 'Reapplied'
              ? $localize`:@@evaluation.carryReappliedDone:Adjustment re-applied to the revised response. The earlier one stays in the history.`
              : $localize`:@@evaluation.carryNotApplicableDone:Confirmed: the adjustment does not apply to the revised response.`,
          );
        },
        error: (error: unknown) => {
          // As for an adjustment: a refusal recorded nothing; without a response the key is kept for a retry.
          const status = error instanceof HttpErrorResponse ? error.status : 0;
          if (status >= 400 && status < 500) this.pendingCarry = null;
          this.failed(error, this.drawerError);
        },
      });
  }

  addNote(bid: CommercialBid): void {
    if (this.busy()) return;
    if (!this.noteText.trim()) {
      this.drawerError.set($localize`:@@evaluation.noteRequired:Write the note first.`);
      return;
    }
    this.busy.set(true);
    this.api
      .addNote(this.tenderId(), bid.openingBidId, 'Commercial', this.noteKind, this.noteText.trim())
      .subscribe({
        next: () => {
          this.noteText = '';
          this.noteKind = 'Comment';
          this.busy.set(false);
          this.announce.emit($localize`:@@evaluation.noteAdded:Note added.`);
          this.changed.emit();
          this.load();
        },
        error: (error: unknown) => this.failed(error, this.drawerError),
      });
  }

  fileUrl(fileId: string): string {
    return this.api.fileUrl(this.tenderId(), fileId);
  }

  private record(bid: CommercialBid, input: Parameters<EvaluationApi['adjust']>[2]): void {
    this.busy.set(true);
    this.drawerError.set('');
    const signature = JSON.stringify([bid.openingBidId, input]);
    if (this.pendingAdjustment?.signature !== signature)
      this.pendingAdjustment = { signature, key: requestKey() };
    const key = this.pendingAdjustment.key;
    this.api.adjust(this.tenderId(), bid.openingBidId, input, key).subscribe({
      next: (workspace) => {
        this.pendingAdjustment = null;
        this.resetForms();
        this.done(
          workspace,
          $localize`:@@evaluation.adjustmentRecorded:Adjustment recorded. The submitted value is unchanged.`,
        );
      },
      error: (error: unknown) => {
        // A refusal (4xx) recorded nothing: the next attempt is a new request. Without a response, or after a server error,
        // the adjustment may have been recorded: the key is kept for a retry of the same adjustment.
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        if (status >= 400 && status < 500) this.pendingAdjustment = null;
        this.failed(error, this.drawerError);
      },
    });
  }

  private take(workspace: CommercialWorkspace): void {
    this.workspace.set(workspace);
    this.priceThreshold = String(workspace.evaluation?.priceOutlierPercent ?? 20);
    this.durationThreshold = String(workspace.evaluation?.durationOutlierPercent ?? 25);
  }

  private done(workspace: CommercialWorkspace, message: string): void {
    this.busy.set(false);
    this.thresholdError.set('');
    this.take(workspace);
    this.announce.emit(message);
    this.changed.emit();
  }

  private failed(error: unknown, target: WritableSignal<string>): void {
    this.busy.set(false);
    if (isStale(error)) {
      target.set(
        $localize`:@@evaluation.stale:Someone else changed this evaluation. The latest version is shown; check it and try again.`,
      );
      this.load();
    } else target.set(evaluationProblemMessage(error));
  }

  private resetForms(): void {
    this.lineTarget = null;
    this.lineAmount = '';
    this.lineReason = '';
    this.scopeAmount = '';
    this.scopeReason = '';
    this.withdrawTarget = null;
    this.withdrawReason = '';
  }

  private amountProblem(): string {
    return $localize`:@@evaluation.amountFormat:Enter the amount as a plain number with at most ${this.decimals()}:decimals: decimals (use a point for decimals).`;
  }

  private reasonProblem(): string {
    return $localize`:@@control.reasonTooShort:Explain the reason (at least ${REASON_MIN}:min: characters).`;
  }
}

type TermKey = 'retention' | 'advance' | 'security' | 'bond';

function yesNo(value: boolean): string {
  return value ? $localize`:@@terms.yes:Yes` : $localize`:@@terms.no:No`;
}
