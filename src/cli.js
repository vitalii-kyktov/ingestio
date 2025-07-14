import prompts from 'prompts'
import { loadProfiles, validateProfile, saveProfile } from './config.js'
import {
  scanFiles,
  extractFileDate,
  generateTargetPath,
  findAvailableFilename,
  processFile,
  processFileGroup,
} from './fileProcessor.js'
import { hasGpsData, writeGpsData, parseCoordinateString, formatCoordinates } from './gpsHandler.js'
import Logger from './logger.js'

export async function main() {
  try {
    const args = parseArgs()

    if (args.help) {
      showHelp()
      return
    }

    const profiles = await loadProfiles()

    if (Object.keys(profiles).length === 0) {
      console.log("No profiles found. Let's create your first profile.")
      await createProfile()
      return
    }

    let selectedProfile

    if (args.profile) {
      selectedProfile = profiles[args.profile]
      if (!selectedProfile) {
        console.error(`Profile "${args.profile}" not found.`)
        console.log('Available profiles:', Object.keys(profiles).join(', '))
        process.exit(1)
      }
    } else {
      selectedProfile = await selectProfile(profiles)
      if (!selectedProfile) {
        console.log('No profile selected. Exiting.')
        return
      }
    }

    let finalProfile

    if (args.headless) {
      finalProfile = selectedProfile
      if (args.source) finalProfile.sourcePath = args.source
      if (args.destination) finalProfile.destinationRoot = args.destination
      if (args.camera) finalProfile.cameraLabel = args.camera
      if (args.onCollision) finalProfile.onCollision = args.onCollision
      if (args.logLevel) finalProfile.logLevel = args.logLevel
      if (args.gpsCoordinates) {
        const parsed = parseCoordinateString(args.gpsCoordinates)
        if (parsed.error) {
          console.error(`Invalid GPS coordinates: ${parsed.error}`)
          process.exit(1)
        }
        finalProfile.gpsCoordinates = { latitude: parsed.latitude, longitude: parsed.longitude }
        finalProfile.addGpsData = true
      }
      if (args.gpsSkip) finalProfile.addGpsData = false
    } else {
      finalProfile = await promptOverrides(selectedProfile)
    }

    const validatedProfile = validateProfile(finalProfile)

    // Create logger instance
    const reportFile = args.report === true ? null : args.report
    const logger = new Logger(validatedProfile.logLevel, reportFile)

    await runImport(validatedProfile, args.headless, logger)
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

function parseArgs() {
  const args = process.argv.slice(2)
  const parsed = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--help' || arg === '-h') {
      parsed.help = true
    } else if (arg === '--headless') {
      parsed.headless = true
    } else if (arg === '--profile' || arg === '-p') {
      parsed.profile = args[++i]
    } else if (arg === '--source' || arg === '-s') {
      parsed.source = args[++i]
    } else if (arg === '--destination' || arg === '-d') {
      parsed.destination = args[++i]
    } else if (arg === '--camera' || arg === '-c') {
      parsed.camera = args[++i]
    } else if (arg === '--on-collision') {
      parsed.onCollision = args[++i]
    } else if (arg === '--log-level' || arg === '-l') {
      parsed.logLevel = args[++i]
    } else if (arg === '--report' || arg === '-r') {
      parsed.report = args[++i] || true
    } else if (arg === '--gps' || arg === '-g') {
      parsed.gpsCoordinates = args[++i]
    } else if (arg === '--gps-skip') {
      parsed.gpsSkip = true
    }
  }

  return parsed
}

function showHelp() {
  console.log(`
ingestio - Import raw media from SD cards

Usage:
  ingestio [options]

Options:
  -h, --help              Show this help message
  -p, --profile <name>    Use specific profile
  -s, --source <path>     Override source path
  -d, --destination <path> Override destination path
  -c, --camera <label>    Override camera label
  --on-collision <action> File collision handling: 'rename' or 'replace'
  -l, --log-level <level> Set log level: 'debug', 'info', 'warn', 'error'
  -r, --report [filename] Generate import report (optional filename)
  -g, --gps <coordinates> Add GPS coordinates to files missing location data
                          Format: "latitude,longitude" (e.g., "40.7128,-74.0060")
  --gps-skip              Skip GPS coordinate prompting (for headless mode)
  --headless              Run without interactive prompts

Examples:
  ingestio                           # Interactive mode
  ingestio -p dji-drone             # Use specific profile
  ingestio -p dji-drone --headless  # Headless mode
  ingestio -p dji-drone -s /Volumes/SD_CARD --headless
  ingestio -p dji-drone --on-collision replace --headless
  ingestio -p dji-drone --log-level debug --report my-import.txt
  ingestio -p dji-drone --gps "40.7128,-74.0060" --headless
  ingestio -p dji-drone --gps-skip --headless

Profiles are stored in ~/.ingestio/profiles/
`)
}

