import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import YAML from 'yaml'

const CONFIG_DIR = join(homedir(), '.cardingest', 'profiles')

export async function ensureConfigDir() {
  await fs.mkdir(CONFIG_DIR, { recursive: true })
}

export async function loadProfiles() {
  await ensureConfigDir()

  try {
    const files = await fs.readdir(CONFIG_DIR)
    const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))

    const profiles = {}

    for (const file of yamlFiles) {
      const filePath = join(CONFIG_DIR, file)
      const content = await fs.readFile(filePath, 'utf-8')
      const profile = YAML.parse(content)
      const name = file.replace(/\.(yaml|yml)$/, '')
      profiles[name] = { ...profile, name }
    }

    return profiles
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {}
    }
    throw error
  }
}

export async function saveProfile(name, profile) {
  await ensureConfigDir()
  const filePath = join(CONFIG_DIR, `${name}.yaml`)
  const content = YAML.stringify(profile)
  await fs.writeFile(filePath, content)
}

export function validateProfile(profile) {
  const required = ['sourcePath', 'destinationRoot', 'cameraLabel']
  const missing = required.filter(field => !profile[field])

  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`)
  }

  // Validate collision handling option
  if (profile.onCollision && !['rename', 'replace'].includes(profile.onCollision)) {
    throw new Error(`Invalid onCollision value: ${profile.onCollision}. Must be 'rename' or 'replace'`)
  }

  // Validate transfer mode option
  if (profile.transferMode && !['copy', 'move'].includes(profile.transferMode)) {
    throw new Error(`Invalid transferMode value: ${profile.transferMode}. Must be 'copy' or 'move'`)
  }

  // Validate log level option
  if (profile.logLevel && !['debug', 'info', 'warn', 'error'].includes(profile.logLevel)) {
    throw new Error(`Invalid logLevel value: ${profile.logLevel}. Must be 'debug', 'info', 'warn', or 'error'`)
  }

  // Handle backward compatibility for copyFiles
  let transferMode = profile.transferMode
  if (!transferMode && profile.copyFiles !== undefined) {
    transferMode = profile.copyFiles ? 'copy' : 'move'
  }
  if (!transferMode) {
    transferMode = 'copy' // default to copy
  }

  return {
    sourcePath: profile.sourcePath,
    destinationRoot: profile.destinationRoot,
    cameraLabel: profile.cameraLabel,
    includeExtensions: profile.includeExtensions || [
      '.jpg',
      '.jpeg',
      '.raw',
      '.cr2',
      '.nef',
      '.arw',
      '.dng',
      '.mp4',
      '.mov',
      '.avi',
      '.srt',
    ],
    excludeExtensions: profile.excludeExtensions || [],
    excludeFolders: profile.excludeFolders || [],
    transferMode: transferMode,
    useExifDate: profile.useExifDate !== false, // default to true
    onCollision: profile.onCollision || 'rename', // default to rename
    logLevel: profile.logLevel || 'info', // default to info
    maintainFileRelationships: profile.maintainFileRelationships !== false, // default to true
    primaryExtensions: profile.primaryExtensions || [
      '.mp4',
      '.mov',
      '.avi',
      '.jpg',
      '.jpeg',
      '.heic',
      '.raw',
      '.cr2',
      '.nef',
      '.arw',
      '.dng',
    ],
    companionExtensions: profile.companionExtensions || ['.srt', '.lrf', '.xmp'],
    filenameFormat: profile.filenameFormat || '{date}_{time}_{camera}', // default format: YYYY-MM-DD_HH-MM-SS_camera
  }
}

export { CONFIG_DIR }
