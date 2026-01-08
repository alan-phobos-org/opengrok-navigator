// Debug logging module for OpenGrok Navigator
// Provides configurable logging levels and namespaced output

const OGDebug = (function() {
  'use strict';

  const LOG_LEVELS = {
    OFF: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 3,
    DEBUG: 4,
    TRACE: 5
  };

  const LEVEL_NAMES = ['OFF', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];
  const LEVEL_STYLES = {
    ERROR: 'color: #ff4444; font-weight: bold',
    WARN: 'color: #ffaa00; font-weight: bold',
    INFO: 'color: #4444ff',
    DEBUG: 'color: #888888',
    TRACE: 'color: #aaaaaa; font-style: italic'
  };

  let currentLevel = LOG_LEVELS.OFF;
  let isInitialized = false;

  // Load log level from storage
  async function init() {
    if (isInitialized) return;

    try {
      const result = await new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
          chrome.storage.sync.get({ debugLogLevel: 'OFF' }, resolve);
        } else {
          // Fallback for contexts without chrome.storage
          resolve({ debugLogLevel: localStorage.getItem('og_debugLogLevel') || 'OFF' });
        }
      });

      const levelName = result.debugLogLevel || 'OFF';
      currentLevel = LOG_LEVELS[levelName] !== undefined ? LOG_LEVELS[levelName] : LOG_LEVELS.OFF;
      isInitialized = true;

      if (currentLevel > LOG_LEVELS.OFF) {
        console.log(
          '%c[OG-NAV] Debug logging enabled at level: ' + levelName,
          'color: #00aa00; font-weight: bold'
        );
      }
    } catch (e) {
      // Silent fail - logging not critical
      currentLevel = LOG_LEVELS.OFF;
    }
  }

  // Listen for storage changes to update log level dynamically
  function setupStorageListener() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync' && changes.debugLogLevel) {
          const levelName = changes.debugLogLevel.newValue || 'OFF';
          currentLevel = LOG_LEVELS[levelName] !== undefined ? LOG_LEVELS[levelName] : LOG_LEVELS.OFF;

          if (currentLevel > LOG_LEVELS.OFF) {
            console.log(
              '%c[OG-NAV] Debug level changed to: ' + levelName,
              'color: #00aa00; font-weight: bold'
            );
          }
        }
      });
    }
  }

  function formatArgs(namespace, args) {
    const prefix = namespace ? `[OG-NAV:${namespace}]` : '[OG-NAV]';
    return [prefix, ...args];
  }

  function log(level, namespace, ...args) {
    if (currentLevel < level) return;

    const levelName = LEVEL_NAMES[level];
    const style = LEVEL_STYLES[levelName] || '';
    const prefix = namespace ? `[OG-NAV:${namespace}]` : '[OG-NAV]';

    const consoleMethod = level === LOG_LEVELS.ERROR ? 'error' :
                         level === LOG_LEVELS.WARN ? 'warn' :
                         level === LOG_LEVELS.DEBUG || level === LOG_LEVELS.TRACE ? 'debug' :
                         'log';

    console[consoleMethod](`%c${prefix} [${levelName}]`, style, ...args);
  }

  // Create a namespaced logger
  function createLogger(namespace) {
    return {
      error: (...args) => log(LOG_LEVELS.ERROR, namespace, ...args),
      warn: (...args) => log(LOG_LEVELS.WARN, namespace, ...args),
      info: (...args) => log(LOG_LEVELS.INFO, namespace, ...args),
      debug: (...args) => log(LOG_LEVELS.DEBUG, namespace, ...args),
      trace: (...args) => log(LOG_LEVELS.TRACE, namespace, ...args),

      // Log with data object for structured logging
      data: (level, message, data) => {
        if (currentLevel < LOG_LEVELS[level]) return;
        log(LOG_LEVELS[level], namespace, message, data);
      },

      // Time a function execution
      time: (label) => {
        if (currentLevel >= LOG_LEVELS.DEBUG) {
          console.time(`[OG-NAV:${namespace}] ${label}`);
        }
      },
      timeEnd: (label) => {
        if (currentLevel >= LOG_LEVELS.DEBUG) {
          console.timeEnd(`[OG-NAV:${namespace}] ${label}`);
        }
      },

      // Group related logs
      group: (label) => {
        if (currentLevel >= LOG_LEVELS.DEBUG) {
          console.group(`[OG-NAV:${namespace}] ${label}`);
        }
      },
      groupEnd: () => {
        if (currentLevel >= LOG_LEVELS.DEBUG) {
          console.groupEnd();
        }
      },

      // Check if a level is enabled
      isEnabled: (level) => currentLevel >= LOG_LEVELS[level]
    };
  }

  // Initialize on load
  init();
  setupStorageListener();

  return {
    LOG_LEVELS,
    LEVEL_NAMES,
    init,
    createLogger,
    setLevel: (level) => {
      if (typeof level === 'string') {
        currentLevel = LOG_LEVELS[level] !== undefined ? LOG_LEVELS[level] : LOG_LEVELS.OFF;
      } else {
        currentLevel = level;
      }
    },
    getLevel: () => currentLevel,
    getLevelName: () => LEVEL_NAMES[currentLevel],

    // Convenience methods for quick logging without namespace
    error: (...args) => log(LOG_LEVELS.ERROR, null, ...args),
    warn: (...args) => log(LOG_LEVELS.WARN, null, ...args),
    info: (...args) => log(LOG_LEVELS.INFO, null, ...args),
    debug: (...args) => log(LOG_LEVELS.DEBUG, null, ...args),
    trace: (...args) => log(LOG_LEVELS.TRACE, null, ...args)
  };
})();

// Export for module contexts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OGDebug;
}
