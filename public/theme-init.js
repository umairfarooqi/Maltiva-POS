try {
  const themeKey = 'maltiva-theme';
  const migrationKey = 'maltiva-theme-palette-v2';
  if (localStorage.getItem(migrationKey) !== 'complete') {
    if (localStorage.getItem(themeKey) === 'light') localStorage.setItem(themeKey, 'dark');
    localStorage.setItem(migrationKey, 'complete');
  }
  document.documentElement.dataset.theme = localStorage.getItem(themeKey) === 'light' ? 'light' : 'dark';
} catch { document.documentElement.dataset.theme = 'dark'; }
document.documentElement.style.colorScheme = document.documentElement.dataset.theme;
