import prompts from 'prompts';
import { loadProfiles, validateProfile, saveProfile } from './config.js';
import { scanFiles, extractFileDate, generateTargetPath, findAvailableFilename, processFile } from './fileProcessor.js';

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
    } else {
      finalProfile = await promptOverrides(selectedProfile);
    }
    
    const validatedProfile = validateProfile(finalProfile);
    
    await runImport(validatedProfile, args.headless);
    
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
  --headless              Run without interactive prompts

Examples:
  cardingest                           # Interactive mode
  cardingest -p dji-drone             # Use specific profile
  cardingest -p dji-drone --headless  # Headless mode
  cardingest -p dji-drone -s /Volumes/SD_CARD --headless

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
      type: 'confirm',
      name: 'copyFiles',
      message: 'Copy files (vs move)?',
      initial: true
    },
    {
      type: 'confirm',
      name: 'useExifDate',
      message: 'Use EXIF date when available?',
      initial: true
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

async function runImport(profile, headless = false) {
  console.log('Starting import with profile:', profile.name || 'Custom');
  console.log('Source:', profile.sourcePath);
  console.log('Destination:', profile.destinationRoot);
  console.log('Camera:', profile.cameraLabel);
  
  if (!headless) {
    const confirm = await prompts({
      type: 'confirm',
      name: 'proceed',
      message: 'Proceed with import?',
      initial: true
    });
    
    if (!confirm.proceed) {
      console.log('Import cancelled.');
      return;
    }
  }
  
  console.log('Scanning files...');
  const files = await scanFiles(
    profile.sourcePath,
    profile.includeExtensions,
    profile.excludeExtensions,
    profile.excludeFolders
  );
  
  if (files.length === 0) {
    console.log('No files found to import.');
    return;
  }
  
  console.log(`Found ${files.length} files to import.`);
  
  let processed = 0;
  let errors = 0;
  
  for (const file of files) {
    try {
      const date = await extractFileDate(file, profile.useExifDate);
      const { targetDir, baseFilename } = generateTargetPath(date, profile.cameraLabel, file, profile.destinationRoot);
      const finalFilename = await findAvailableFilename(targetDir, baseFilename);
      
      await processFile(file, targetDir, finalFilename, profile.copyFiles);
      
      processed++;
      
      if (processed % 10 === 0 || processed === files.length) {
        console.log(`Progress: ${processed}/${files.length} files processed`);
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error.message);
      errors++;
    }
  }
  
  console.log(`\\nImport completed:`);
  console.log(`- Files processed: ${processed}`);
  console.log(`- Errors: ${errors}`);
  console.log(`- Operation: ${profile.copyFiles ? 'Copy' : 'Move'}`);
}