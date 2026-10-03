import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ComplianceApi,
  CompliancePreset,
  ComplianceType,
  ComplianceTypeInput,
} from './compliance.api';
import { DirectoryApi, Trade, directoryProblemMessage } from './subcontractors.api';

/**
 * CF-056 (ADR-095, OD-19): the documents the company keeps on file for its subcontractors. Every type is the company's own data — its name,
 * which trades need it, which details it must carry, and whether an expired or missing one stops an award. The Saudi list is only an optional
 * starting point. A type is switched off, never deleted: records that use it stay.
 */
@Component({
  selector: 'app-compliance-types',
  imports: [FormsModule, RouterLink],
  templateUrl: './compliance-types.html',
})
export class ComplianceTypesPage implements OnInit {
  private readonly api = inject(ComplianceApi);
  private readonly directory = inject(DirectoryApi);

  readonly types = signal<readonly ComplianceType[]>([]);
  readonly presets = signal<readonly CompliancePreset[]>([]);
  readonly trades = signal<readonly Trade[]>([]);
  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);
  readonly editing = signal<ComplianceType | null>(null);

  form: ComplianceTypeInput = this.emptyForm();

  ngOnInit(): void {
    this.load();
    this.directory
      .trades()
      .subscribe({ next: (trades) => this.trades.set(trades.filter((trade) => trade.isActive)) });
  }

  load(): void {
    this.api.types().subscribe({
      next: (types) => this.types.set(types),
      error: (error: unknown) => this.error.set(directoryProblemMessage(error)),
    });
    this.api.presets().subscribe({ next: (presets) => this.presets.set(presets) });
  }

  edit(type: ComplianceType): void {
    this.editing.set(type);
    this.form = {
      name: type.name,
      description: type.description,
      requiresNumber: type.requiresNumber,
      requiresIssuer: type.requiresIssuer,
      requiresExpiry: type.requiresExpiry,
      awardBlocking: type.awardBlocking,
      appliesToAllTrades: type.appliesToAllTrades,
      tradeIds: type.trades.map((trade) => trade.id),
      isActive: type.isActive,
    };
  }

  cancel(): void {
    this.editing.set(null);
    this.form = this.emptyForm();
  }

  toggleTrade(id: string, checked: boolean): void {
    const ids = new Set(this.form.tradeIds);
    if (checked) ids.add(id);
    else ids.delete(id);
    this.form.tradeIds = [...ids];
  }

  save(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const editing = this.editing();
    const request = editing
      ? this.api.updateType(editing.id, this.form, editing.version)
      : this.api.createType(this.form);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.notice.set(
          editing
            ? $localize`:@@complianceTypes.updated:Document type saved.`
            : $localize`:@@complianceTypes.created:Document type added.`,
        );
        this.cancel();
        this.load();
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  addPreset(preset: CompliancePreset): void {
    if (this.busy() || preset.added) return;
    this.busy.set(true);
    this.api.addPreset(preset.key).subscribe({
      next: () => {
        this.busy.set(false);
        this.notice.set(
          $localize`:@@complianceTypes.presetAdded:Added. Review whether it should block an award and which trades need it.`,
        );
        this.load();
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    this.error.set(directoryProblemMessage(error));
  }

  private emptyForm(): ComplianceTypeInput {
    return {
      name: '',
      description: null,
      requiresNumber: false,
      requiresIssuer: false,
      requiresExpiry: true,
      awardBlocking: false,
      appliesToAllTrades: true,
      tradeIds: [],
      isActive: true,
    };
  }
}
