import { exec, makeDir, readFile, remove, writeFile } from '@lpha/core';
import * as crypto from 'crypto';
import * as path from 'path';

export const createKeyPair = (path: string, name: string) => exec(
  `ssh-keygen -t rsa -b 4096 -C '${name}' -f '${path}'`,
  { silent: false }
);

export const random = (length: number = 10) => crypto
  .randomBytes(Math.ceil(length * 0.75))
  .toString('base64')
  .replace(/[^a-zA-Z0-9]/g, '');

export const apply = async (input: string) => {
  const dirName = path.resolve(`apply-${random()}`);
  await makeDir(dirName);
  const location = path.join(dirName, 'apply.yaml');
  await writeFile(location, input, 'utf8');
  await exec(`kubectl apply -f '${location}'`, { silent: false });
  await remove(dirName);
};

export const applyFiles = async (files: string[]) => {
  for (const file of files) {
    await exec(`kubectl apply -f '${file}'`, { silent: false });
  }
};

export const getDocument = async (sourcePath: string, values?: Record<string, string>) => {
  let data = await readFile(sourcePath, 'utf8');
  if (values) {
    Object.entries(values).forEach(([key, value]) => {
      data = data.replace(new RegExp(`\\\${${key}}`, 'g'), value);
    });
  }
  return data;
};