async function selectProfile(profiles) {
  const choices = Object.values(profiles).map(p => ({
    title: p.name,
    description: `${p.cameraLabel} → ${p.destinationRoot}`,
    value: p,
  }))

  choices.push({
    title: 'Create new profile',
    description: 'Define a new import profile',
    value: 'new',
  })

  const response = await prompts({
    type: 'select',
    name: 'profile',
    message: 'Select import profile:',
    choices,
  })

  if (response.profile === 'new') {
    return await createProfile()
  }

  return response.profile
}

async function createProfile() {
  const questions = [
    {
      type: 'text',
      name: 'name',
      message: 'Profile name:',
      validate: name => name.length > 0 || 'Name is required',
    },
    {
      type: 'text',
      name: 'sourcePath',
      message: 'Source path (SD card mount):',
      initial: '/Volumes/',
      validate: path => path.length > 0 || 'Source path is required',
    },
    {
      type: 'text',
      name: 'destinationRoot',
      message: 'Destination root:',
      initial: process.env.HOME + '/Footage',
      validate: path => path.length > 0 || 'Destination is required',
    },
    {
      type: 'text',
      name: 'cameraLabel',
      message: 'Camera label for filenames:',
      validate: label => label.length > 0 || 'Camera label is required',
    },
    {
      type: 'select',
      name: 'transferMode',
      message: 'File transfer mode:',
      choices: [
        { title: 'Copy (preserve originals)', value: 'copy' },
        { title: 'Move (remove from source)', value: 'move' },
      ],
      initial: 0,
    },
    {
      type: 'confirm',
      name: 'useExifDate',
      message: 'Use EXIF date when available?',
      initial: true,
    },
    {
      type: 'select',
      name: 'onCollision',
      message: 'File collision handling:',
      choices: [
        { title: 'Rename (add suffix)', value: 'rename' },
        { title: 'Replace existing file', value: 'replace' },
      ],
      initial: 0,
    },
    {
      type: 'select',
      name: 'logLevel',
      message: 'Log level:',
      choices: [
        { title: 'Info (default)', value: 'info' },
        { title: 'Debug (verbose)', value: 'debug' },
        { title: 'Warn (warnings only)', value: 'warn' },
        { title: 'Error (errors only)', value: 'error' },
      ],
      initial: 0,
    },
    {
      type: 'confirm',
      name: 'addGpsData',
      message: 'Add GPS coordinates to files missing location data by default?',
      initial: false,
    },
  ]

  const profile = await prompts(questions)

  if (profile.name) {
    await saveProfile(profile.name, profile)
    console.log(`Profile "${profile.name}" created successfully.`)
    return profile
  }

  return null
}

async function promptOverrides(profile) {
  const questions = [
    {
      type: 'text',
      name: 'sourcePath',
      message: 'Source path:',
      initial: profile.sourcePath,
    },
    {
      type: 'text',
      name: 'destinationRoot',
      message: 'Destination root:',
      initial: profile.destinationRoot,
    },
    {
      type: 'text',
      name: 'cameraLabel',
      message: 'Camera label:',
      initial: profile.cameraLabel,
    },
    {
      type: 'confirm',
      name: 'addGpsData',
      message: 'Add GPS coordinates to files missing location data?',
      initial: profile.addGpsData || false,
    },
  ]

  const overrides = await prompts(questions)

  // If user wants to add GPS data, prompt for coordinates
  if (overrides.addGpsData) {
    const gpsQuestion = {
      type: 'text',
      name: 'gpsCoordinates',
      message: 'Enter GPS coordinates (latitude,longitude):',
      initial: profile.gpsCoordinates ? `${profile.gpsCoordinates.latitude},${profile.gpsCoordinates.longitude}` : '',
      validate: input => {
        if (!input.trim()) return 'GPS coordinates are required'
        const parsed = parseCoordinateString(input)
        return parsed.error || true
      },
    }

    const gpsAnswer = await prompts(gpsQuestion)
    if (gpsAnswer.gpsCoordinates) {
      const parsed = parseCoordinateString(gpsAnswer.gpsCoordinates)
      overrides.gpsCoordinates = { latitude: parsed.latitude, longitude: parsed.longitude }
    }
  }

  return { ...profile, ...overrides }
}

