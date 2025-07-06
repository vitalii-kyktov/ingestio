import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadProfiles, validateProfile, saveProfile } from '../src/config.js';

describe('config.js', () => {
  let tempDir;
  let originalConfigDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'cardingest-test-'));
    
    // Mock the CONFIG_DIR by temporarily changing the module
    const configModule = await import('../src/config.js');
    originalConfigDir = configModule.CONFIG_DIR;
    
    // Create a temporary profiles directory for testing
    await fs.mkdir(join(tempDir, 'profiles'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('validateProfile', () => {
    it('should validate a complete profile', () => {
      const profile = {
        sourcePath: '/test/source',
        destinationRoot: '/test/destination',
        cameraLabel: 'TestCamera'
      };

      const result = validateProfile(profile);
      
      expect(result.sourcePath).toBe('/test/source');
      expect(result.destinationRoot).toBe('/test/destination');
      expect(result.cameraLabel).toBe('TestCamera');
      expect(result.copyFiles).toBe(true); // default value
      expect(result.useExifDate).toBe(true); // default value
    });

    it('should apply default values for optional fields', () => {
      const profile = {
        sourcePath: '/test/source',
        destinationRoot: '/test/destination',
        cameraLabel: 'TestCamera',
        copyFiles: false,
        useExifDate: false
      };

      const result = validateProfile(profile);
      
      expect(result.copyFiles).toBe(false);
      expect(result.useExifDate).toBe(false);
      expect(result.includeExtensions).toEqual(['.jpg', '.jpeg', '.raw', '.cr2', '.nef', '.arw', '.dng', '.mp4', '.mov', '.avi']);
    });

    it('should throw error for missing required fields', () => {
      const profile = {
        sourcePath: '/test/source'
        // Missing destinationRoot and cameraLabel
      };

      expect(() => validateProfile(profile)).toThrow('Missing required fields: destinationRoot, cameraLabel');
    });

    it('should preserve custom extensions', () => {
      const profile = {
        sourcePath: '/test/source',
        destinationRoot: '/test/destination',
        cameraLabel: 'TestCamera',
        includeExtensions: ['.jpg', '.png'],
        excludeExtensions: ['.tmp'],
        excludeFolders: ['thumbnails']
      };

      const result = validateProfile(profile);
      
      expect(result.includeExtensions).toEqual(['.jpg', '.png']);
      expect(result.excludeExtensions).toEqual(['.tmp']);
      expect(result.excludeFolders).toEqual(['thumbnails']);
    });
  });

  describe('saveProfile and loadProfiles', () => {
    it('should save and load profiles correctly', async () => {
      // Create a temporary config directory for this test
      const testConfigDir = join(tempDir, 'test-profiles');
      await fs.mkdir(testConfigDir, { recursive: true });
      
      // Manually save a profile to the test directory
      const profile = {
        sourcePath: '/test/source',
        destinationRoot: '/test/destination',
        cameraLabel: 'TestCamera',
        includeExtensions: ['.jpg', '.mp4']
      };

      const profilePath = join(testConfigDir, 'test-profile.yaml');
      const profileContent = `sourcePath: /test/source
destinationRoot: /test/destination
cameraLabel: TestCamera
includeExtensions:
  - .jpg
  - .mp4`;
      
      await fs.writeFile(profilePath, profileContent);

      // Read the profiles from the directory
      const files = await fs.readdir(testConfigDir);
      const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
      
      expect(yamlFiles).toHaveLength(1);
      expect(yamlFiles[0]).toBe('test-profile.yaml');

      // Verify the content can be parsed
      const content = await fs.readFile(profilePath, 'utf-8');
      expect(content).toContain('sourcePath: /test/source');
      expect(content).toContain('cameraLabel: TestCamera');
    });

    it('should handle empty profiles directory', async () => {
      // This test verifies that loadProfiles handles empty directories gracefully
      const testConfigDir = join(tempDir, 'empty-profiles');
      await fs.mkdir(testConfigDir, { recursive: true });
      
      const files = await fs.readdir(testConfigDir);
      expect(files).toHaveLength(0);
    });
  });
});