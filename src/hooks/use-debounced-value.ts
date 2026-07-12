import { useEffect, useState } from 'react';

/**
 * Trailing-edge debounce of a value. The search surfaces (the recipe editor's
 * ingredient autocomplete and its add-ingredient sheet) each drive a react-query
 * fetch off the typed query, and re-keying that query on every keystroke would
 * fire a request per character.
 *
 * Extracted rather than copied a sixth time: the same six-line hook was already
 * inlined in IngredientAutocomplete, IngredientDialog, AddToDaySheet,
 * ExercisePicker and ExercisesPage. This lands it in one place and rewires the
 * two call sites in this task's blast radius; the other three keep their private
 * copies until something else touches them.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