async function runImport(profile, headless = false, logger) {
  logger.setProfile(profile)

  logger.info('Starting import with profile:', {
    name: profile.name || 'Custom',
    source: profile.sourcePath,
    destination: profile.destinationRoot,
    camera: profile.cameraLabel,
    transferMode: profile.transferMode,
    logLevel: profile.logLevel,
    addGpsData: profile.addGpsData,
    gpsCoordinates: profile.gpsCoordinates
      ? formatCoordinates(profile.gpsCoordinates.latitude, profile.gpsCoordinates.longitude)
      : undefined,
  })

  if (!headless) {
    const confirm = await prompts({
      type: 'confirm',
      name: 'proceed',
      message: 'Proceed with import?',
      initial: true,
    })

    if (!confirm.proceed) {
      logger.info('Import cancelled by user')
      return
    }
  }

  logger.info('Scanning files...')
  const fileGroups = await scanFiles(
    profile.sourcePath,
    profile.includeExtensions,
    profile.excludeExtensions,
    profile.excludeFolders,
    profile.maintainFileRelationships,
    profile.primaryExtensions,
    profile.companionExtensions
  )

  if (fileGroups.length === 0) {
    logger.info('No files found to import')
    return
  }

  // Count total files across all groups
  const totalFiles = fileGroups.reduce((total, group) => total + group.files.length, 0)

  if (profile.maintainFileRelationships) {
    logger.info(`Found ${totalFiles} files in ${fileGroups.length} groups to import`)
  } else {
    logger.info(`Found ${totalFiles} files to import`)
  }

  logger.startFileProcessing(totalFiles)

  // Calculate total size for progress tracking
  let totalSize = 0
  for (const group of fileGroups) {
    for (const file of group.files) {
      try {
        const stats = await import('fs').then(fs => fs.promises.stat(file))
        totalSize += stats.size
      } catch (error) {
        logger.warn(`Could not get file size for ${file}`, { error: error.message })
      }
    }
  }
  logger.updateTotalSize(totalSize)

  let processed = 0
  let errors = 0
  let gpsAdded = 0

  for (const group of fileGroups) {
    const startTime = Date.now()

    try {
      // Extract date from primary file
      const date = await extractFileDate(group.primaryFile, profile.useExifDate)

      // Process the entire group with consistent naming
      const results = await processFileGroup(
        group,
        date,
        profile.cameraLabel,
        profile.destinationRoot,
        profile.onCollision,
        profile.transferMode,
        profile.filenameFormat
      )

      // Log each file transfer in the group and handle GPS data
      for (const result of results) {
        const stats = await import('fs').then(fs => fs.promises.stat(result.targetPath))
        const duration = Date.now() - startTime

        logger.logFileTransfer(
          result.sourcePath,
          result.targetPath,
          profile.transferMode,
          stats.size,
          duration,
          true,
          result.isCompanion
        )

        // Add GPS data if requested and file doesn't have it
        if (profile.addGpsData && profile.gpsCoordinates) {
          try {
            const hasGps = await hasGpsData(result.targetPath)
            if (!hasGps) {
              await writeGpsData(result.targetPath, profile.gpsCoordinates.latitude, profile.gpsCoordinates.longitude)
              logger.debug(`Added GPS coordinates to ${result.targetPath}`, {
                coordinates: formatCoordinates(profile.gpsCoordinates.latitude, profile.gpsCoordinates.longitude),
              })
              gpsAdded++
            } else {
              logger.debug(`Skipped GPS for ${result.targetPath} (already has location data)`)
            }
          } catch (error) {
            logger.warn(`Failed to add GPS data to ${result.targetPath}`, { error: error.message })
          }
        }

        processed++
      }

      if (processed % 10 === 0 || processed === totalFiles) {
        logger.info(`Progress: ${processed}/${totalFiles} files processed`)
      }
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error(`Error processing group starting with ${group.primaryFile}`, { error: error.message, duration })
      errors += group.files.length
      processed += group.files.length
    }
  }

  logger.info('Import completed', {
    processed,
    errors,
    gpsAdded,
    operation: profile.transferMode,
    totalSize: logger.formatBytes(totalSize),
  })

  // Generate and save report
  const report = await logger.generateReport()

  if (logger.level === 'info' || logger.level === 'debug') {
    console.log('\n' + '='.repeat(50))
    console.log('IMPORT SUMMARY')
    console.log('='.repeat(50))
    console.log(`Files processed: ${processed}`)
    console.log(`Errors: ${errors}`)
    if (gpsAdded > 0) {
      console.log(`GPS coordinates added: ${gpsAdded}`)
    }
    console.log(`Operation: ${profile.transferMode === 'copy' ? 'Copy' : 'Move'}`)
    console.log(`Total size: ${logger.formatBytes(totalSize)}`)
    if (logger.reportFile) {
      console.log(`Report saved to: ~/.ingestio/reports/${logger.reportFile}`)
    }
  }
}
