import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeTheme, getTheme, setTheme, THEME_STORAGE_KEY } from '../src/services/theme';
import { SettingsView } from '../src/components/SettingsView';
import { INITIAL_PRINTER_SETTINGS, INITIAL_USERS } from '../src/data/initialData';

beforeEach(() => { localStorage.clear(); initializeTheme(); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); initializeTheme(); });

describe('device theme preference', () => {
  it('defaults to dark and ignores invalid preferences', () => {
    expect(getTheme()).toBe('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'invalid'); initializeTheme();
    expect(getTheme()).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });
  it('migrates the previous brown theme once while allowing a later Light choice', () => {
    localStorage.clear(); // beforeEach already marked the migration complete
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    document.documentElement.dataset.theme = 'light'; initializeTheme();
    expect(getTheme()).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    setTheme('light');
    initializeTheme();
    expect(getTheme()).toBe('light');
  });
  it('switches immediately in Settings without saving business settings', async () => {
    const save = vi.fn(); const user = userEvent.setup();
    render(<SettingsView settings={INITIAL_PRINTER_SETTINGS} currentUser={INITIAL_USERS[0]} onSaveSettings={save} onOpenTestPrint={vi.fn()} />);
    const toggle = screen.getByRole('switch', { name: 'Dark mode' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    toggle.focus(); await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(getTheme()).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(save).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'dark' })));
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });
  it('synchronizes customer-display windows and handles cleared preferences', () => {
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'light' }));
    expect(getTheme()).toBe('light');
    window.dispatchEvent(new StorageEvent('storage', { key: null, newValue: null }));
    expect(getTheme()).toBe('dark');
  });
  it('keeps rendering and switching when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
    expect(() => initializeTheme()).not.toThrow();
    expect(getTheme()).toBe('dark');
    expect(() => setTheme('light')).not.toThrow();
    expect(getTheme()).toBe('light');
  });
});

const css = readFileSync('public/pos-theme.css', 'utf8');
function luminance(hex: string) {
  const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb.reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
}
function contrast(a: string, b: string) {
  const [low, high] = [luminance(a), luminance(b)].sort((a, b) => a - b);
  return (high + .05) / (low + .05);
}
describe('paper palette', () => {
  it('keeps the on-screen receipt preview identical to printed output', () => {
    const vars = (body: string) => [...body.matchAll(/(--pos-[\w-]+):\s*([^;]+);/g)].map(match => `${match[1]}:${match[2].trim()}`).sort();
    const paper = css.match(/\.theme-paper\s*\{([^}]+)\}/)?.[1];
    const print = css.match(/@media print\s*\{[^{]+\{([^}]+)\}/)?.[1];
    expect(paper, '.theme-paper block').toBeDefined();
    expect(print, '@media print block').toBeDefined();
    expect(vars(paper!)).toEqual(vars(print!));
  });
});

describe('theme contrast', () => {
  it.each(['dark', 'light'])('keeps text, status labels and controls readable in %s', theme => {
    const selector = theme === 'dark' ? /:root\s*\{([^}]+)\}/ : /:root\[data-theme="light"\]\s*\{([^}]+)\}/;
    const block = css.match(selector)?.[1];
    expect(block, `${theme} theme variables`).toBeDefined();
    const colors = Object.fromEntries([...block!.matchAll(/--pos-([\w-]+): (#[\da-f]+);/g)].map(match => [match[1], match[2]]));
    for (const text of ['text', 'secondary', 'muted', 'accent']) {
      for (const surface of ['surface', 'canvas', 'raised', 'inset']) expect(contrast(colors[text], colors[surface]), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
    for (const status of ['success', 'warning', 'danger', 'info', 'reserved']) expect(contrast(colors[`${status}-text`], colors[`${status}-bg`])).toBeGreaterThanOrEqual(4.5);
    for (const state of ['action', 'action-hover', 'action-pressed']) {
      expect(contrast(colors['action-text'], colors[state]), state).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(colors.control, colors.inset)).toBeGreaterThanOrEqual(3);
    expect(contrast(colors.accent, colors.selected), 'accent on selected').toBeGreaterThanOrEqual(4.5);
    expect(colors.selected, 'selected differs from raised').not.toBe(colors.raised);
    expect(colors['warning-text'], 'warning differs from primary action').not.toBe(colors.action);
    expect(colors.action, 'primary differs from destructive').not.toBe(colors['danger-action']);
  });
});
