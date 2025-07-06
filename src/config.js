import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import YAML from 'yaml';

const CONFIG_DIR = join(homedir(), '.cardingest', 'profiles');

export async function ensureConfigDir() {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

export async function loadProfiles() {
  await ensureConfigDir();
  
  try {
    const files = await fs.readdir(CONFIG_DIR);
    const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    
    const profiles = {};
    
    for (const file of yamlFiles) {
      const filePath = join(CONFIG_DIR, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const profile = YAML.parse(content);
      const name = file.replace(/\.(yaml|yml)$/, '');
      profiles[name] = { ...profile, name };
    }
    
    return profiles;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

export async function saveProfile(name, profile) {
  await ensureConfigDir();
  const filePath = join(CONFIG_DIR, `${name}.yaml`);
  const content = YAML.stringify(profile);
  await fs.writeFile(filePath, content);
}

export function validateProfile(profile) {
  const required = ['sourcePath', 'destinationRoot', 'cameraLabel'];
  const missing = required.filter(field => !profile[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
  
  return {
    sourcePath: profile.sourcePath,
    destinationRoot: profile.destinationRoot,
    cameraLabel: profile.cameraLabel,
    includeExtensions: profile.includeExtensions || ['.jpg', '.jpeg', '.raw', '.cr2', '.nef', '.arw', '.dng', '.mp4', '.mov', '.avi'],
    excludeExtensions: profile.excludeExtensions || [],
    excludeFolders: profile.excludeFolders || [],
    copyFiles: profile.copyFiles !== false, // default to true
    useExifDate: profile.useExifDate !== false, // default to true
  };
}

export { CONFIG_DIR };