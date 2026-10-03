import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  PlatformApi,
  SecretKeyStatus,
  SecretRewrapResult,
  problemMessage,
} from './platform-api.service';

/**
 * CF-118 (ADR-149): key rotation. The stored secrets (mail-server passwords, the encrypted copies of firm links, queued identity mail,
 * authenticator secrets) counted against the configured keys, and their rewrap under the current ones — optionally after creating a fresh
 * Data Protection key. Only fingerprints and counts are ever shown; the rewrap is in the platform audit.
 */
@Component({
  selector: 'app-platform-secret-keys',
  imports: [FormsModule],
  styleUrl: './platform.scss',
  template: `
    <p class="eyebrow" i18n="@@companies.eyebrow">Platform control plane</p>
    <h1 i18n="@@secretKeys.title">Keys</h1>
    <p i18n="@@secretKeys.intro">
      To rotate the secrets key: configure the new key as current and the old one as previous,
      restart, rewrap here until no value is under the previous key, then remove the old key. The
      runbook has the steps.
    </p>
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    @if (status(); as current) {
      <dl class="panel" data-testid="secret-keys">
        <dt i18n="@@secretKeys.current">Current secrets key</dt>
        <dd>
          <code dir="ltr">{{ current.currentKeyId ?? '—' }}</code>
        </dd>
        <dt i18n="@@secretKeys.previous">Previous keys (decrypt only)</dt>
        <dd>
          @for (id of current.previousKeyIds; track id) {
            <code dir="ltr">{{ id }}</code>
          } @empty {
            <span i18n="@@secretKeys.none">None</span>
          }
        </dd>
        <dt i18n="@@secretKeys.ring">Data Protection key ring</dt>
        <dd>
          @if (current.keyRingEncrypted) {
            <span i18n="@@secretKeys.encrypted">Encrypted at rest with its certificate</span>
          } @else {
            <span class="error" i18n="@@secretKeys.unencrypted"
              >Not encrypted at rest — configure the certificate before the pilot</span
            >
          }
        </dd>
      </dl>
      <div class="table-scroll">
        <table data-testid="secret-stores">
          <thead>
            <tr>
              <th scope="col" i18n="@@secretKeys.colStore">Stored values</th>
              <th scope="col" i18n="@@secretKeys.colCurrent">Current key</th>
              <th scope="col" i18n="@@secretKeys.colPrevious">Previous key</th>
              <th scope="col" i18n="@@secretKeys.colUnreadable">No key opens</th>
            </tr>
          </thead>
          <tbody>
            @for (store of current.stores; track store.store) {
              <tr>
                <td>
                  <code dir="ltr">{{ store.store }}</code>
                </td>
                <td>
                  <bdi dir="ltr">{{ store.current }}</bdi>
                </td>
                <td>
                  <bdi dir="ltr">{{ store.previous }}</bdi>
                </td>
                <td>
                  <bdi dir="ltr">{{ store.unreadable }}</bdi>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <form (ngSubmit)="rewrap()">
        <label class="check"
          ><input type="checkbox" name="createKey" [(ngModel)]="createKey" />
          <span i18n="@@secretKeys.createKey"
            >First create a fresh Data Protection key (authenticator secrets move to it)</span
          ></label
        >
        <button type="submit" [disabled]="busy()" i18n="@@secretKeys.rewrap">
          Rewrap stored secrets
        </button>
      </form>
      @if (result(); as done) {
        <p class="notice" role="status" data-testid="secret-rewrap-result" i18n="@@secretKeys.done">
          Rewrapped <bdi dir="ltr">{{ done.rewrapped }}</bdi> value(s); changed meanwhile (run
          again): <bdi dir="ltr">{{ done.conflicts }}</bdi
          >; no key opens: <bdi dir="ltr">{{ done.unreadable }}</bdi
          >.
        </p>
      }
    }
  `,
})
export class SecretKeys implements OnInit {
  private readonly api = inject(PlatformApi);
  readonly status = signal<SecretKeyStatus | null>(null);
  readonly result = signal<SecretRewrapResult | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  createKey = false;

  ngOnInit(): void {
    this.api.secretKeys().subscribe({
      next: (status) => this.status.set(status),
      error: (error: unknown) => this.error.set(problemMessage(error)),
    });
  }

  rewrap(): void {
    this.busy.set(true);
    this.error.set('');
    this.api.rewrapSecrets(this.createKey).subscribe({
      next: (result) => {
        this.result.set(result);
        this.status.set(result.status);
        this.busy.set(false);
      },
      error: (error: unknown) => {
        this.error.set(problemMessage(error));
        this.busy.set(false);
      },
    });
  }
}
