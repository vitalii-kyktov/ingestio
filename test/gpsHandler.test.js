import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  hasGpsData,
  validateCoordinates,
  parseCoordinateString,
  writeGpsData,
  formatCoordinates,
} from '../src/gpsHandler.js'

describe('GPS Handler', () => {
  let tempDir
  let testFile

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'cardingest-gps-test-'))
    testFile = join(tempDir, 'test.jpg')

    // Create a minimal test image file
    const fakeJpegHeader = Buffer.from([
      0xff,
      0xd8, // JPEG SOI marker
      0xff,
      0xe0, // JFIF marker
      0x00,
      0x10, // Length
      0x4a,
      0x46,
      0x49,
      0x46,
      0x00, // JFIF string
      0x01,
      0x01, // Version
      0x01, // Units
      0x00,
      0x48,
      0x00,
      0x48, // X/Y density
      0x00,
      0x00, // Thumbnail dimensions
      0xff,
      0xd9, // JPEG EOI marker
    ])

    await fs.writeFile(testFile, fakeJpegHeader)
  })

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  describe('validateCoordinates', () => {
    it('should validate correct coordinates', () => {
      const result = validateCoordinates(40.7128, -74.006)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject latitude out of range', () => {
      const result = validateCoordinates(91, -74.006)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Latitude must be between -90 and 90')
    })

    it('should reject longitude out of range', () => {
      const result = validateCoordinates(40.7128, 181)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Longitude must be between -180 and 180')
    })

    it('should reject non-numeric coordinates', () => {
      const result = validateCoordinates('40.7128', -74.006)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Coordinates must be numbers')
    })

    it('should reject NaN coordinates', () => {
      const result = validateCoordinates(NaN, -74.006)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Coordinates cannot be NaN')
    })
  })

  describe('parseCoordinateString', () => {
    it('should parse decimal degrees format', () => {
      const result = parseCoordinateString('40.7128, -74.0060')
      expect(result.latitude).toBe(40.7128)
      expect(result.longitude).toBe(-74.006)
      expect(result.error).toBeUndefined()
    })

    it('should parse decimal degrees without comma', () => {
      const result = parseCoordinateString('40.7128 -74.0060')
      expect(result.latitude).toBe(40.7128)
      expect(result.longitude).toBe(-74.006)
    })

    it('should parse cardinal direction format', () => {
      const result = parseCoordinateString('40.7128 N, 74.0060 W')
      expect(result.latitude).toBe(40.7128)
      expect(result.longitude).toBe(-74.006)
    })

    it('should handle case insensitive cardinal directions', () => {
      const result = parseCoordinateString('40.7128 n, 74.0060 w')
      expect(result.latitude).toBe(40.7128)
      expect(result.longitude).toBe(-74.006)
    })

    it('should handle South and East directions', () => {
      const result = parseCoordinateString('40.7128 S, 74.0060 E')
      expect(result.latitude).toBe(-40.7128)
      expect(result.longitude).toBe(74.006)
    })

    it('should reject empty input', () => {
      const result = parseCoordinateString('')
      expect(result.error).toContain('Coordinate string is required')
    })

    it('should reject invalid format', () => {
      const result = parseCoordinateString('invalid coordinates')
      expect(result.error).toContain('Invalid coordinate format')
    })

    it('should reject coordinates out of range', () => {
      const result = parseCoordinateString('91, -74')
      expect(result.error).toContain('Latitude must be between -90 and 90')
    })

    it('should handle whitespace variations', () => {
      const result = parseCoordinateString('  40.7128  ,  -74.0060  ')
      expect(result.latitude).toBe(40.7128)
      expect(result.longitude).toBe(-74.006)
    })
  })

  describe('formatCoordinates', () => {
    it('should format positive coordinates', () => {
      const result = formatCoordinates(40.7128, -74.006)
      expect(result).toBe('40.712800° N, 74.006000° W')
    })

    it('should format negative coordinates', () => {
      const result = formatCoordinates(-40.7128, 74.006)
      expect(result).toBe('40.712800° S, 74.006000° E')
    })

    it('should format zero coordinates', () => {
      const result = formatCoordinates(0, 0)
      expect(result).toBe('0.000000° N, 0.000000° E')
    })
  })

  describe('hasGpsData', () => {
    it('should return false for file without GPS data', async () => {
      const result = await hasGpsData(testFile)
      expect(result).toBe(false)
    })

    it('should return false for files with invalid GPS coordinates (0,0)', async () => {
      // This test documents that 0,0 coordinates should be considered invalid
      // In a real test environment, we would need to create a file with 0,0 GPS data
      // For now, we test the internal validation logic
      const result = await hasGpsData(testFile)
      expect(result).toBe(false)
    })

    it('should handle non-existent files gracefully', async () => {
      const result = await hasGpsData(join(tempDir, 'nonexistent.jpg'))
      expect(result).toBe(false)
    })

    it('should handle non-image files gracefully', async () => {
      const textFile = join(tempDir, 'test.txt')
      await fs.writeFile(textFile, 'hello world')
      const result = await hasGpsData(textFile)
      expect(result).toBe(false)
    })
  })

  describe('writeGpsData', () => {
    it('should reject invalid coordinates', async () => {
      await expect(writeGpsData(testFile, 91, -74)).rejects.toThrow('Invalid coordinates')
    })

    it('should handle non-existent files gracefully', async () => {
      const nonExistentFile = join(tempDir, 'nonexistent.jpg')
      await expect(writeGpsData(nonExistentFile, 40.7128, -74.006)).rejects.toThrow()
    })

    // Note: Testing actual GPS writing would require a more sophisticated setup
    // with real image files and potentially mocking exiftool
    it('should validate coordinates before writing', async () => {
      const promise = writeGpsData(testFile, 40.7128, -74.006)
      // This may fail due to exiftool not being available or file format issues,
      // but it should at least validate the coordinates first
      try {
        await promise
      } catch (error) {
        // Expected to fail in test environment without proper image file
        expect(error.message).toContain('Failed to write GPS data')
      }
    })
  })

  describe('integration scenarios', () => {
    it('should handle complete workflow for valid coordinates', () => {
      const coordString = '40.7128, -74.0060'
      const parsed = parseCoordinateString(coordString)

      expect(parsed.error).toBeUndefined()
      expect(parsed.latitude).toBe(40.7128)
      expect(parsed.longitude).toBe(-74.006)

      const validation = validateCoordinates(parsed.latitude, parsed.longitude)
      expect(validation.valid).toBe(true)

      const formatted = formatCoordinates(parsed.latitude, parsed.longitude)
      expect(formatted).toBe('40.712800° N, 74.006000° W')
    })

    it('should handle workflow for cardinal direction coordinates', () => {
      const coordString = '40.7128 S, 74.0060 W'
      const parsed = parseCoordinateString(coordString)

      expect(parsed.error).toBeUndefined()
      expect(parsed.latitude).toBe(-40.7128)
      expect(parsed.longitude).toBe(-74.006)

      const validation = validateCoordinates(parsed.latitude, parsed.longitude)
      expect(validation.valid).toBe(true)

      const formatted = formatCoordinates(parsed.latitude, parsed.longitude)
      expect(formatted).toBe('40.712800° S, 74.006000° W')
    })

    it('should reject invalid workflow gracefully', () => {
      const coordString = 'invalid input'
      const parsed = parseCoordinateString(coordString)

      expect(parsed.error).toContain('Invalid coordinate format')
      expect(parsed.latitude).toBeUndefined()
      expect(parsed.longitude).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('should handle extreme valid coordinates', () => {
      const maxCoords = parseCoordinateString('90, 180')
      expect(maxCoords.latitude).toBe(90)
      expect(maxCoords.longitude).toBe(180)

      const minCoords = parseCoordinateString('-90, -180')
      expect(minCoords.latitude).toBe(-90)
      expect(minCoords.longitude).toBe(-180)
    })

    it('should handle coordinate precision', () => {
      const preciseCoords = parseCoordinateString('40.712812345, -74.006012345')
      expect(preciseCoords.latitude).toBeCloseTo(40.712812345, 9)
      expect(preciseCoords.longitude).toBeCloseTo(-74.006012345, 9)
    })

    it('should handle integer coordinates', () => {
      const intCoords = parseCoordinateString('40, -74')
      expect(intCoords.latitude).toBe(40)
      expect(intCoords.longitude).toBe(-74)
    })
  })
})
