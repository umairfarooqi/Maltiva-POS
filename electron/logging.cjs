const fs = require('node:fs');
const path = require('node:path');
function createLogger(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'desktop.log');
  return function log(event, details = {}) {
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 1024 * 1024) {
        for (let index = 2; index >= 1; index--) {
          const source = index === 1 ? file : `${file}.1`;
          const target = `${file}.${index}`;
          if (fs.existsSync(source)) fs.renameSync(source, target);
        }
      }
      fs.appendFileSync(file, `${new Date().toISOString()} ${event} ${JSON.stringify(details)}\n`);
    } catch { /* A logging failure must not terminate checkout. */ }
  };
}
module.exports = { createLogger };
