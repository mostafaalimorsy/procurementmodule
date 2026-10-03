import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import {
  CategoryMappingRow,
  DirectoryApi,
  Trade,
  directoryProblemMessage,
} from './subcontractors.api';

const CODE_PATTERN = /^[A-Za-z0-9\-_/]{2,32}$/;

/**
 * The company's own trade vocabulary. It starts empty. A trade is retired rather than deleted:
 * subcontractors that already carry it keep it, but it can no longer be newly assigned.
 * CF-027 (ADR-089): work-package categories are these trades; category text stored before that (and a trade's former names) is mapped to
 * a trade here, so history reads it in one bucket. A mapping changes how history is read, never what was stored, and is audited.
 */
@Component({
  selector: 'app-trades-admin',
  imports: [FormsModule, RouterLink, ConfirmDialog],
  templateUrl: './trades-admin.html',
})
export class TradesAdmin implements OnInit {
  private readonly api = inject(DirectoryApi);

  readonly trades = signal<readonly Trade[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);
  readonly editing = signal<string | null>(null);
  readonly pendingRetire = signal<Trade | null>(null);
  readonly mappings = signal<readonly CategoryMappingRow[] | null>(null);
  readonly mappingError = signal('');
  /** The trade chosen per stored key, before it is saved ('' = no mapping). */
  mappingChoice: Record<string, string> = {};

  readonly retireHeading = $localize`:@@trades.retireTitle:Retire this trade?`;
  readonly retireLabel = $localize`:@@trades.retire:Retire`;
  code = '';
  name = '';
  renameTo = '';
  submitted = false;

  get codeInvalid(): boolean {
    return !CODE_PATTERN.test(this.code.trim());
  }

  get nameInvalid(): boolean {
    const value = this.name.trim();
    return value.length === 0 || value.length > 100;
  }

  ngOnInit(): void {
    this.load();
  }

  loadMappings(): void {
    this.api.categoryMappings().subscribe({
      next: (rows) => this.showMappings(rows),
      error: (error: unknown) => this.mappingError.set(directoryProblemMessage(error)),
    });
  }

  saveMapping(row: CategoryMappingRow): void {
    if (this.busy()) return;
    const tradeId = this.mappingChoice[row.sourceKey] || null;
    this.busy.set(true);
    this.mappingError.set('');
    this.api.setCategoryMapping(row.sourceKey, tradeId).subscribe({
      next: (rows) => {
        this.busy.set(false);
        this.showMappings(rows);
        this.notice.set(
          tradeId
            ? $localize`:@@mappings.saved:Mapping saved. History reads this text under the chosen trade.`
            : $localize`:@@mappings.cleared:Mapping removed. This text is its own history bucket again.`,
        );
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.mappingError.set(directoryProblemMessage(error));
      },
    });
  }

  resolutionLabel(resolution: string): string {
    switch (resolution) {
      case 'Manual':
        return $localize`:@@mappings.manual:Mapped`;
      case 'TradeRenamed':
        return $localize`:@@mappings.renamed:Former trade name`;
      case 'MatchedByName':
        return $localize`:@@mappings.matched:Same as a trade's name or code`;
      default:
        return $localize`:@@mappings.unmapped:Not mapped — its own history bucket`;
    }
  }

  private showMappings(rows: readonly CategoryMappingRow[]): void {
    this.mappings.set(rows);
    // A name or code match needs no mapping; only an explicit choice pins one.
    this.mappingChoice = Object.fromEntries(
      rows.map((row) => [
        row.sourceKey,
        row.resolution === 'MatchedByName' ? '' : (row.tradeId ?? ''),
      ]),
    );
  }

  load(): void {
    this.loadMappings();
    this.loading.set(true);
    this.api.trades().subscribe({
      next: (trades) => {
        this.trades.set(trades);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(directoryProblemMessage(error));
        this.loading.set(false);
      },
    });
  }

  create(): void {
    this.submitted = true;
    if (this.codeInvalid || this.nameInvalid || this.busy()) return;
    this.run(this.api.createTrade(this.code.trim(), this.name.trim()), () => {
      this.notice.set($localize`:@@trades.created:Trade added.`);
      this.code = '';
      this.name = '';
      this.submitted = false;
    });
  }

  startRename(trade: Trade): void {
    this.renameTo = trade.name;
    this.editing.set(trade.id);
  }

  rename(trade: Trade): void {
    const name = this.renameTo.trim();
    if (name.length === 0 || name.length > 100 || this.busy()) return;
    this.run(this.api.renameTrade(trade.id, name, trade.version), () => {
      this.editing.set(null);
      this.notice.set($localize`:@@trades.renamed:Trade renamed.`);
    });
  }

  toggle(trade: Trade): void {
    if (trade.isActive) this.pendingRetire.set(trade);
    else
      this.run(this.api.setTradeActive(trade.id, true, trade.version), () =>
        this.notice.set($localize`:@@trades.restored:Trade restored. It can be assigned again.`),
      );
  }

  confirmRetire(): void {
    const trade = this.pendingRetire();
    if (!trade) return;
    this.run(this.api.setTradeActive(trade.id, false, trade.version), () => {
      this.pendingRetire.set(null);
      this.notice.set(
        $localize`:@@trades.retired:Trade retired. Subcontractors that carry it keep it.`,
      );
    });
  }

  private run(request: ReturnType<DirectoryApi['createTrade']>, done: () => void): void {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    request.subscribe({
      next: () => {
        this.busy.set(false);
        done();
        this.load();
      },
      error: (error: unknown) => {
        this.error.set(directoryProblemMessage(error));
        this.busy.set(false);
        this.pendingRetire.set(null);
      },
    });
  }
}
