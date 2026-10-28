import { AdwaitaProvider, type GtkProviderProps } from '@gtk-js/adwaita';
import * as adwaitaIcons from '@gtk-js/icons-adwaita';
import type { ComponentType, CSSProperties, ReactNode } from 'react';

/** The GTK themes Alto looks native in: GNOME's, and macOS's before and since Tahoe. */
export type ThemeName = 'adwaita' | 'whitesur' | 'mactahoe';

const THEMES: readonly ThemeName[] = ['adwaita', 'whitesur', 'mactahoe'];

/** What a theme's provider takes: the app's own icons over the theme's, and the root's style. */
export interface ThemeProviderProps {
  icons: GtkProviderProps['icons'];
  style?: CSSProperties;
  children: ReactNode;
}

/** The theme's provider, ready to render: its stylesheet and icons are loaded. */
export interface Theme {
  name: ThemeName;
  Provider: ComponentType<ThemeProviderProps>;
}

/**
 * The theme for the system Alto runs on: macOS's look on macOS (Tahoe's from
 * macOS 26, Big Sur's before), and GNOME's elsewhere. `$ALTO_THEME` picks one
 * instead, to try them anywhere.
 */
export function platformTheme({ os, version, theme }: Window['electronAPI']['platform']): ThemeName {
  if (theme && (THEMES as readonly string[]).includes(theme)) return theme as ThemeName;
  if (os !== 'darwin') return 'adwaita';
  return Number.parseInt(version, 10) >= 26 ? 'mactahoe' : 'whitesur';
}

function Adwaita({ icons, ...rest }: ThemeProviderProps) {
  // AdwaitaProvider takes the whole icon set until gtk-js merges the app's over it.
  return <AdwaitaProvider icons={{ ...adwaitaIcons, ...icons }} {...rest} />;
}

/**
 * A macOS theme's provider: the theme, its icons and macOS's window button
 * order (MacTahoeProvider and WhiteSurProvider from gtk-js). Loaded only on
 * the system that uses it, so the others' icons aren't parsed at startup.
 */
async function macProvider(name: 'whitesur' | 'mactahoe'): Promise<ComponentType<ThemeProviderProps> | undefined> {
  // By name: the providers are new in gtk-js, and the released packages may not have them yet.
  const module: Record<string, unknown> =
    name === 'mactahoe' ? await import('@gtk-js/theme-mactahoe') : await import('@gtk-js/theme-whitesur');
  return module[name === 'mactahoe' ? 'MacTahoeProvider' : 'WhiteSurProvider'] as
    ComponentType<ThemeProviderProps> | undefined;
}

/** Loads `name`'s provider, or Adwaita's when the installed gtk-js doesn't have it. */
export async function loadTheme(name: ThemeName): Promise<Theme> {
  if (name !== 'adwaita') {
    const Provider = await macProvider(name);
    if (Provider) return { name, Provider };
    console.warn(`The installed gtk-js has no provider for the ${name} theme: using Adwaita.`);
  }
  return { name: 'adwaita', Provider: Adwaita };
}
