import prompts from 'prompts';
import { loadProfiles, validateProfile, saveProfile } from './config.js';
import { scanFiles, extractFileDate, generateTargetPath, findAvailableFilename, processFile } from './fileProcessor.js';
import Logger from './logger.js';

export async function main() {
  try {
    const args = parseArgs();
    
    if (args.help) {
      showHelp();
      return;
    }
    
    const profiles = await loadProfiles();
    
    if (Object.keys(profiles).length === 0) {
      console.log('No profiles found. Let\'s create your first profile.');
      await createProfile();
      return;
    }
    
    let selectedProfile;
    
    if (args.profile) {
      selectedProfile = profiles[args.profile];
      if (!selectedProfile) {
        console.error(`Profile "${args.profile}" not found.`);
        console.log('Available profiles:', Object.keys(profiles).join(', '));
        process.exit(1);
      }
    } else {
      selectedProfile = await selectProfile(profiles);
      if (!selectedProfile) {
        console.log('No profile selected. Exiting.');
        return;
      }
    }
    
    let finalProfile;
    
    if (args.headless) {
      finalProfile = selectedProfile;
      if (args.source) finalProfile.sourcePath = args.source;
      if (args.destination) finalProfile.destinationRoot = args.destination;
      if (args.camera) finalProfile.cameraLabel = args.camera;
      if (args.onCollision) finalProfile.onCollision = args.onCollision;
      if (args.logLevel) finalProfile.logLevel = args.logLevel;
    } else {
      finalProfile = await promptOverrides(selectedProfile);
    }
    
    const validatedProfile = validateProfile(finalProfile);
    
    // Create logger instance
    const reportFile = args.report === true ? null : args.report;
    const logger = new Logger(validatedProfile.logLevel, reportFile);
    
    await runImport(validatedProfile, args.headless, logger);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--headless') {
      parsed.headless = true;
    } else if (arg === '--profile' || arg === '-p') {
      parsed.profile = args[++i];
    } else if (arg === '--source' || arg === '-s') {
      parsed.source = args[++i];
    } else if (arg === '--destination' || arg === '-d') {
      parsed.destination = args[++i];
    } else if (arg === '--camera' || arg === '-c') {
      parsed.camera = args[++i];
    } else if (arg === '--on-collision') {
      parsed.onCollision = args[++i];
    } else if (arg === '--log-level' || arg === '-l') {
      parsed.logLevel = args[++i];
    } else if (arg === '--report' || arg === '-r') {
      parsed.report = args[++i] || true;
    }
  }
  
  return parsed;
}

function showHelp() {
  console.log(`
cardingest - Import raw media from SD cards

Usage:
  cardingest [options]

Options:
  -h, --help              Show this help message
  -p, --profile <name>    Use specific profile
  -s, --source <path>     Override source path
  -d, --destination <path> Override destination path
  -c, --camera <label>    Override camera label
  --on-collision <action> File collision handling: 'rename' or 'replace'
  -l, --log-level <level> Set log level: 'debug', 'info', 'warn', 'error'
  -r, --report [filename] Generate import report (optional filename)
  --headless              Run without interactive prompts

Examples:
  cardingest                           # Interactive mode
  cardingest -p dji-drone             # Use specific profile
  cardingest -p dji-drone --headless  # Headless mode
  cardingest -p dji-drone -s /Volumes/SD_CARD --headless
  cardingest -p dji-drone --on-collision replace --headless
  cardingest -p dji-drone --log-level debug --report my-import.txt

Profiles are stored in ~/.cardingest/profiles/
`);
}

async function selectProfile(profiles) {
  const choices = Object.values(profiles).map(p => ({
    title: p.name,
    description: `${p.cameraLabel} → ${p.destinationRoot}`,
    value: p
  }));
  
  choices.push({
    title: 'Create new profile',
    description: 'Define a new import profile',
    value: 'new'
  });
  
  const response = await prompts({
    type: 'select',
    name: 'profile',
    message: 'Select import profile:',
    choices
  });
  
  if (response.profile === 'new') {
    return await createProfile();
  }
  
  return response.profile;
}

