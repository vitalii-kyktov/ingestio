import { promises as fs } from 'fs';
import { join, extname, basename, dirname } from 'path';
import exifr from 'exifr';

export async function scanFiles(sourcePath, includeExtensions, excludeExtensions, excludeFolders, maintainFileRelationships, primaryExtensions, companionExtensions) {
  const files = [];
  
  async function scan(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        
        if (entry.isDirectory()) {
          if (!excludeFolders.includes(entry.name)) {
            await scan(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          
          // Skip macOS resource fork files
          if (entry.name.startsWith('._')) {
            continue;
          }
          
          if (includeExtensions.includes(ext) && !excludeExtensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      // Use console.warn for backward compatibility, but logger will be used from CLI
      console.warn(`Warning: Could not scan directory ${dir}: ${error.message}`);
    }
  }
  
  await scan(sourcePath);
  
  // Group files by relationships if enabled
  if (maintainFileRelationships) {
    return groupRelatedFiles(files, primaryExtensions, companionExtensions);
  }
  
  // Return individual files wrapped in single-file groups for consistent processing
  return files.map(file => ({
    files: [file],
    primaryFile: file,
    companionFiles: []
  }));
}

export async function extractFileDate(filePath, useExifDate) {
  if (useExifDate) {
    try {
      const exifData = await exifr.parse(filePath);
      if (exifData?.DateTimeOriginal) {
        return new Date(exifData.DateTimeOriginal);
      }
      if (exifData?.DateTime) {
        return new Date(exifData.DateTime);
      }
    } catch (error) {
      // Fallback to exiftool for DNG files or other files that exifr can't handle
    }
    
    // Try exiftool as fallback, especially useful for DNG files
    try {
      const { spawn } = await import('child_process');
      const { promisify } = await import('util');
      
      const result = await new Promise((resolve, reject) => {
        const process = spawn('exiftool', ['-DateTimeOriginal', '-s3', filePath]);
        let output = '';
        let error = '';
        
        process.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        process.stderr.on('data', (data) => {
          error += data.toString();
        });
        
        process.on('close', (code) => {
          if (code === 0 && output.trim()) {
            resolve(output.trim());
          } else {
            reject(new Error(error || 'exiftool failed'));
          }
        });
      });
      
      if (result) {
        // Parse exiftool date format: "YYYY:MM:DD HH:MM:SS"
        const dateStr = result.replace(/(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    } catch (error) {
      // Fallback to file mtime if both exifr and exiftool fail
    }
  }
  
  const stats = await fs.stat(filePath);
  return stats.mtime;
}

export function generateTargetPath(date, cameraLabel, originalPath, destinationRoot, filenameFormat = '{date}_{time}_{camera}') {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
  
  const ext = extname(originalPath);
  const targetDir = join(destinationRoot, dateStr);
  
  // Generate filename from format template
  const baseFilename = filenameFormat
    .replace('{date}', dateStr)
    .replace('{time}', timeStr)
    .replace('{camera}', cameraLabel) + ext;
  
  return { targetDir, baseFilename };
}

export async function findAvailableFilename(targetDir, baseFilename) {
  const ext = extname(baseFilename);
  const nameWithoutExt = basename(baseFilename, ext);
  
  let counter = 1;
  let filename = baseFilename;
  
  while (true) {
    const fullPath = join(targetDir, filename);
    try {
      await fs.access(fullPath);
      filename = `${nameWithoutExt}_${counter}${ext}`;
      counter++;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return filename;
      }
      throw error;
    }
  }
}

export async function processFile(sourcePath, targetDir, filename, copyFiles) {
  await fs.mkdir(targetDir, { recursive: true });
  
  const targetPath = join(targetDir, filename);
  
  if (copyFiles) {
    await fs.copyFile(sourcePath, targetPath);
  } else {
    try {
      // Try rename first (faster for same filesystem)
      await fs.rename(sourcePath, targetPath);
    } catch (error) {
      if (error.code === 'EXDEV') {
        // Cross-device move: copy then delete
        await fs.copyFile(sourcePath, targetPath);
        await fs.unlink(sourcePath);
      } else {
        throw error;
      }
    }
  }
  
  return targetPath;
}

export function groupRelatedFiles(files, primaryExtensions, companionExtensions) {
  const groups = new Map();
  
  // Group files by their base name (without extension)
  for (const file of files) {
    const filename = basename(file);
    const ext = extname(filename).toLowerCase();
    const baseName = filename.slice(0, filename.length - ext.length);
    const dir = dirname(file);
    const groupKey = join(dir, baseName);
    
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey).push(file);
  }
  
  // Convert groups to structured format
  const fileGroups = [];
  
  for (const [groupKey, groupFiles] of groups) {
    const primaryFiles = groupFiles.filter(file => {
      const ext = extname(file).toLowerCase();
      return primaryExtensions.includes(ext);
    });
    
    const companionFiles = groupFiles.filter(file => {
      const ext = extname(file).toLowerCase();
      return companionExtensions.includes(ext);
    });
    
    // If we have no primary files, treat each companion file as a standalone group
    if (primaryFiles.length === 0) {
      for (const companionFile of companionFiles) {
        fileGroups.push({
          files: [companionFile],
          primaryFile: companionFile,
          companionFiles: []
        });
      }
    } else if (primaryFiles.length === 1) {
      // Single primary file with companions
      fileGroups.push({
        files: [primaryFiles[0], ...companionFiles],
        primaryFile: primaryFiles[0],
        companionFiles: companionFiles
      });
    } else {
      // Multiple primary files - create separate groups for each
      for (const primary of primaryFiles) {
        fileGroups.push({
          files: [primary, ...companionFiles],
          primaryFile: primary,
          companionFiles: companionFiles
        });
      }
    }
  }
  
  return fileGroups;
}

export async function processFileGroup(group, date, cameraLabel, destinationRoot, onCollision, transferMode, filenameFormat) {
  const results = [];
  
  // Generate target path based on the primary file
  const { targetDir, baseFilename } = generateTargetPath(date, cameraLabel, group.primaryFile, destinationRoot, filenameFormat);
  
  // Get base filename without extension for consistent naming
  const baseFilenameWithoutExt = basename(baseFilename, extname(baseFilename));
  
  // Process each file in the group
  for (const file of group.files) {
    const ext = extname(file);
    const groupFilename = `${baseFilenameWithoutExt}${ext}`;
    
    let finalFilename;
    if (onCollision === 'replace') {
      finalFilename = groupFilename;
    } else {
      finalFilename = await findAvailableFilename(targetDir, groupFilename);
    }
    
    const targetPath = await processFile(file, targetDir, finalFilename, transferMode === 'copy');
    results.push({
      sourcePath: file,
      targetPath: targetPath,
      isCompanion: group.companionFiles.includes(file)
    });
  }
  
  return results;
}