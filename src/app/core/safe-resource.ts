import { computed, type ResourceRef, type Signal } from '@angular/core';

export interface SafeResource<T> {
  /** The loaded value, or `undefined` while loading / on error (never throws). */
  value: Signal<T | undefined>;
  error: Signal<unknown>;
  isLoading: Signal<boolean>;
  reload: () => void;
  set: (v: T) => void;
}

/**
 * Angular resources throw from `value()` when in the error state (e.g. an API 404). Pages read
 * `value()` in templates, so wrap every resource to make errors explicit via `error()` instead.
 */
export function safeResource<T>(r: ResourceRef<T | undefined>): SafeResource<T> {
  return {
    value: computed(() => (r.hasValue() ? (r.value() as T) : undefined)),
    error: r.error,
    isLoading: r.isLoading,
    reload: () => void r.reload(),
    set: (v: T) => r.set(v),
  };
}