async function createProfile() {
  const questions = [
    {
      type: 'text',
      name: 'name',
      message: 'Profile name:',
      validate: name => name.length > 0 || 'Name is required'
    },
    {
      type: 'text',
      name: 'sourcePath',
      message: 'Source path (SD card mount):',
      initial: '/Volumes/',
      validate: path => path.length > 0 || 'Source path is required'
    },
    {
      type: 'text',
      name: 'destinationRoot',
      message: 'Destination root:',
      initial: process.env.HOME + '/Footage',
      validate: path => path.length > 0 || 'Destination is required'
    },
    {
      type: 'text',
      name: 'cameraLabel',
      message: 'Camera label for filenames:',
      validate: label => label.length > 0 || 'Camera label is required'
    },
    {
      type: 'select',
      name: 'transferMode',
      message: 'File transfer mode:',
      choices: [
        { title: 'Copy (preserve originals)', value: 'copy' },
        { title: 'Move (remove from source)', value: 'move' }
      ],
      initial: 0
    },
    {
      type: 'confirm',
      name: 'useExifDate',
      message: 'Use EXIF date when available?',
      initial: true
    },
    {
      type: 'select',
      name: 'onCollision',
      message: 'File collision handling:',
      choices: [
        { title: 'Rename (add suffix)', value: 'rename' },
        { title: 'Replace existing file', value: 'replace' }
      ],
      initial: 0
    },
    {
      type: 'select',
      name: 'logLevel',
      message: 'Log level:',
      choices: [
        { title: 'Info (default)', value: 'info' },
        { title: 'Debug (verbose)', value: 'debug' },
        { title: 'Warn (warnings only)', value: 'warn' },
        { title: 'Error (errors only)', value: 'error' }
      ],
      initial: 0
    }
  ];
  
  const profile = await prompts(questions);
  
  if (profile.name) {
    await saveProfile(profile.name, profile);
    console.log(`Profile "${profile.name}" created successfully.`);
    return profile;
  }
  
  return null;
}

async function promptOverrides(profile) {
  const questions = [
    {
      type: 'text',
      name: 'sourcePath',
      message: 'Source path:',
      initial: profile.sourcePath
    },
    {
      type: 'text',
      name: 'destinationRoot',
      message: 'Destination root:',
      initial: profile.destinationRoot
    },
    {
      type: 'text',
      name: 'cameraLabel',
      message: 'Camera label:',
      initial: profile.cameraLabel
    }
  ];
  
  const overrides = await prompts(questions);
  
  return { ...profile, ...overrides };
}

async function runImport(profile, headless = false, logger) {
  logger.setProfile(profile);
  
  logger.info('Starting import with profile:', { 
    name: profile.name || 'Custom',
    source: profile.sourcePath,
    destination: profile.destinationRoot,
    camera: profile.cameraLabel,
    transferMode: profile.transferMode,
    logLevel: profile.logLevel
  });
  
  if (!headless) {
    const confirm = await prompts({
      type: 'confirm',
      name: 'proceed',
      message: 'Proceed with import?',
      initial: true
    });
    
    if (!confirm.proceed) {
      logger.info('Import cancelled by user');
      return;
    }
  }
  
  logger.info('Scanning files...');
  const files = await scanFiles(
    profile.sourcePath,
    profile.includeExtensions,
    profile.excludeExtensions,
    profile.excludeFolders
  );
  
  if (files.length === 0) {
    logger.info('No files found to import');
    return;
  }
  
  logger.info(`Found ${files.length} files to import`);
  logger.startFileProcessing(files.length);
  
  // Calculate total size for progress tracking
  let totalSize = 0;
  for (const file of files) {
    try {
      const stats = await import('fs').then(fs => fs.promises.stat(file));
      totalSize += stats.size;
    } catch (error) {
      logger.warn(`Could not get file size for ${file}`, { error: error.message });
    }
  }
  logger.updateTotalSize(totalSize);
  
  let processed = 0;
  let errors = 0;
  
  for (const file of files) {
    const startTime = Date.now();
    
    try {
      const date = await extractFileDate(file, profile.useExifDate);
      const { targetDir, baseFilename } = generateTargetPath(date, profile.cameraLabel, file, profile.destinationRoot);
      
      let finalFilename;
      if (profile.onCollision === 'replace') {
        finalFilename = baseFilename;
      } else {
        finalFilename = await findAvailableFilename(targetDir, baseFilename);
      }
      
      const targetPath = await processFile(file, targetDir, finalFilename, profile.transferMode === 'copy');
      
      // Get file size and duration for logging
      const stats = await import('fs').then(fs => fs.promises.stat(targetPath));
      const duration = Date.now() - startTime;
      
      logger.logFileTransfer(
        file,
        targetPath,
        profile.transferMode,
        stats.size,
        duration,
        true
      );
      
      processed++;
      
      if (processed % 10 === 0 || processed === files.length) {
        logger.info(`Progress: ${processed}/${files.length} files processed`);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Error processing ${file}`, { error: error.message, duration });
      errors++;
    }
  }
  
  logger.info('Import completed', {
    processed,
    errors,
    operation: profile.transferMode,
    totalSize: logger.formatBytes(totalSize)
  });
  
  // Generate and save report
  const report = await logger.generateReport();
  
  if (logger.level === 'info' || logger.level === 'debug') {
    console.log('\n' + '='.repeat(50));
    console.log('IMPORT SUMMARY');
    console.log('='.repeat(50));
    console.log(`Files processed: ${processed}`);
    console.log(`Errors: ${errors}`);
    console.log(`Operation: ${profile.transferMode === 'copy' ? 'Copy' : 'Move'}`);
    console.log(`Total size: ${logger.formatBytes(totalSize)}`);
    if (logger.reportFile) {
      console.log(`Report saved to: ~/.cardingest/reports/${logger.reportFile}`);
    }
  }
}