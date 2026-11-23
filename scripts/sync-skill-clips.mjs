import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { getDriveLinks, skillClipPath } from '../js/data.js';

const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const entries = await json('data/mods.json');
for (const entry of entries) {
  const character = typeof entry === 'string' ? await json('data/characters/' + entry + '.json') : entry;
  for (const skill of character.skills || []) {
    const links = getDriveLinks(skill.clip);
    if (!links) continue;
    const path = skillClipPath(skill.clip);
    const destination = new URL(path, root);
    if (!process.argv.includes('--refresh') && await stat(destination).catch(() => null)) continue;
    const download = new URL('https://drive.usercontent.google.com/download');
    download.search = new URL(links.download).search;
    download.searchParams.set('confirm', 't');
    const response = await fetch(download);
    if (!response.ok) throw new Error(character.slug + '/' + skill.key + ': HTTP ' + response.status);
    await mkdir(new URL('.', destination), { recursive: true });
    const temp = new URL(destination.href + '.' + randomUUID() + '.tmp');
    try {
      await pipeline(response.body, createWriteStream(temp));
      const file = await open(temp);
      try {
        const header = Buffer.alloc(12);
        await file.read(header, 0, 12, 0);
        if (header.toString('ascii', 4, 8) !== 'ftyp') throw new Error(character.slug + '/' + skill.key + ': expected a public MP4 file');
      } finally { await file.close(); }
      await rename(temp, destination);
      console.log(character.slug, skill.key, path);
    } finally { await rm(temp, { force: true }); }
  }
}
