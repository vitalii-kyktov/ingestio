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
      // Fallback to file mtime if EXIF fails
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
    await fs.rename(sourcePath, targetPath);
  }
  
  return targetPath;
}