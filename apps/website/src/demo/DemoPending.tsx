/**
 * Marks the page as waiting for the demo, until it's drawn: globals.css holds
 * the homepage hidden meanwhile, for up to 4 seconds.
 */
export function DemoPending() {
  return <div data-demo-pending="" hidden />;
}
