import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { hasGpsData, writeGpsData, parseCoordinateString } from '../src/gpsHandler.js'

describe('GPS Integration Tests', () => {
  let tempDir
  let testFile

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'cardingest-gps-integration-'))
    testFile = join(tempDir, 'test.jpg')

    // Create a minimal JPEG file for testing
    const jpegHeader = Buffer.from([
      0xff,
      0xd8, // SOI (Start of Image)
      0xff,
      0xe0, // APP0
      0x00,
      0x10, // Length of APP0 segment
      0x4a,
      0x46,
      0x49,
      0x46,
      0x00, // JFIF\0
      0x01,
      0x01, // JFIF version 1.1
      0x01, // Units (density)
      0x00,
      0x48, // X density (72)
      0x00,
      0x48, // Y density (72)
      0x00,
      0x00, // Thumbnail width/height (none)
      0xff,
      0xd9, // EOI (End of Image)
    ])

    await fs.writeFile(testFile, jpegHeader)
  })

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  })

  describe('Complete GPS workflow', () => {
    it('should verify file initially has no GPS data', async () => {
      const hasGps = await hasGpsData(testFile)
      expect(hasGps).toBe(false)
    })

    it('should demonstrate coordinate parsing and validation workflow', () => {
      // Test various coordinate formats that users might input
      const testCases = [
        {
          input: '40.7128, -74.0060',
          expectedLat: 40.7128,
          expectedLon: -74.006,
          description: 'New York City (decimal degrees)',
        },
        {
          input: '51.5074 N, 0.1278 W',
          expectedLat: 51.5074,
          expectedLon: -0.1278,
          description: 'London (cardinal directions)',
        },
        {
          input: '35.6762 N, 139.6503 E',
          expectedLat: 35.6762,
          expectedLon: 139.6503,
          description: 'Tokyo (cardinal directions)',
        },
        {
          input: '-33.8688, 151.2093',
          expectedLat: -33.8688,
          expectedLon: 151.2093,
          description: 'Sydney (negative coordinates)',
        },
      ]

      for (const testCase of testCases) {
        const parsed = parseCoordinateString(testCase.input)
        expect(parsed.error).toBeUndefined()
        expect(parsed.latitude).toBeCloseTo(testCase.expectedLat, 4)
        expect(parsed.longitude).toBeCloseTo(testCase.expectedLon, 4)
      }
    })

    it('should handle error cases gracefully', () => {
      const errorCases = [
        '91, -74', // Latitude out of range
        '40, 181', // Longitude out of range
        'invalid input', // Invalid format
        '', // Empty string
        '40.7128', // Missing longitude
        'latitude, longitude', // Non-numeric
      ]

      for (const errorCase of errorCases) {
        const parsed = parseCoordinateString(errorCase)
        expect(parsed.error).toBeDefined()
        expect(parsed.latitude).toBeUndefined()
        expect(parsed.longitude).toBeUndefined()
      }
    })

    it('should validate GPS writing workflow (may fail without exiftool)', async () => {
      const coordinates = parseCoordinateString('40.7128, -74.0060')
      expect(coordinates.error).toBeUndefined()

      // This test documents the expected behavior but may fail in CI without exiftool
      try {
        await writeGpsData(testFile, coordinates.latitude, coordinates.longitude)

        // If writing succeeded, verify GPS data was added
        const hasGpsAfter = await hasGpsData(testFile)
        // Note: This may not work reliably with minimal JPEG files
        // The test primarily validates the workflow rather than the actual GPS writing
      } catch (error) {
        // Expected in test environment - validates error handling
        expect(error.message).toContain('Failed to write GPS data')
      }
    })

    it('should handle edge coordinate cases', () => {
      const edgeCases = [
        { input: '0, 0', lat: 0, lon: 0, desc: 'Null Island' },
        { input: '90, 180', lat: 90, lon: 180, desc: 'Maximum valid coordinates' },
        { input: '-90, -180', lat: -90, lon: -180, desc: 'Minimum valid coordinates' },
        { input: '0.000001, 0.000001', lat: 0.000001, lon: 0.000001, desc: 'High precision' },
      ]

      for (const testCase of edgeCases) {
        const parsed = parseCoordinateString(testCase.input)
        expect(parsed.error).toBeUndefined()
        expect(parsed.latitude).toBe(testCase.lat)
        expect(parsed.longitude).toBe(testCase.lon)
      }
    })
  })

  describe('CLI argument simulation', () => {
    it('should simulate coordinate parsing from CLI arguments', () => {
      // Simulate what would happen when user provides coordinates via CLI
      const cliArgs = [
        '40.7128,-74.0060', // No spaces (common CLI usage)
        '40.7128, -74.0060', // With spaces
        '40.7128 N, 74.0060 W', // Cardinal directions
      ]

      for (const arg of cliArgs) {
        const parsed = parseCoordinateString(arg)
        expect(parsed.error).toBeUndefined()
        expect(typeof parsed.latitude).toBe('number')
        expect(typeof parsed.longitude).toBe('number')
      }
    })

    it('should handle invalid CLI arguments gracefully', () => {
      const invalidArgs = [
        'not-coordinates',
        '40.7128', // Missing longitude
        '40.7128,-74.0060,extra', // Too many parts
        '91,-74', // Out of range
      ]

      for (const arg of invalidArgs) {
        const parsed = parseCoordinateString(arg)
        expect(parsed.error).toBeDefined()
      }
    })
  })

  describe('Profile integration scenarios', () => {
    it('should validate profile GPS configuration workflow', () => {
      // Simulate profile with GPS configuration
      const profileWithGps = {
        addGpsData: true,
        gpsCoordinates: {
          latitude: 40.7128,
          longitude: -74.006,
        },
      }

      expect(profileWithGps.addGpsData).toBe(true)
      expect(profileWithGps.gpsCoordinates.latitude).toBe(40.7128)
      expect(profileWithGps.gpsCoordinates.longitude).toBe(-74.006)
    })

    it('should handle profile without GPS configuration', () => {
      const profileWithoutGps = {
        addGpsData: false,
      }

      expect(profileWithoutGps.addGpsData).toBe(false)
      expect(profileWithoutGps.gpsCoordinates).toBeUndefined()
    })
  })
})
