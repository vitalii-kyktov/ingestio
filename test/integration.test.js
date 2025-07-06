import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { 
  scanFiles, 
  extractFileDate, 
  generateTargetPath, 
  findAvailableFilename,
  processFile 
} from '../src/fileProcessor.js';

describe('Integration Tests', () => {
  let tempDir;
  let sourceDir;
  let destDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'cardingest-integration-'));
    sourceDir = join(tempDir, 'source');
    destDir = join(tempDir, 'destination');
    
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(destDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('DJI Camera Import Simulation', () => {
    it('should handle mixed JPG/DNG pairs correctly', async () => {
      // Simulate the DJI Osmo 4 file structure and naming
      const dcimDir = join(sourceDir, 'DCIM', 'DJI_001');
      await fs.mkdir(dcimDir, { recursive: true });

      // Create paired files that simulate the real scenario
      const baseTime = new Date('2025-07-05T14:12:54Z');
      const files = [
        { name: 'DJI_20250705141254_0019_D.JPG', type: 'jpg' },
        { name: 'DJI_20250705141254_0019_D.DNG', type: 'dng' },
        { name: 'DJI_20250705141300_0020_D.JPG', type: 'jpg' },
        { name: 'DJI_20250705141300_0020_D.DNG', type: 'dng' },
      ];

      // Create the files with appropriate content and timestamps
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = join(dcimDir, file.name);
        
        // Create mock content
        const content = file.type === 'jpg' ? 'fake JPG content' : 'fake DNG content';
        await fs.writeFile(filePath, content);
        
        // Set timestamp - both JPG and DNG should have the same base time
        // (since our fix ensures they extract the same time)
        const fileTime = new Date(baseTime.getTime() + Math.floor(i / 2) * 6000); // 6 seconds apart for each pair
        
        await fs.utimes(filePath, fileTime, fileTime);
      }

      // Test the scanning process
      const includeExtensions = ['.jpg', '.dng'];
      const excludeExtensions = [];
      const excludeFolders = [];

      const foundFiles = await scanFiles(sourceDir, includeExtensions, excludeExtensions, excludeFolders);
      expect(foundFiles).toHaveLength(4);

      // Test date extraction and path generation for each file
      const processedFiles = [];
      for (const filePath of foundFiles) {
        const date = await extractFileDate(filePath, true);
        const target = generateTargetPath(date, 'DJI_Osmo4', filePath, destDir);
        
        processedFiles.push({
          original: filePath,
          date,
          targetDir: target.targetDir,
          filename: target.baseFilename
        });
      }

      // Group files by their original pair
      const pairs = {};
      for (const file of processedFiles) {
        const baseName = file.original.split('_').slice(0, 2).join('_'); // DJI_20250705141254
        if (!pairs[baseName]) pairs[baseName] = {};
        
        const extension = file.original.split('.').pop().toLowerCase();
        pairs[baseName][extension] = file;
      }

      // Verify that paired files have similar timestamps
      for (const [baseName, pair] of Object.entries(pairs)) {
        if (pair.jpg && pair.dng) {
          // Extract time components from filenames
          const jpgTime = pair.jpg.filename.split('_').slice(0, 3).join('_');
          const dngTime = pair.dng.filename.split('_').slice(0, 3).join('_');
          
          // Parse times to compare (format: HH_MM_SS)
          const jpgSeconds = jpgTime.split('_').map(Number);
          const dngSeconds = dngTime.split('_').map(Number);
          
          const jpgTotalSeconds = jpgSeconds[0] * 3600 + jpgSeconds[1] * 60 + jpgSeconds[2];
          const dngTotalSeconds = dngSeconds[0] * 3600 + dngSeconds[1] * 60 + dngSeconds[2];
          
          // The times should be very close (within a few seconds)
          // Before the fix, these would differ by an hour (3600 seconds)
          expect(Math.abs(jpgTotalSeconds - dngTotalSeconds)).toBeLessThan(10);
          
          // Both should be in the same target directory
          expect(pair.jpg.targetDir).toBe(pair.dng.targetDir);
        }
      }
    });

    it('should handle complete import workflow with error recovery', async () => {
      // Create a complex directory structure with various file types and edge cases
      const structures = [
        'DCIM/DJI_001',
        'MISC/thumbnails',
        '.Trashes'
      ];

      for (const dir of structures) {
        await fs.mkdir(join(sourceDir, dir), { recursive: true });
      }

      // Create various test files
      const testFiles = [
        { path: 'DCIM/DJI_001/normal.jpg', content: 'normal JPG', time: '2025-07-05T10:00:00Z' },
        { path: 'DCIM/DJI_001/normal.dng', content: 'normal DNG', time: '2025-07-05T10:00:01Z' },
        { path: 'DCIM/DJI_001/corrupted.jpg', content: 'corrupted', time: '2025-07-06T11:00:00Z' }, // Different date
        { path: 'MISC/thumbnails/thumb.jpg', content: 'thumbnail', time: '2025-07-05T12:00:00Z' },
        { path: '.Trashes/deleted.jpg', content: 'deleted', time: '2025-07-05T13:00:00Z' },
      ];

      for (const file of testFiles) {
        const filePath = join(sourceDir, file.path);
        await fs.writeFile(filePath, file.content);
        await fs.utimes(filePath, new Date(file.time), new Date(file.time));
      }

      // Run the complete workflow
      const includeExtensions = ['.jpg', '.dng'];
      const excludeExtensions = [];
      const excludeFolders = ['thumbnails', '.Trashes'];

      // Step 1: Scan files
      const foundFiles = await scanFiles(sourceDir, includeExtensions, excludeExtensions, excludeFolders);
      
      // Should find only the DCIM files, excluding thumbnails and .Trashes
      expect(foundFiles).toHaveLength(3);
      expect(foundFiles.some(f => f.includes('thumb.jpg'))).toBe(false);
      expect(foundFiles.some(f => f.includes('deleted.jpg'))).toBe(false);

      // Step 2: Process each file
      let successCount = 0;
      let errorCount = 0;

      for (const filePath of foundFiles) {
        try {
          const date = await extractFileDate(filePath, true);
          const target = generateTargetPath(date, 'TestCam', filePath, destDir);
          const finalFilename = await findAvailableFilename(target.targetDir, target.baseFilename);
          
          await processFile(filePath, target.targetDir, finalFilename, true);
          successCount++;
        } catch (error) {
          errorCount++;
        }
      }

      // Verify results
      expect(successCount).toBe(3);
      expect(errorCount).toBe(0);

      // Check that files were created in the destination
      const createdFiles = await scanFiles(destDir, ['.jpg', '.dng'], [], []);
      expect(createdFiles).toHaveLength(3);

      // Verify directory structure
      const dateDirs = await fs.readdir(destDir);
      expect(dateDirs.filter(d => d.match(/^\d{4}-\d{2}-\d{2}$/))).toHaveLength(2); // 2 different dates
    });

    it('should maintain file integrity during copy operations', async () => {
      // Test that files are copied correctly without corruption
      const testFile = join(sourceDir, 'integrity-test.jpg');
      const originalContent = 'test content for integrity verification';
      
      await fs.writeFile(testFile, originalContent);
      
      const date = await extractFileDate(testFile, true);
      const target = generateTargetPath(date, 'IntegrityTest', testFile, destDir);
      const filename = await findAvailableFilename(target.targetDir, target.baseFilename);
      
      const resultPath = await processFile(testFile, target.targetDir, filename, true);
      
      // Verify original file still exists (copy operation)
      expect(await fs.readFile(testFile, 'utf-8')).toBe(originalContent);
      
      // Verify copied file has same content
      expect(await fs.readFile(resultPath, 'utf-8')).toBe(originalContent);
      
      // Verify file stats are preserved reasonably
      const originalStats = await fs.stat(testFile);
      const copiedStats = await fs.stat(resultPath);
      
      expect(copiedStats.size).toBe(originalStats.size);
    });
  });

  describe('Transfer Mode Integration Tests', () => {
    it('should copy files when transferMode is copy', async () => {
      // Create test files
      const testDir = join(sourceDir, 'DCIM');
      await fs.mkdir(testDir, { recursive: true });
      
      const testFile = join(testDir, 'IMG_001.jpg');
      const originalContent = 'test image content';
      await fs.writeFile(testFile, originalContent);

      // Simulate copy mode processing
      const files = await scanFiles(sourceDir, ['.jpg'], [], []);
      expect(files).toHaveLength(1);

      const date = await extractFileDate(testFile, false);
      const { targetDir, baseFilename } = generateTargetPath(date, 'TestCam', testFile, destDir);
      const finalFilename = await findAvailableFilename(targetDir, baseFilename);
      
      // Process as copy (transferMode: copy -> copyFiles: true)
      const resultPath = await processFile(testFile, targetDir, finalFilename, true);

      // Verify both files exist (copy operation)
      expect(await fs.readFile(testFile, 'utf-8')).toBe(originalContent);
      expect(await fs.readFile(resultPath, 'utf-8')).toBe(originalContent);
    });

    it('should move files when transferMode is move', async () => {
      // Create test files
      const testDir = join(sourceDir, 'DCIM');
      await fs.mkdir(testDir, { recursive: true });
      
      const testFile = join(testDir, 'IMG_002.jpg');
      const originalContent = 'test image content for move';
      await fs.writeFile(testFile, originalContent);

      // Simulate move mode processing
      const files = await scanFiles(sourceDir, ['.jpg'], [], []);
      expect(files).toHaveLength(1);

      const date = await extractFileDate(testFile, false);
      const { targetDir, baseFilename } = generateTargetPath(date, 'TestCam', testFile, destDir);
      const finalFilename = await findAvailableFilename(targetDir, baseFilename);
      
      // Process as move (transferMode: move -> copyFiles: false)
      const resultPath = await processFile(testFile, targetDir, finalFilename, false);

      // Verify source file doesn't exist, target file does (move operation)
      expect(fs.access(testFile)).rejects.toThrow();
      expect(await fs.readFile(resultPath, 'utf-8')).toBe(originalContent);
    });
  });

  describe('Collision Handling Integration Tests', () => {
    it('should rename files when onCollision is rename', async () => {
      // Create test files
      const testDir = join(sourceDir, 'DCIM');
      await fs.mkdir(testDir, { recursive: true });
      
      const testFile1 = join(testDir, 'IMG_001.jpg');
      const testFile2 = join(testDir, 'IMG_002.jpg');
      await fs.writeFile(testFile1, 'content1');
      await fs.writeFile(testFile2, 'content2');

      // Set same modification time to create collision scenario
      const sameDate = new Date('2025-07-06T12:00:00Z');
      await fs.utimes(testFile1, sameDate, sameDate);
      await fs.utimes(testFile2, sameDate, sameDate);

      // Process first file
      const { targetDir, baseFilename } = generateTargetPath(sameDate, 'TestCam', testFile1, destDir);
      const filename1 = await findAvailableFilename(targetDir, baseFilename);
      await processFile(testFile1, targetDir, filename1, true);

      // Process second file (should get renamed due to collision)
      const filename2 = await findAvailableFilename(targetDir, baseFilename);
      await processFile(testFile2, targetDir, filename2, true);

      // Verify both files exist with different names
      const targetFiles = await fs.readdir(targetDir);
      expect(targetFiles).toHaveLength(2);
      expect(targetFiles.some(f => f === baseFilename)).toBe(true);
      expect(targetFiles.some(f => f.includes('_1.'))).toBe(true);
    });

    it('should replace files when onCollision is replace', async () => {
      // Create test files
      const testDir = join(sourceDir, 'DCIM');
      await fs.mkdir(testDir, { recursive: true });
      
      const testFile1 = join(testDir, 'IMG_001.jpg');
      const testFile2 = join(testDir, 'IMG_002.jpg');
      await fs.writeFile(testFile1, 'original content');
      await fs.writeFile(testFile2, 'replacement content');

      // Set same modification time to create collision scenario
      const sameDate = new Date('2025-07-06T12:00:00Z');
      await fs.utimes(testFile1, sameDate, sameDate);
      await fs.utimes(testFile2, sameDate, sameDate);

      // Process first file
      const { targetDir, baseFilename } = generateTargetPath(sameDate, 'TestCam', testFile1, destDir);
      await processFile(testFile1, targetDir, baseFilename, true); // Use baseFilename directly (replace mode)

      // Process second file (should replace the first)
      await processFile(testFile2, targetDir, baseFilename, true); // Use baseFilename directly (replace mode)

      // Verify only one file exists with the replacement content
      const targetFiles = await fs.readdir(targetDir);
      expect(targetFiles).toHaveLength(1);
      expect(targetFiles[0]).toBe(baseFilename);
      
      const resultPath = join(targetDir, baseFilename);
      expect(await fs.readFile(resultPath, 'utf-8')).toBe('replacement content');
    });
  });

  describe('Resource Fork Filtering Integration', () => {
    it('should skip resource fork files during scanning', async () => {
      // Create mixed file structure with resource forks
      const dcimDir = join(sourceDir, 'DCIM', '100MEDIA');
      await fs.mkdir(dcimDir, { recursive: true });

      // Create files including resource forks (typical macOS scenario)
      const files = [
        'DJI_0001.MOV',
        '._DJI_0001.MOV',  // Resource fork
        'DJI_0002.JPG',
        '._DJI_0002.JPG',  // Resource fork
        'DJI_0003.DNG',
        '._DJI_0003.DNG'   // Resource fork
      ];

      for (const filename of files) {
        const content = filename.startsWith('._') ? 'resource fork data' : 'actual file content';
        await fs.writeFile(join(dcimDir, filename), content);
      }

      // Scan files (should exclude resource forks)
      const scannedFiles = await scanFiles(sourceDir, ['.mov', '.jpg', '.dng'], [], []);

      // Should only find 3 actual files, not the 3 resource forks
      expect(scannedFiles).toHaveLength(3);
      expect(scannedFiles.every(f => !f.includes('/._'))).toBe(true);
      expect(scannedFiles.some(f => f.includes('DJI_0001.MOV'))).toBe(true);
      expect(scannedFiles.some(f => f.includes('DJI_0002.JPG'))).toBe(true);
      expect(scannedFiles.some(f => f.includes('DJI_0003.DNG'))).toBe(true);
    });
  });

  describe('Cross-Device Move Integration', () => {
    it('should handle cross-device moves gracefully', async () => {
      // Create test file
      const testDir = join(sourceDir, 'DCIM');
      await fs.mkdir(testDir, { recursive: true });
      
      const testFile = join(testDir, 'cross_device_test.jpg');
      const originalContent = 'content for cross device test';
      await fs.writeFile(testFile, originalContent);

      // Mock fs.rename to simulate cross-device scenario
      const originalRename = fs.rename;
      const mockRename = async (src, dest) => {
        const error = new Error('cross-device link not permitted');
        error.code = 'EXDEV';
        throw error;
      };

      fs.rename = mockRename;

      try {
        const date = await extractFileDate(testFile, false);
        const { targetDir, baseFilename } = generateTargetPath(date, 'TestCam', testFile, destDir);
        
        // Should succeed with copy-then-delete fallback
        const resultPath = await processFile(testFile, targetDir, baseFilename, false);

        // Verify move completed (source gone, target exists)
        expect(fs.access(testFile)).rejects.toThrow();
        expect(await fs.readFile(resultPath, 'utf-8')).toBe(originalContent);
      } finally {
        // Restore original fs.rename
        fs.rename = originalRename;
      }
    });
  });
});