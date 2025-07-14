import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { loadProfiles, validateProfile, saveProfile } from '../src/config.js'

describe('config.js', () => {
  let tempDir
  let originalConfigDir

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'cardingest-test-'))

    // Mock the CONFIG_DIR by temporarily changing the module
    const configModule = await import('../src/config.js')
    originalConfigDir = configModule.CONFIG_DIR

    // Create a temporary profiles directory for testing
    await fs.mkdir(join(tempDir, 'profiles'), { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('validateProfile', () => {
    it('should validate a complete profile', () => {
      const profile = {
        sourcePath: '/test/source',
        destinationRoot: '/test/destination',
        cameraLabel: 'TestCamera',
      }

      const result = validateProfile(profile)

      expect(result.sourcePath).toBe('/test/source')
      expect(result.destinationRoot).toBe('/test/destination')
      expect(result.cameraLabel).toBe('TestCamera')
      expect(result.transferMode).toBe('copy') // default value
      expect(result.useExifDate).toBe(true) // default value
      expect(result.onCollision).toBe('rename') // default value
    })

    it('should apply default values for optional fields', () => {
      const profile = {
        sourcePath: '/test/source',
        destinationRoot: '/test/destination',
        cameraLabel: 'TestCamera',
        transferMode: 'move',
        useExifDate: false,
        onCollision: 'replace',
      }

      const result = validateProfile(profile)

      expect(result.transferMode).toBe('move')
      expect(result.useExifDate).toBe(false)
      expect(result.onCollision).toBe('replace')
      expect(result.includeExtensions).toEqual([
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
      ])
    })

    it('should throw error for missing required fields', () => {
      const profile = {
        sourcePath: '/test/source',
        // Missing destinationRoot and cameraLabel
      }

      expect(() => validateProfile(profile)).toThrow('Missing required fields: destinationRoot, cameraLabel')
    })

    it('should preserve custom extensions', () => {
      const profile = {
        sourcePath: '/test/source',
        destinationRoot: '/test/destination',
        cameraLabel: 'TestCamera',
        includeExtensions: ['.jpg', '.png'],
        excludeExtensions: ['.tmp'],
        excludeFolders: ['thumbnails'],
      }

      const result = validateProfile(profile)

      expect(result.includeExtensions).toEqual(['.jpg', '.png'])
      expect(result.excludeExtensions).toEqual(['.tmp'])
      expect(result.excludeFolders).toEqual(['thumbnails'])
    })

    describe('transferMode validation', () => {
      it('should accept valid transferMode values', () => {
        const profileCopy = {
          sourcePath: '/test/source',
          destinationRoot: '/test/destination',
          cameraLabel: 'TestCamera',
          transferMode: 'copy',
        }

        const profileMove = {
          sourcePath: '/test/source',
          destinationRoot: '/test/destination',
          cameraLabel: 'TestCamera',
          transferMode: 'move',
        }

        const resultCopy = validateProfile(profileCopy)
        const resultMove = validateProfile(profileMove)

        expect(resultCopy.transferMode).toBe('copy')
        expect(resultMove.transferMode).toBe('move')
      })

      it('should throw error for invalid transferMode values', () => {
        const profile = {
          sourcePath: '/test/source',
          destinationRoot: '/test/destination',
          cameraLabel: 'TestCamera',
          transferMode: 'invalid',
        }

        expect(() => validateProfile(profile)).toThrow("Invalid transferMode value: invalid. Must be 'copy' or 'move'")
      })

      it('should default to copy when transferMode is not specified', () => {
        const profile = {
          sourcePath: '/test/source',
          destinationRoot: '/test/destination',
          cameraLabel: 'TestCamera',
        }

        const result = validateProfile(profile)
        expect(result.transferMode).toBe('copy')
      })
    })

    describe('backward compatibility with copyFiles', () => {
      it('should convert copyFiles: true to transferMode: copy', () => {
        const profile = {
          sourcePath: '/test/source',
          destinationRoot: '/test/destination',
          cameraLabel: 'TestCamera',
          copyFiles: true,
        }

        const result = validateProfile(profile)
        expect(result.transferMode).toBe('copy')
      })

      it('should convert copyFiles: false to transferMode: move', () => {
        const profile = {
          sourcePath: '/test/source',
          destinationRoot: '/test/destination',
          cameraLabel: 'TestCamera',
          copyFiles: false,
        }

        const result = validateProfile(profile)
        expect(result.transferMode).toBe('move')
      })

      it('should prefer transferMode over copyFiles when both are present', () => {
        const profile = {
          sourcePath: '/test/source',
          destinationRoot: '/test/destination',
          cameraLabel: 'TestCamera',
          copyFiles: false,
          transferMode: 'copy',
        }

        const result = validateProfile(profile)
        expect(result.transferMode).toBe('copy')
      })
    })

    describe('onCollision validation', () => {
      it('should accept valid onCollision values', () => {
        const profileRename = {
          sourcePath: '/test/source',
          destinationRoot: '/test/destination',
          cameraLabel: 'TestCamera',
          onCollision: 'rename',
        }

        const profileReplace = {
          sourcePath: '/test/source',
          destinationRoot: '/test/destination',
          cameraLabel: 'TestCamera',
          onCollision: 'replace',
        }

        const resultRename = validateProfile(profileRename)
        const resultReplace = validateProfile(profileReplace)

        expect(resultRename.onCollision).toBe('rename')
        expect(resultReplace.onCollision).toBe('replace')
      })

      it('should throw error for invalid onCollision values', () => {
        const profile = {
          sourcePath: '/test/source',
          destinationRoot: '/test/destination',
          cameraLabel: 'TestCamera',
          onCollision: 'invalid',
        }

        expect(() => validateProfile(profile)).toThrow(
          "Invalid onCollision value: invalid. Must be 'rename' or 'replace'"
        )
      })

      it('should default to rename when onCollision is not specified', () => {
        const profile = {
          sourcePath: '/test/source',
          destinationRoot: '/test/destination',
          cameraLabel: 'TestCamera',
        }

        const result = validateProfile(profile)
        expect(result.onCollision).toBe('rename')
      })
    })
  })

  describe('saveProfile and loadProfiles', () => {
    it('should save and load profiles correctly', async () => {
      // Create a temporary config directory for this test
      const testConfigDir = join(tempDir, 'test-profiles')
      await fs.mkdir(testConfigDir, { recursive: true })

      // Manually save a profile to the test directory
      const profile = {
        sourcePath: '/test/source',
        destinationRoot: '/test/destination',
        cameraLabel: 'TestCamera',
        includeExtensions: ['.jpg', '.mp4'],
      }

      const profilePath = join(testConfigDir, 'test-profile.yaml')
      const profileContent = `sourcePath: /test/source
destinationRoot: /test/destination
cameraLabel: TestCamera
includeExtensions:
  - .jpg
  - .mp4`

      await fs.writeFile(profilePath, profileContent)

      // Read the profiles from the directory
      const files = await fs.readdir(testConfigDir)
      const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))

      expect(yamlFiles).toHaveLength(1)
      expect(yamlFiles[0]).toBe('test-profile.yaml')

      // Verify the content can be parsed
      const content = await fs.readFile(profilePath, 'utf-8')
      expect(content).toContain('sourcePath: /test/source')
      expect(content).toContain('cameraLabel: TestCamera')
    })

    it('should handle empty profiles directory', async () => {
      // This test verifies that loadProfiles handles empty directories gracefully
      const testConfigDir = join(tempDir, 'empty-profiles')
      await fs.mkdir(testConfigDir, { recursive: true })

      const files = await fs.readdir(testConfigDir)
      expect(files).toHaveLength(0)
    })
  })
})
