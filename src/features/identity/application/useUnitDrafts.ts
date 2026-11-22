import { useCallback, useEffect, useRef } from 'react';

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function fieldValue(field: Field): string {
  if (
    field instanceof HTMLInputElement &&
    (field.type === 'checkbox' || field.type === 'radio')
  )
    return String(field.checked);
  if (field instanceof HTMLSelectElement && field.multiple)
    return JSON.stringify(
      Array.from(field.selectedOptions, (option) => option.value),
    );
  return field.value;
}

/** Tracks edited controls inside mounted unit forms, without storing their values outside the browser. */
export function useUnitDrafts() {
  const initial = useRef(new Map<Field, string>());
  const hasDraft = useCallback(() => {
    for (const [field, value] of initial.current) {
      if (!field.isConnected) {
        initial.current.delete(field);
        continue;
      }
      if (fieldValue(field) !== value) return true;
    }
    return false;
  }, []);
  useEffect(() => {
    function remember(event: FocusEvent) {
      const field = event.target;
      if (!(
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement
      ))
        return;
      if (
        !field.form ||
        !field.closest('[data-unit-draft-scope]') ||
        initial.current.has(field)
      )
        return;
      if (
        field instanceof HTMLInputElement &&
        ['button', 'submit', 'reset', 'hidden', 'file'].includes(field.type)
      )
        return;
      initial.current.set(field, fieldValue(field));
    }
    function reset(event: Event) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      for (const field of initial.current.keys())
        if (field.form === form) initial.current.delete(field);
    }
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!hasDraft()) return;
      event.preventDefault();
      event.returnValue = '';
    }
    document.addEventListener('focusin', remember, true);
    document.addEventListener('reset', reset, true);
    window.addEventListener('beforeunload', beforeUnload);
    const entries = initial.current;
    return () => {
      document.removeEventListener('focusin', remember, true);
      document.removeEventListener('reset', reset, true);
      window.removeEventListener('beforeunload', beforeUnload);
      entries.clear();
    };
  }, [hasDraft]);
  return hasDraft;
}
