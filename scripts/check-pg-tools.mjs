// npm run db:check-tools — verify pg_dump / pg_dumpall / psql are installed and report versions.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, c, findPgTool, main, toolMajorVersion } from './lib.mjs';

main(async () => {
  if (fs.existsSync(path.join(ROOT, '.env.local'))) process.loadEnvFile?.(path.join(ROOT, '.env.local'));
  let missing = false;
  for (const name of ['pg_dump', 'pg_dumpall', 'psql']) {
    try {
      const bin = findPgTool(name);
      const { text } = await toolMajorVersion(bin);
      console.log(`${c.green('found')}    ${name.padEnd(10)} ${text}  ${c.dim(bin)}`);
    } catch {
      console.log(`${c.red('MISSING')}  ${name}`);
      missing = true;
    }
  }
  if (missing) {
    console.log(`
Install the PostgreSQL 17 command-line tools (no server needed), in PowerShell:

  winget install -e --id PostgreSQL.PostgreSQL.17 --override "--mode unattended --unattendedmodeui minimal --disable-components server,pgAdmin,stackbuilder"

Then either add C:\\Program Files\\PostgreSQL\\17\\bin to your PATH, or just rerun this check —
the scripts also look in C:\\Program Files\\PostgreSQL\\<version>\\bin automatically.`);
    process.exit(1);
  }
});
