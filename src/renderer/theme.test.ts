import { describe, expect, test, vi } from 'vitest';

vi.mock('@gtk-js/adwaita', () => ({ AdwaitaProvider: () => null }));
vi.mock('@gtk-js/icons-adwaita', () => ({}));

const platform = (os: string, version: string, theme: string | null = null) => ({ os, version, theme });

describe('platformTheme', async () => {
  const { platformTheme } = await import('./theme');

  test("is macOS's own look on macOS, Tahoe's from macOS 26", () => {
    expect(platformTheme(platform('darwin', '26.0.1'))).toBe('mactahoe');
    expect(platformTheme(platform('darwin', '27.1'))).toBe('mactahoe');
    expect(platformTheme(platform('darwin', '15.6.1'))).toBe('whitesur');
    expect(platformTheme(platform('darwin', '11.0'))).toBe('whitesur');
  });

  test('is Adwaita elsewhere', () => {
    expect(platformTheme(platform('linux', '6.18.44'))).toBe('adwaita');
    expect(platformTheme(platform('win32', '10.0.26100'))).toBe('adwaita');
  });

  test('$ALTO_THEME picks a known theme anywhere', () => {
    expect(platformTheme(platform('linux', '6.18', 'mactahoe'))).toBe('mactahoe');
    expect(platformTheme(platform('darwin', '26.0', 'adwaita'))).toBe('adwaita');
    expect(platformTheme(platform('darwin', '26.0', 'nonsense'))).toBe('mactahoe');
  });
});

describe('loadTheme', () => {
  test("loads a macOS theme's provider from its package", async () => {
    vi.resetModules();
    const MacTahoeProvider = () => null;
    vi.doMock('@gtk-js/theme-mactahoe', () => ({ MacTahoeProvider }));
    const { loadTheme } = await import('./theme');
    expect(await loadTheme('mactahoe')).toEqual({ name: 'mactahoe', Provider: MacTahoeProvider });
  });

  test("falls back to Adwaita when the installed gtk-js hasn't the provider", async () => {
    vi.resetModules();
    // Released before the providers: the theme class only.
    vi.doMock('@gtk-js/theme-whitesur', () => ({ WhiteSurTheme: class {}, WhiteSurProvider: undefined }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { loadTheme } = await import('./theme');
    expect((await loadTheme('whitesur')).name).toBe('adwaita');
    expect(warn).toHaveBeenCalledOnce();
  });
});
