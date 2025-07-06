import { promises as fs } from 'fs';
import { join, extname, basename } from 'path';
import exifr from 'exifr';

export async function scanFiles(sourcePath, includeExtensions, excludeExtensions, excludeFolders) {
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
      console.warn(`Warning: Could not scan directory ${dir}: ${error.message}`);
    }
  }
  
  await scan(sourcePath);
  return files;
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

export function generateTargetPath(date, cameraLabel, originalPath, destinationRoot) {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '_'); // HH_MM_SS
  
  const ext = extname(originalPath);
  const targetDir = join(destinationRoot, dateStr);
  const baseFilename = `${timeStr}_${cameraLabel}${ext}`;
  
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