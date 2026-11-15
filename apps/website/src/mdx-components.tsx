/**
 * How Markdown (.mdx) is drawn: as the rest of the site, with links through
 * <Link> (another site's in a new tab).
 */
import type { MDXComponents } from 'mdx/types';
import { Link } from './components/Link';

const components: MDXComponents = {
  a: ({ href = '', ...props }) => <Link href={href} {...props} />,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
