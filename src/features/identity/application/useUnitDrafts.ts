import { useCallback, useEffect, useRef } from 'react';
import {
  controlValue,
  isDraftControl,
  isTrackableDraftControl,
  unitDraftCleanEvent,
  type UnitDraftControl,
} from './unitDrafts';

type FormDraft = {
  scope: HTMLElement;
  key: string | null;
  fields: Map<UnitDraftControl, string>;
};

/** Tracks native form values, retaining their state across review steps that replace the form DOM. */
export function useUnitDrafts() {
  const drafts = useRef(new Map<HTMLFormElement, FormDraft>());

  const scan = useCallback(() => {
    for (const form of document.querySelectorAll<HTMLFormElement>('form')) {
      if (!form.closest('[data-unit-draft-scope]')) continue;
      let draft = drafts.current.get(form);
      if (!draft) {
        draft = {
          scope: form.closest('[data-unit-draft-scope]')!,
          key: form.dataset.unitDraftKey ?? null,
          fields: new Map(),
        };
        drafts.current.set(form, draft);
      }
      for (const control of Array.from(form.elements)) {
        if (
          !isDraftControl(control) ||
          !isTrackableDraftControl(control) ||
          draft.fields.has(control)
        )
          continue;
        draft.fields.set(control, controlValue(control));
      }
    }
  }, []);

  const hasDraft = useCallback(() => {
    scan();
    for (const draft of drafts.current.values()) {
      if (!draft.scope.isConnected) continue;
      for (const [control, initialValue] of draft.fields)
        if (controlValue(control) !== initialValue) return true;
    }
    return false;
  }, [scan]);

  const discardDraft = useCallback((scope: HTMLElement, key: string) => {
    for (const [form, draft] of drafts.current)
      if (draft.scope === scope && draft.key === key)
        drafts.current.delete(form);
  }, []);

  const clearDrafts = useCallback(() => {
    drafts.current.clear();
  }, []);

  useEffect(() => {
    const entries = drafts.current;
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!hasDraft()) return;
      event.preventDefault();
      event.returnValue = '';
    }
    function markClean(event: Event) {
      const form = (event as CustomEvent<HTMLFormElement>).detail;
      if (!(form instanceof HTMLFormElement)) return;
      const scope =
        (form.closest('[data-unit-draft-scope]') as HTMLElement | null) ??
        drafts.current.get(form)?.scope;
      if (!scope) return;
      const key = form.dataset.unitDraftKey ?? drafts.current.get(form)?.key;
      if (key) {
        for (const [candidate, draft] of drafts.current)
          if (draft.scope === scope && draft.key === key)
            drafts.current.delete(candidate);
      } else drafts.current.delete(form);
      if (!form.isConnected) return;
      const fields: FormDraft['fields'] = new Map();
      for (const control of Array.from(form.elements))
        if (isDraftControl(control) && isTrackableDraftControl(control))
          fields.set(control, controlValue(control));
      drafts.current.set(form, { scope, key: key ?? null, fields });
    }
    function changed(event: Event) {
      if (isDraftControl(event.target)) scan();
    }
    function discard(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>(
        'button[data-draft-discard]',
      );
      if (!button) return;
      const scope = button.closest(
        '[data-unit-draft-scope]',
      ) as HTMLElement | null;
      const key = button.dataset.draftDiscard;
      if (!scope || !key) return;
      scan();
      const dirty = Array.from(drafts.current.values()).some(
        (draft) =>
          draft.scope === scope &&
          draft.key === key &&
          Array.from(draft.fields).some(
            ([control, value]) => controlValue(control) !== value,
          ),
      );
      if (!dirty) return;
      if (
        !window.confirm(
          'Há alterações não salvas neste formulário. Deseja descartá-las?',
        )
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      discardDraft(scope, key);
    }
    const observer = new MutationObserver(scan);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    document.addEventListener('input', changed, true);
    document.addEventListener('change', changed, true);
    document.addEventListener('reset', changed, true);
    document.addEventListener(unitDraftCleanEvent(), markClean, true);
    document.addEventListener('click', discard, true);
    window.addEventListener('beforeunload', beforeUnload);
    scan();
    return () => {
      observer.disconnect();
      document.removeEventListener('input', changed, true);
      document.removeEventListener('change', changed, true);
      document.removeEventListener('reset', changed, true);
      document.removeEventListener(unitDraftCleanEvent(), markClean, true);
      document.removeEventListener('click', discard, true);
      window.removeEventListener('beforeunload', beforeUnload);
      entries.clear();
    };
  }, [discardDraft, hasDraft, scan]);

  return { hasDraft, clearDrafts };
}
