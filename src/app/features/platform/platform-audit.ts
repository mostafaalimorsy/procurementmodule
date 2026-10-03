import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { PlatformApi, PlatformAuditPage, problemMessage } from './platform-api.service';

/** CF-066 (ADR-142): the read-only platform audit — who did what, newest first, filtered by action prefix or operator. */
@Component({
  selector: 'app-platform-audit',
  imports: [FormsModule, BusinessDatePipe],
  styleUrl: './platform.scss',
  template: `
    <p class="eyebrow" i18n="@@companies.eyebrow">Platform control plane</p>
    <h1 i18n="@@platformAudit.title">Platform audit</h1>
    <p i18n="@@platformAudit.intro">
      Every operator sign-in and every change made in this console, newest first. It cannot be
      edited.
    </p>
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    <form class="list-filter" (ngSubmit)="search(1)">
      <label
        ><span i18n="@@platformAudit.action">Action starts with</span
        ><input name="action" dir="ltr" [(ngModel)]="action" placeholder="operator."
      /></label>
      <label
        ><span i18n="@@platformAudit.requestId">Request id</span
        ><input name="requestId" dir="ltr" maxlength="64" [(ngModel)]="requestId"
      /></label>
      <button i18n="@@platformAudit.search">Show</button>
    </form>
    @if (page(); as current) {
      <div class="table-scroll">
        <table data-testid="platform-audit">
          <thead>
            <tr>
              <th scope="col" i18n="@@platformAudit.colWhen">When</th>
              <th scope="col" i18n="@@platformAudit.colWho">Who</th>
              <th scope="col" i18n="@@platformAudit.colAction">Action</th>
              <th scope="col" i18n="@@platformAudit.colCompany">Company</th>
              <th scope="col" i18n="@@platformAudit.colDetails">Details</th>
            </tr>
          </thead>
          <tbody>
            @for (entry of current.items; track entry.id) {
              <tr>
                <td>
                  <bdi>{{ entry.atUtc | businessDate: 'instant' }}</bdi>
                </td>
                <td>
                  <bdi dir="ltr">{{ entry.actorName ?? entry.actor }}</bdi>
                </td>
                <td>
                  <bdi dir="ltr" class="ltr-token">{{ entry.action }}</bdi>
                </td>
                <td>
                  <bdi dir="ltr">{{ entry.companyCode ?? '—' }}</bdi>
                </td>
                <td>
                  <code dir="ltr">{{ entry.metadataJson }}</code>
                  @if (entry.request; as request) {
                    <p data-testid="platform-audit-request">
                      <small>
                        @if (request.requestId) {
                          <button
                            class="secondary compact"
                            type="button"
                            (click)="showRequest(request.requestId)"
                            i18n="@@platformAudit.request"
                          >
                            Request <bdi dir="ltr">{{ request.requestId }}</bdi>
                          </button>
                        }
                        @if (request.sourceAddress) {
                          <span i18n="@@platformAudit.requestFrom"
                            >from <bdi dir="ltr">{{ request.sourceAddress }}</bdi></span
                          >
                        }
                        @if (request.userAgent) {
                          · <bdi dir="ltr">{{ request.userAgent }}</bdi>
                        }
                      </small>
                    </p>
                  } @else if (!entry.actor.startsWith('system:')) {
                    <!-- CF-122 AC8: an operator's event from before request capture says so. -->
                    <p data-testid="platform-audit-request-missing">
                      <small i18n="@@platformAudit.requestNotRecorded">Request not recorded</small>
                    </p>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" i18n="@@platformAudit.empty">No events match.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div class="actions">
        <button
          class="secondary"
          type="button"
          [disabled]="current.page <= 1"
          (click)="search(current.page - 1)"
          i18n="@@platformAudit.newer"
        >
          Newer
        </button>
        <button
          class="secondary"
          type="button"
          [disabled]="current.page * current.pageSize >= current.totalCount"
          (click)="search(current.page + 1)"
          i18n="@@platformAudit.older"
        >
          Older
        </button>
      </div>
    }
  `,
})
export class PlatformAudit implements OnInit {
  private readonly api = inject(PlatformApi);
  readonly page = signal<PlatformAuditPage | null>(null);
  readonly error = signal('');
  action = '';
  requestId = '';

  ngOnInit(): void {
    this.search(1);
  }

  /** CF-122 (ADR-148): every event the same request recorded. */
  showRequest(requestId: string): void {
    this.action = '';
    this.requestId = requestId;
    this.search(1);
  }

  search(page: number): void {
    this.error.set('');
    this.api.audit(page, this.action, '', this.requestId).subscribe({
      next: (result) => this.page.set(result),
      error: (error: unknown) => this.error.set(problemMessage(error)),
    });
  }
}
