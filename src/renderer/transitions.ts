/**
 * Makes `change` to each element at once, without the transitions its CSS
 * would run for it, e.g. a theme whose rows transition their background.
 */
export function withoutTransitions<T extends HTMLElement>(elements: T[], change: (element: T) => void) {
  for (const element of elements) {
    element.style.transition = 'none';
    change(element);
  }
  for (const element of elements) {
    // Applied before transitions are back.
    getComputedStyle(element).getPropertyValue('transition');
    element.style.transition = '';
  }
}
