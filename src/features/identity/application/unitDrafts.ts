const DRAFT_CLEAN_EVENT = 'cozzigo:draft-clean';

export type UnitDraftControl =
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function controlValue(control: UnitDraftControl): string {
  if (
    control instanceof HTMLInputElement &&
    (control.type === 'checkbox' || control.type === 'radio')
  )
    return String(control.checked);
  if (control instanceof HTMLSelectElement && control.multiple)
    return JSON.stringify(
      Array.from(control.selectedOptions, (option) => option.value),
    );
  return control.value;
}

export function isDraftControl(
  target: EventTarget | null,
): target is UnitDraftControl {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  );
}

export function isTrackableDraftControl(control: UnitDraftControl) {
  return !(
    control instanceof HTMLInputElement &&
    ['button', 'submit', 'reset', 'hidden', 'file'].includes(control.type)
  );
}

/** Used only after a form's asynchronous save succeeds or the user explicitly discards it. */
export function markUnitDraftClean(form: HTMLFormElement | null | undefined) {
  if (form)
    document.dispatchEvent(
      new CustomEvent(DRAFT_CLEAN_EVENT, { detail: form }),
    );
}

export function unitDraftCleanEvent() {
  return DRAFT_CLEAN_EVENT;
}

export { controlValue };
