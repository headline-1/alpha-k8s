import { exec } from 'child_process';
import * as fs from 'fs';
import { promisify } from 'util';

export const writeFile = promisify(fs.writeFile);
export const readFile = promisify(fs.readFile);
export const mkdir = promisify(fs.mkdir);

export const run = (command: string, silent?: boolean): Promise<string> => new Promise<string>((resolve, reject) => {
  const child = exec(command, { windowsHide: true });
  let result = '';
  child.stdout.on('data', chunk => result += chunk);
  child.stderr.on('data', chunk => result += chunk);
  if (!silent) {
    child.stderr.pipe(process.stderr);
    child.stdout.pipe(process.stdout);
  }
  child.on('exit', (code, signal) => code === 0
    ? resolve(result.toString())
    : reject(new Error(`${command} exited with code ${code}:${signal}\nLog:\n${result}`))
  );
});

export const createKeyPair = (path: string, name: string) => run(
  `ssh-keygen -t rsa -b 4096 -C '${name}' -f '${path}'`,
  false
);

export const applyFile = (file: string) => run(`kubectl apply -f '${file}'`);
export const applyFiles = async (files: string[]) => {
  for (const file of files) {
    await applyFile(file);
  }
};

export const getSecret = async (name: string) => {
  const secrets = await run(
    `kubectl -n kube-system describe secret $(kubectl -n kube-system get secret | grep ${name} | awk '{print $1}')`,
    true
  );
  const secretsObject: Record<string, string> = {};
  secrets.split('\n').forEach((line) => {
    const [key, value] = line.split(':').map(item => item.trim());
    secretsObject[key] = value;
  });
  return secretsObject;
};

export const getDocument = async (sourcePath: string, values?: Record<string, string>) => {
  let data = await readFile(sourcePath, { encoding: 'utf8' });
  if (values) {
    Object.entries(values).forEach(([key, value]) => {
      data = data.replace(new RegExp(`\\\${${key}}`, 'g'), value);
    });
  }
  return data;
};