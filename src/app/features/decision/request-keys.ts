import { Injectable } from '@angular/core';
import { requestKey } from '../../shared/util/request-key';

/**
 * Request keys for idempotent actions, kept for the life of the page that provides this service — not of the section or
 * dialog that sends them. A retry of the same action (same scope, for example "Approve" on decision version v3) reuses the
 * key even after the user switched tabs or reopened the dialog, so a lost answer never acts twice; the key is dropped
 * once the action succeeded.
 */
@Injectable()
export class RequestKeys {
  private readonly keys = new Map<string, string>();

  for(scope: string): string {
    let key = this.keys.get(scope);
    if (!key) {
      key = requestKey();
      this.keys.set(scope, key);
    }
    return key;
  }

  done(scope: string): void {
    this.keys.delete(scope);
  }
}
