/**
 * Blocking theme bootstrap — runs before paint to avoid flash.
 * Keep in sync with STORAGE_KEY in ThemeToggle.jsx.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k='visio-theme';var s=localStorage.getItem(k);var t=(s==='light'||s==='dark')?s:'light';document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;
