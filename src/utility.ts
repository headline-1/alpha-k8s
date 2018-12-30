import { exec, readFile, remove, writeFile } from '@lpha/core';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

export const mkdtemp = promisify(fs.mkdtemp);

export const createKeyPair = (path: string, name: string) => exec(
  `ssh-keygen -t rsa -b 4096 -C '${name}' -f '${path}'`,
  { silent: false }
);

export const apply = async (input: string) => {
  const dir = await mkdtemp('apply');
  const location = path.join(dir, 'apply.yaml');
  await writeFile(location, input, 'utf8');
  await exec(`kubectl apply -f '${location}'`, { silent: false });
  await remove(dir);
};

export const applyFiles = async (files: string[]) => {
  for (const file of files) {
    await exec(`kubectl apply -f '${file}'`, { silent: false });
  }
};

export const getSecret = async (name: string) => {
  const secrets = await exec(
    `kubectl -n kube-system describe secret $(kubectl -n kube-system get secret | grep ${name} | awk '{print $1}')`,
    { silent: true }
  );
  const secretsObject: Record<string, string> = {};
  secrets.split('\n').forEach((line) => {
    const [key, value] = line.split(':').map(item => item.trim());
    secretsObject[key] = value;
  });
  return secretsObject;
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
