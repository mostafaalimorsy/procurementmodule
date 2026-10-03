import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { featureLabel } from '../../core/localization/labels';
import { BuilderSubmission, PackageBuilder } from './package-builder';
import { PackageTerms } from './package-terms';
import {
  EntitlementCatalogue,
  PackageRevision,
  PlatformApi,
  PlatformPackage,
  problemMessage,
} from './platform-api.service';

type Editing =
  { readonly mode: 'create' } | { readonly mode: 'revise'; readonly pack: PlatformPackage };

@Component({
  selector: 'app-platform-packages',
  imports: [PackageBuilder, PackageTerms, BusinessDatePipe],
  templateUrl: './packages.html',
  styleUrl: './platform.scss',
})
export class Packages implements OnInit {
  protected readonly featureName = featureLabel;
  private readonly api = inject(PlatformApi);
  readonly packages = signal<PlatformPackage[]>([]);
  readonly catalogue = signal<EntitlementCatalogue | null>(null);
  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly editing = signal<Editing | null>(null);

  /** The revision an edit starts from: always the newest, because edits append. */
  protected readonly base = computed(() => {
    const editing = this.editing();
    return editing?.mode === 'revise' ? current(editing.pack) : null;
  });

  ngOnInit(): void {
    this.load();
  }

  protected current = current;

  protected edit(pack: PlatformPackage): void {
    this.notice.set('');
    this.error.set('');
    this.editing.set({ mode: 'revise', pack });
  }

  protected create(): void {
    this.notice.set('');
    this.error.set('');
    this.editing.set({ mode: 'create' });
  }

  protected save(submission: BuilderSubmission): void {
    const editing = this.editing();
    if (!editing || this.busy()) return;
    const { code, ...terms } = submission;
    const request =
      editing.mode === 'revise'
        ? this.api.revisePackage(editing.pack.id, terms)
        : this.api.createPackage({ code, ...terms });
    this.busy.set(true);
    this.error.set('');
    request.subscribe({
      next: (pack) => {
        this.busy.set(false);
        this.editing.set(null);
        const latest = current(pack);
        this.notice.set(
          editing.mode === 'revise'
            ? $localize`:@@platformPackages.published:Revision ${latest.number}:number: published. Companies stay on their assigned revision until you move them.`
            : $localize`:@@platformPackages.created:Package created with revision 1.`,
        );
        this.load();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(problemMessage(error));
      },
    });
  }

  protected toggle(pack: PlatformPackage): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.api.packageStatus(pack.id, !pack.isActive).subscribe({
      next: () => {
        this.busy.set(false);
        this.notice.set(
          $localize`:@@platformPackages.statusUpdated:Package status updated. Existing assignments retain their terms.`,
        );
        this.load();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(problemMessage(error));
      },
    });
  }

  private load(): void {
    forkJoin({ packages: this.api.packages(), catalogue: this.api.catalogue() }).subscribe({
      next: ({ packages, catalogue }) => {
        this.packages.set(packages);
        this.catalogue.set(catalogue);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(problemMessage(error));
        this.loading.set(false);
      },
    });
  }
}

function current(pack: PlatformPackage): PackageRevision {
  return pack.revisions.reduce((latest, revision) =>
    revision.number > latest.number ? revision : latest,
  );
}
