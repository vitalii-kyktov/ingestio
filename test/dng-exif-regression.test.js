import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { extractFileDate, generateTargetPath } from '../src/fileProcessor.js'

describe('DNG EXIF Regression Tests', () => {
  let tempDir

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'ingestio-dng-test-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('DJI Osmo 4 DNG Timestamp Issue', () => {
    it('should handle DNG files that exifr cannot parse', async () => {
      // Simulate the exact scenario we encountered with DJI Osmo 4
      const dngFile = join(tempDir, 'DJI_20250705141254_0019_D.DNG')

      // Create a fake DNG file with content that exifr cannot parse
      // but set filesystem times to match the real scenario
      await fs.writeFile(dngFile, 'fake DNG content that exifr fails to parse')

      // Set file times to match the original issue:
      // - mtime was 15:12:55 (1 hour + 1 second ahead due to timezone/processing)
      // - but actual capture time should be 14:12:54
      const captureTime = new Date('2025-07-05T14:12:54Z') // Correct capture time
      const fileSystemTime = new Date('2025-07-05T15:12:55Z') // Wrong filesystem time

      // Set the filesystem time to the problematic time
      await fs.utimes(dngFile, fileSystemTime, fileSystemTime)

      const extractedDate = await extractFileDate(dngFile, true)

      // Since this is a fake DNG file, both exifr and exiftool will fail,
      // so it should fall back to mtime (fileSystemTime)
      expect(extractedDate).toBeInstanceOf(Date)
      expect(Math.abs(extractedDate.getTime() - fileSystemTime.getTime())).toBeLessThan(1000)
    })

    it('should generate consistent timestamps for JPG/DNG pairs', async () => {
      // Test that paired files from the same capture get the same timestamp
      const captureTime = new Date('2025-07-05T14:12:54Z')

      // Create mock JPG and DNG files
      const jpgFile = join(tempDir, 'DJI_20250705141254_0019_D.JPG')
      const dngFile = join(tempDir, 'DJI_20250705141254_0019_D.DNG')

      await fs.writeFile(jpgFile, 'fake JPG content')
      await fs.writeFile(dngFile, 'fake DNG content')

      // Set both to the same capture time
      await fs.utimes(jpgFile, captureTime, captureTime)
      await fs.utimes(dngFile, captureTime, captureTime)

      const jpgDate = await extractFileDate(jpgFile, true)
      const dngDate = await extractFileDate(dngFile, true)

      // Both should extract the same time (within reasonable tolerance)
      expect(Math.abs(jpgDate.getTime() - dngDate.getTime())).toBeLessThan(2000)

      // Generate target paths for both
      const jpgTarget = generateTargetPath(jpgDate, 'DJI_Osmo4', jpgFile, '/test/dest')
      const dngTarget = generateTargetPath(dngDate, 'DJI_Osmo4', dngFile, '/test/dest')

      // They should be in the same directory with the same timestamp
      expect(jpgTarget.targetDir).toBe(dngTarget.targetDir)
      // Extract date and time parts from the new filename format (YYYY-MM-DD_HH-MM-SS_camera.ext)
      const jpgTimestamp = jpgTarget.baseFilename.split('_').slice(0, 2).join('_')
      const dngTimestamp = dngTarget.baseFilename.split('_').slice(0, 2).join('_')
      expect(jpgTimestamp).toBe(dngTimestamp)
    })

    it('should handle timezone edge cases correctly', async () => {
      // Test various timezone scenarios that could cause the hour offset issue
      const testCases = [
        {
          name: 'UTC capture time',
          captureTime: new Date('2025-07-05T14:12:54Z'),
          expectedHour: '14',
        },
        {
          name: 'Central European Summer Time',
          captureTime: new Date('2025-07-05T12:12:54Z'), // UTC time that becomes 14:12:54 in CEST
          expectedHour: '12', // Should preserve UTC time in filename
        },
        {
          name: 'Edge of day boundary',
          captureTime: new Date('2025-07-05T23:59:59Z'),
          expectedHour: '23',
        },
      ]

      for (const testCase of testCases) {
        const testFile = join(tempDir, `test_${testCase.name.replace(/\s+/g, '_')}.dng`)
        await fs.writeFile(testFile, 'test content')
        await fs.utimes(testFile, testCase.captureTime, testCase.captureTime)

        const extractedDate = await extractFileDate(testFile, true)
        const target = generateTargetPath(extractedDate, 'TestCam', testFile, '/test')

        // Extract hour from the generated filename (format: YYYY-MM-DD_HH-MM-SS_TestCam.dng)
        const filenameHour = target.baseFilename.split('_')[1].split('-')[0]

        expect(filenameHour).toBe(testCase.expectedHour)
      }
    })

    it('should document the exiftool fallback mechanism', async () => {
      // This test serves as documentation for the fallback behavior
      const testFile = join(tempDir, 'fallback-test.dng')
      await fs.writeFile(testFile, 'content that will cause exifr to fail')

      const testTime = new Date('2025-01-01T12:00:00Z')
      await fs.utimes(testFile, testTime, testTime)

      // The function should go through this sequence:
      // 1. Try exifr.parse() - will fail for our fake DNG
      // 2. Try exiftool - will fail for our fake DNG
      // 3. Fall back to fs.stat().mtime - should succeed

      const result = await extractFileDate(testFile, true)

      expect(result).toBeInstanceOf(Date)
      expect(Math.abs(result.getTime() - testTime.getTime())).toBeLessThan(1000)
    })
  })

  describe('EXIF Extraction Robustness', () => {
    it('should handle files with no EXIF data gracefully', async () => {
      const files = [
        { name: 'no-exif.txt', content: 'plain text file' },
        { name: 'binary.bin', content: Buffer.from([0x00, 0xff, 0x00, 0xff]) },
        { name: 'empty.jpg', content: '' },
      ]

      for (const file of files) {
        const filePath = join(tempDir, file.name)
        await fs.writeFile(filePath, file.content)

        const testTime = new Date('2025-06-15T10:30:00Z')
        await fs.utimes(filePath, testTime, testTime)

        const result = await extractFileDate(filePath, true)

        expect(result).toBeInstanceOf(Date)
        expect(Math.abs(result.getTime() - testTime.getTime())).toBeLessThan(1000)
      }
    })

    it('should handle system command availability', async () => {
      // Test behavior when exiftool might not be available
      // This test documents expected behavior rather than mocking system commands
      const testFile = join(tempDir, 'system-test.dng')
      await fs.writeFile(testFile, 'test content for system availability')

      const testTime = new Date('2025-03-15T16:45:30Z')
      await fs.utimes(testFile, testTime, testTime)

      // The function should always return a date, even if system commands fail
      const result = await extractFileDate(testFile, true)

      expect(result).toBeInstanceOf(Date)
      expect(result.getTime()).toBeGreaterThan(0)
    })
  })
})
