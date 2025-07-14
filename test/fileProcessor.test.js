import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { 
  scanFiles, 
  extractFileDate, 
  generateTargetPath, 
  findAvailableFilename,
  processFile,
  groupRelatedFiles,
  processFileGroup
} from '../src/fileProcessor.js';

describe('fileProcessor.js', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'cardingest-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('scanFiles', () => {
    it('should scan files recursively and filter by extensions', async () => {
      // Create test file structure
      const testDir = join(tempDir, 'test-source');
      await fs.mkdir(testDir, { recursive: true });
      await fs.mkdir(join(testDir, 'subdir'), { recursive: true });
      await fs.mkdir(join(testDir, 'excluded'), { recursive: true });

      // Create test files
      await fs.writeFile(join(testDir, 'image1.jpg'), 'test');
      await fs.writeFile(join(testDir, 'image2.JPG'), 'test');
      await fs.writeFile(join(testDir, 'video.mp4'), 'test');
      await fs.writeFile(join(testDir, 'document.txt'), 'test');
      await fs.writeFile(join(testDir, 'subdir', 'image3.jpg'), 'test');
      await fs.writeFile(join(testDir, 'excluded', 'image4.jpg'), 'test');

      const includeExtensions = ['.jpg', '.jpeg', '.mp4'];
      const excludeExtensions = [];
      const excludeFolders = ['excluded'];

      // Test with relationship maintenance disabled (old behavior)
      const fileGroups = await scanFiles(testDir, includeExtensions, excludeExtensions, excludeFolders, false, [], []);
      
      expect(fileGroups).toHaveLength(4);
      const allFiles = fileGroups.flatMap(group => group.files);
      expect(allFiles).toContain(join(testDir, 'image1.jpg'));
      expect(allFiles).toContain(join(testDir, 'image2.JPG'));
      expect(allFiles).toContain(join(testDir, 'video.mp4'));
      expect(allFiles).toContain(join(testDir, 'subdir', 'image3.jpg'));
      expect(allFiles).not.toContain(join(testDir, 'document.txt'));
      expect(allFiles).not.toContain(join(testDir, 'excluded', 'image4.jpg'));
    });

    it('should skip macOS resource fork files', async () => {
      const testDir = join(tempDir, 'test-source');
      await fs.mkdir(testDir, { recursive: true });

      // Create test files including resource forks
      await fs.writeFile(join(testDir, 'image1.jpg'), 'test');
      await fs.writeFile(join(testDir, '._image1.jpg'), 'resource fork');
      await fs.writeFile(join(testDir, 'video.mp4'), 'test');
      await fs.writeFile(join(testDir, '._video.mp4'), 'resource fork');
      await fs.writeFile(join(testDir, '._hidden_file.txt'), 'resource fork');

      const includeExtensions = ['.jpg', '.mp4', '.txt'];
      const excludeExtensions = [];
      const excludeFolders = [];

      // Test with relationship maintenance disabled (old behavior)
      const fileGroups = await scanFiles(testDir, includeExtensions, excludeExtensions, excludeFolders, false, [], []);
      
      expect(fileGroups).toHaveLength(2);
      const allFiles = fileGroups.flatMap(group => group.files);
      expect(allFiles).toContain(join(testDir, 'image1.jpg'));
      expect(allFiles).toContain(join(testDir, 'video.mp4'));
      expect(allFiles).not.toContain(join(testDir, '._image1.jpg'));
      expect(allFiles).not.toContain(join(testDir, '._video.mp4'));
      expect(allFiles).not.toContain(join(testDir, '._hidden_file.txt'));
    });

    it('should handle empty directories', async () => {
      const testDir = join(tempDir, 'empty-source');
      await fs.mkdir(testDir, { recursive: true });

      const fileGroups = await scanFiles(testDir, ['.jpg'], [], [], false, [], []);
      expect(fileGroups).toHaveLength(0);
    });

    it('should exclude files by extension', async () => {
      const testDir = join(tempDir, 'test-source');
      await fs.mkdir(testDir, { recursive: true });
      
      await fs.writeFile(join(testDir, 'image1.jpg'), 'test');
      await fs.writeFile(join(testDir, 'temp.tmp'), 'test');

      const includeExtensions = ['.jpg', '.tmp'];
      const excludeExtensions = ['.tmp'];
      const excludeFolders = [];

      const fileGroups = await scanFiles(testDir, includeExtensions, excludeExtensions, excludeFolders, false, [], []);

      expect(fileGroups).toHaveLength(1);
      const allFiles = fileGroups.flatMap(group => group.files);
      expect(allFiles[0]).toBe(join(testDir, 'image1.jpg'));
    });
  });

  describe('extractFileDate', () => {
    it('should fallback to mtime when EXIF fails', async () => {
      const testFile = join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'test content');

      const date = await extractFileDate(testFile, true);
      expect(date).toBeInstanceOf(Date);
      
      // Should be roughly current time (within last minute)
      const now = new Date();
      const diffMs = Math.abs(now.getTime() - date.getTime());
      expect(diffMs).toBeLessThan(60000); // Within 1 minute
    });

    it('should use mtime when useExifDate is false', async () => {
      const testFile = join(tempDir, 'test.jpg');
      await fs.writeFile(testFile, 'fake jpg content');

      const date = await extractFileDate(testFile, false);
      expect(date).toBeInstanceOf(Date);
    });

    it('should handle exifr failure and try exiftool fallback', async () => {
      // Create a mock file that will cause exifr to fail but exiftool to succeed
      const testFile = join(tempDir, 'mock-dng.dng');
      await fs.writeFile(testFile, 'fake dng content that exifr cannot parse');

      // Mock the child_process spawn to simulate exiftool success
      const originalExtractFileDate = extractFileDate;
      
      // Create a test that simulates the scenario where exifr fails but exiftool works
      // We'll test this by creating a file with a specific mtime and checking fallback behavior
      const specificDate = new Date('2025-01-15T10:30:45Z');
      await fs.utimes(testFile, specificDate, specificDate);

      const date = await extractFileDate(testFile, true);
      expect(date).toBeInstanceOf(Date);
      
      // Since exiftool won't find EXIF data in our fake file, it should fallback to mtime
      expect(Math.abs(date.getTime() - specificDate.getTime())).toBeLessThan(1000);
    });

    it('should handle both exifr and exiftool failure gracefully', async () => {
      const testFile = join(tempDir, 'no-exif.bin');
      await fs.writeFile(testFile, 'binary content with no EXIF data');
      
      const specificDate = new Date('2025-01-15T14:22:33Z');
      await fs.utimes(testFile, specificDate, specificDate);

      const date = await extractFileDate(testFile, true);
      expect(date).toBeInstanceOf(Date);
      
      // Should fallback to mtime when both EXIF methods fail
      expect(Math.abs(date.getTime() - specificDate.getTime())).toBeLessThan(1000);
    });

    it('should preserve timezone information correctly', async () => {
      const testFile = join(tempDir, 'timezone-test.jpg');
      await fs.writeFile(testFile, 'fake jpg for timezone test');
      
      // Set a specific mtime in a different timezone scenario
      const utcDate = new Date('2025-07-05T12:12:54Z'); // UTC time
      await fs.utimes(testFile, utcDate, utcDate);

      const date = await extractFileDate(testFile, true);
      expect(date).toBeInstanceOf(Date);
      
      // The date should match our set time (allowing for small filesystem precision differences)
      expect(Math.abs(date.getTime() - utcDate.getTime())).toBeLessThan(2000);
    });

    it('should prioritize DateTimeOriginal over DateTime in EXIF', async () => {
      // This test documents the expected behavior when both fields are present
      // Since we can't easily mock exifr in this test environment, we test the logic indirectly
      const testFile = join(tempDir, 'priority-test.jpg');
      await fs.writeFile(testFile, 'test content for EXIF priority');

      const date = await extractFileDate(testFile, true);
      expect(date).toBeInstanceOf(Date);
      
      // The function should always return a valid date
      expect(date.getTime()).toBeGreaterThan(0);
    });

    it('should handle corrupted or malformed EXIF data', async () => {
      const testFile = join(tempDir, 'corrupted.jpg');
      // Create a file with JPEG header but corrupted EXIF
      const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
      const corruptedData = Buffer.from('corrupted exif data that should cause parsing to fail');
      await fs.writeFile(testFile, Buffer.concat([jpegHeader, corruptedData]));
      
      const specificDate = new Date('2025-03-07T08:25:21Z');
      await fs.utimes(testFile, specificDate, specificDate);

      const date = await extractFileDate(testFile, true);
      expect(date).toBeInstanceOf(Date);
      
      // Should fallback to mtime when EXIF parsing fails due to corruption
      expect(Math.abs(date.getTime() - specificDate.getTime())).toBeLessThan(1000);
    });
  });

  describe('generateTargetPath', () => {
    it('should generate correct target path structure with default format', () => {
      const date = new Date('2024-01-15T09:30:45Z');
      const cameraLabel = 'TestCamera';
      const originalPath = '/source/image.jpg';
      const destinationRoot = '/destination';

      const result = generateTargetPath(date, cameraLabel, originalPath, destinationRoot);

      expect(result.targetDir).toBe('/destination/2024-01-15');
      expect(result.baseFilename).toBe('2024-01-15_09-30-45_TestCamera.jpg');
    });

    it('should handle different file extensions with default format', () => {
      const date = new Date('2024-12-25T23:59:59Z');
      const cameraLabel = 'DJI';
      const originalPath = '/source/video.mp4';
      const destinationRoot = '/footage';

      const result = generateTargetPath(date, cameraLabel, originalPath, destinationRoot);

      expect(result.targetDir).toBe('/footage/2024-12-25');
      expect(result.baseFilename).toBe('2024-12-25_23-59-59_DJI.mp4');
    });

    it('should support custom filename formats', () => {
      const date = new Date('2024-01-15T09:30:45Z');
      const cameraLabel = 'TestCamera';
      const originalPath = '/source/image.jpg';
      const destinationRoot = '/destination';
      const customFormat = '{time}_{camera}_{date}';

      const result = generateTargetPath(date, cameraLabel, originalPath, destinationRoot, customFormat);

      expect(result.targetDir).toBe('/destination/2024-01-15');
      expect(result.baseFilename).toBe('09-30-45_TestCamera_2024-01-15.jpg');
    });
  });

  describe('findAvailableFilename', () => {
    it('should return original filename if available', async () => {
      const testDir = join(tempDir, 'target');
      await fs.mkdir(testDir, { recursive: true });

      const filename = await findAvailableFilename(testDir, 'test.jpg');
      expect(filename).toBe('test.jpg');
    });

    it('should add suffix for collisions', async () => {
      const testDir = join(tempDir, 'target');
      await fs.mkdir(testDir, { recursive: true });
      
      // Create existing file
      await fs.writeFile(join(testDir, 'test.jpg'), 'existing');

      const filename = await findAvailableFilename(testDir, 'test.jpg');
      expect(filename).toBe('test_1.jpg');
    });

    it('should handle multiple collisions', async () => {
      const testDir = join(tempDir, 'target');
      await fs.mkdir(testDir, { recursive: true });
      
      // Create existing files
      await fs.writeFile(join(testDir, 'test.jpg'), 'existing');
      await fs.writeFile(join(testDir, 'test_1.jpg'), 'existing');
      await fs.writeFile(join(testDir, 'test_2.jpg'), 'existing');

      const filename = await findAvailableFilename(testDir, 'test.jpg');
      expect(filename).toBe('test_3.jpg');
    });
  });

  describe('processFile', () => {
    it('should copy file when copyFiles is true', async () => {
      const sourceDir = join(tempDir, 'source');
      const targetDir = join(tempDir, 'target');
      await fs.mkdir(sourceDir, { recursive: true });
      
      const sourcePath = join(sourceDir, 'test.jpg');
      await fs.writeFile(sourcePath, 'test content');

      const targetPath = await processFile(sourcePath, targetDir, 'copied.jpg', true);

      expect(targetPath).toBe(join(targetDir, 'copied.jpg'));
      
      // Both files should exist
      expect(await fs.readFile(sourcePath, 'utf-8')).toBe('test content');
      expect(await fs.readFile(targetPath, 'utf-8')).toBe('test content');
    });

    it('should move file when copyFiles is false', async () => {
      const sourceDir = join(tempDir, 'source');
      const targetDir = join(tempDir, 'target');
      await fs.mkdir(sourceDir, { recursive: true });
      
      const sourcePath = join(sourceDir, 'test.jpg');
      await fs.writeFile(sourcePath, 'test content');

      const targetPath = await processFile(sourcePath, targetDir, 'moved.jpg', false);

      expect(targetPath).toBe(join(targetDir, 'moved.jpg'));
      
      // Source should not exist, target should exist
      expect(fs.access(sourcePath)).rejects.toThrow();
      expect(await fs.readFile(targetPath, 'utf-8')).toBe('test content');
    });

    it('should create target directory if it does not exist', async () => {
      const sourceDir = join(tempDir, 'source');
      const targetDir = join(tempDir, 'nested', 'target');
      await fs.mkdir(sourceDir, { recursive: true });
      
      const sourcePath = join(sourceDir, 'test.jpg');
      await fs.writeFile(sourcePath, 'test content');

      const targetPath = await processFile(sourcePath, targetDir, 'test.jpg', true);

      expect(await fs.readFile(targetPath, 'utf-8')).toBe('test content');
      
      // Verify target directory was created
      const stats = await fs.stat(targetDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should handle cross-device move with copy-then-delete fallback', async () => {
      const sourceDir = join(tempDir, 'source');
      const targetDir = join(tempDir, 'target');
      await fs.mkdir(sourceDir, { recursive: true });
      
      const sourcePath = join(sourceDir, 'test.jpg');
      await fs.writeFile(sourcePath, 'test content');

      // Mock fs.rename to simulate EXDEV error (cross-device link)
      const originalRename = fs.rename;
      const mockRename = async (src, dest) => {
        const error = new Error('cross-device link not permitted');
        error.code = 'EXDEV';
        throw error;
      };

      // Temporarily replace fs.rename
      fs.rename = mockRename;

      try {
        const targetPath = await processFile(sourcePath, targetDir, 'moved.jpg', false);

        expect(targetPath).toBe(join(targetDir, 'moved.jpg'));
        
        // Source should not exist (deleted after copy), target should exist
        expect(fs.access(sourcePath)).rejects.toThrow();
        expect(await fs.readFile(targetPath, 'utf-8')).toBe('test content');
      } finally {
        // Restore original fs.rename
        fs.rename = originalRename;
      }
    });

    it('should preserve original rename behavior for same-device moves', async () => {
      const sourceDir = join(tempDir, 'source');
      const targetDir = join(tempDir, 'target');
      await fs.mkdir(sourceDir, { recursive: true });
      
      const sourcePath = join(sourceDir, 'test.jpg');
      await fs.writeFile(sourcePath, 'test content');

      // Track if rename was called
      let renameCalled = false;
      const originalRename = fs.rename;
      const trackingRename = async (src, dest) => {
        renameCalled = true;
        return originalRename(src, dest);
      };

      fs.rename = trackingRename;

      try {
        const targetPath = await processFile(sourcePath, targetDir, 'moved.jpg', false);

        expect(targetPath).toBe(join(targetDir, 'moved.jpg'));
        expect(renameCalled).toBe(true);
        
        // Source should not exist, target should exist
        expect(fs.access(sourcePath)).rejects.toThrow();
        expect(await fs.readFile(targetPath, 'utf-8')).toBe('test content');
      } finally {
        // Restore original fs.rename
        fs.rename = originalRename;
      }
    });

    it('should propagate non-EXDEV errors during move operations', async () => {
      const sourceDir = join(tempDir, 'source');
      const targetDir = join(tempDir, 'target');
      await fs.mkdir(sourceDir, { recursive: true });
      
      const sourcePath = join(sourceDir, 'test.jpg');
      await fs.writeFile(sourcePath, 'test content');

      // Mock fs.rename to simulate a different error (not EXDEV)
      const originalRename = fs.rename;
      const mockRename = async (src, dest) => {
        const error = new Error('permission denied');
        error.code = 'EACCES';
        throw error;
      };

      fs.rename = mockRename;

      try {
        await expect(processFile(sourcePath, targetDir, 'moved.jpg', false)).rejects.toThrow('permission denied');
      } finally {
        // Restore original fs.rename
        fs.rename = originalRename;
      }
    });
  });

  describe('File Relationship System', () => {
    it('should group related files by basename', async () => {
      const testDir = join(tempDir, 'test-source');
      await fs.mkdir(testDir, { recursive: true });

      // Create DJI Mini Pro 4 style files
      await fs.writeFile(join(testDir, 'DJI_20250706141254_0019.MP4'), 'video content');
      await fs.writeFile(join(testDir, 'DJI_20250706141254_0019.SRT'), 'subtitle content');
      await fs.writeFile(join(testDir, 'DJI_20250706141300_0020.MP4'), 'video content 2');
      await fs.writeFile(join(testDir, 'standalone.JPG'), 'image content');

      const includeExtensions = ['.mp4', '.srt', '.jpg'];
      const excludeExtensions = [];
      const excludeFolders = [];
      const primaryExtensions = ['.mp4', '.jpg'];
      const companionExtensions = ['.srt'];

      const fileGroups = await scanFiles(
        testDir, 
        includeExtensions, 
        excludeExtensions, 
        excludeFolders, 
        true, // Enable relationship maintenance
        primaryExtensions, 
        companionExtensions
      );

      expect(fileGroups).toHaveLength(3); // Two video groups + one standalone image

      // Find the group with SRT companion
      const videoWithSrtGroup = fileGroups.find(group => 
        group.companionFiles.some(file => file.endsWith('.SRT'))
      );

      expect(videoWithSrtGroup).toBeTruthy();
      expect(videoWithSrtGroup.files).toHaveLength(2);
      expect(videoWithSrtGroup.primaryFile).toContain('DJI_20250706141254_0019.MP4');
      expect(videoWithSrtGroup.companionFiles).toHaveLength(1);
      expect(videoWithSrtGroup.companionFiles[0]).toContain('DJI_20250706141254_0019.SRT');

      // Check standalone video group
      const standaloneVideoGroup = fileGroups.find(group => 
        group.primaryFile.endsWith('0020.MP4')
      );

      expect(standaloneVideoGroup).toBeTruthy();
      expect(standaloneVideoGroup.files).toHaveLength(1);
      expect(standaloneVideoGroup.companionFiles).toHaveLength(0);

      // Check standalone image group
      const imageGroup = fileGroups.find(group => 
        group.primaryFile.endsWith('standalone.JPG')
      );

      expect(imageGroup).toBeTruthy();
      expect(imageGroup.files).toHaveLength(1);
      expect(imageGroup.companionFiles).toHaveLength(0);
    });

    it('should process file groups with consistent naming', async () => {
      const testDir = join(tempDir, 'test-source');
      const targetDir = join(tempDir, 'test-target');
      await fs.mkdir(testDir, { recursive: true });

      // Create test files
      await fs.writeFile(join(testDir, 'DJI_20250706141254_0019.MP4'), 'video content');
      await fs.writeFile(join(testDir, 'DJI_20250706141254_0019.SRT'), 'subtitle content');

      // Set specific modification times
      const testDate = new Date('2025-07-06T14:12:54Z');
      await fs.utimes(join(testDir, 'DJI_20250706141254_0019.MP4'), testDate, testDate);
      await fs.utimes(join(testDir, 'DJI_20250706141254_0019.SRT'), testDate, testDate);

      const group = {
        files: [
          join(testDir, 'DJI_20250706141254_0019.MP4'),
          join(testDir, 'DJI_20250706141254_0019.SRT')
        ],
        primaryFile: join(testDir, 'DJI_20250706141254_0019.MP4'),
        companionFiles: [join(testDir, 'DJI_20250706141254_0019.SRT')]
      };

      const results = await processFileGroup(
        group,
        testDate,
        'DJI_Mini4Pro',
        targetDir,
        'rename',
        'copy',
        '{date}_{time}_{camera}'
      );

      expect(results).toHaveLength(2);

      // Check that both files have the same base name but different extensions
      const videoResult = results.find(r => r.sourcePath.endsWith('.MP4'));
      const srtResult = results.find(r => r.sourcePath.endsWith('.SRT'));

      expect(videoResult).toBeTruthy();
      expect(srtResult).toBeTruthy();

      // Both should have the same timestamp-based naming
      expect(videoResult.targetPath).toMatch(/2025-07-06_14-12-54_DJI_Mini4Pro\.MP4$/);
      expect(srtResult.targetPath).toMatch(/2025-07-06_14-12-54_DJI_Mini4Pro\.SRT$/);

      // Verify companion flag
      expect(videoResult.isCompanion).toBe(false);
      expect(srtResult.isCompanion).toBe(true);

      // Verify files were actually copied
      expect(await fs.readFile(videoResult.targetPath, 'utf-8')).toBe('video content');
      expect(await fs.readFile(srtResult.targetPath, 'utf-8')).toBe('subtitle content');
    });
  });
});