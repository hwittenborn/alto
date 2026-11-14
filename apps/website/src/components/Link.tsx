/**
 * A link. One to another site opens in a new tab; not a download (it'd leave
 * an empty one) or an app link like snap:// (it opens an app, not a page).
 */
import type { AnchorHTMLAttributes } from 'react';
import { isExternal } from '../lib/providers';

export function Link({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const newTab = isExternal(href) && props.download === undefined;
  return <a href={href} {...(newTab && { target: '_blank', rel: 'noopener' })} {...props} />;
}
