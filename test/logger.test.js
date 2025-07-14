import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import Logger from '../src/logger.js'

describe('Logger', () => {
  let tempDir
  let logger

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'ingestio-logger-test-'))
  })

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  describe('Log levels', () => {
    it('should filter logs based on level', () => {
      const infoLogger = new Logger('info')
      const errorLogger = new Logger('error')

      expect(infoLogger.shouldLog('debug')).toBe(false)
      expect(infoLogger.shouldLog('info')).toBe(true)
      expect(infoLogger.shouldLog('warn')).toBe(true)
      expect(infoLogger.shouldLog('error')).toBe(true)

      expect(errorLogger.shouldLog('debug')).toBe(false)
      expect(errorLogger.shouldLog('info')).toBe(false)
      expect(errorLogger.shouldLog('warn')).toBe(false)
      expect(errorLogger.shouldLog('error')).toBe(true)
    })

    it('should default to info level', () => {
      const logger = new Logger()
      expect(logger.level).toBe('info')
      expect(logger.shouldLog('info')).toBe(true)
      expect(logger.shouldLog('debug')).toBe(false)
    })
  })

  describe('File transfer logging', () => {
    beforeEach(() => {
      logger = new Logger('debug')
    })

    it('should log successful file transfers', () => {
      const sourceFile = '/source/test.jpg'
      const targetFile = '/target/test.jpg'
      const fileSize = 1024
      const duration = 150

      logger.logFileTransfer(sourceFile, targetFile, 'copy', fileSize, duration, true)

      expect(logger.reportData.files).toHaveLength(1)
      expect(logger.reportData.files[0]).toMatchObject({
        sourceFile,
        targetFile,
        operation: 'copy',
        fileSize,
        duration,
        success: true,
      })
      expect(logger.reportData.summary.processedFiles).toBe(1)
      expect(logger.reportData.summary.transferredSize).toBe(fileSize)
    })

    it('should log failed file transfers', () => {
      const sourceFile = '/source/test.jpg'
      const targetFile = '/target/test.jpg'
      const fileSize = 1024
      const duration = 50

      logger.logFileTransfer(sourceFile, targetFile, 'move', fileSize, duration, false)

      expect(logger.reportData.files).toHaveLength(1)
      expect(logger.reportData.files[0].success).toBe(false)
      expect(logger.reportData.summary.processedFiles).toBe(0)
      expect(logger.reportData.summary.errorFiles).toBe(1)
      expect(logger.reportData.summary.transferredSize).toBe(0)
    })

    it('should track multiple file transfers', () => {
      logger.logFileTransfer('/source/1.jpg', '/target/1.jpg', 'copy', 1024, 100, true)
      logger.logFileTransfer('/source/2.jpg', '/target/2.jpg', 'copy', 2048, 200, true)
      logger.logFileTransfer('/source/3.jpg', '/target/3.jpg', 'copy', 512, 75, false)

      expect(logger.reportData.files).toHaveLength(3)
      expect(logger.reportData.summary.processedFiles).toBe(2)
      expect(logger.reportData.summary.errorFiles).toBe(1)
      expect(logger.reportData.summary.transferredSize).toBe(3072)
      expect(logger.reportData.summary.totalTime).toBe(300)
    })
  })

  describe('Report generation', () => {
    beforeEach(() => {
      logger = new Logger('info')
      logger.setProfile({
        name: 'test-profile',
        sourcePath: '/source',
        destinationRoot: '/destination',
        cameraLabel: 'TestCam',
        transferMode: 'copy',
        onCollision: 'rename',
      })
    })

    it('should generate a structured text report', async () => {
      logger.startFileProcessing(2)
      logger.logFileTransfer('/source/1.jpg', '/target/1.jpg', 'copy', 1024, 100, true)
      logger.logFileTransfer('/source/2.jpg', '/target/2.jpg', 'copy', 2048, 200, true)
      logger.updateTotalSize(3072)

      const report = await logger.generateReport()

      expect(report).toContain('CARDINGEST IMPORT REPORT')
      expect(report).toContain('SESSION INFORMATION')
      expect(report).toContain('PROFILE CONFIGURATION')
      expect(report).toContain('TRANSFER SUMMARY')
      expect(report).toContain('Name: test-profile')
      expect(report).toContain('Total Files Found: 2')
      expect(report).toContain('Successfully Processed: 2')
      expect(report).toContain('Failed: 0')
      expect(report).toContain('3 KB') // Total size formatting
    })

    it('should include errors in the report', async () => {
      logger.error('Test error message', { detail: 'error details' })

      const report = await logger.generateReport()

      expect(report).toContain('ERRORS')
      expect(report).toContain('Test error message')
      expect(report).toContain('error details')
    })

    it('should include file details in debug mode', async () => {
      const debugLogger = new Logger('debug')
      debugLogger.setProfile({
        name: 'debug-profile',
        sourcePath: '/source',
        destinationRoot: '/destination',
        cameraLabel: 'TestCam',
        transferMode: 'copy',
        onCollision: 'rename',
      })

      debugLogger.logFileTransfer('/source/test.jpg', '/target/test.jpg', 'copy', 1024, 100, true)

      const report = await debugLogger.generateReport()

      expect(report).toContain('FILE TRANSFER DETAILS')
      expect(report).toContain('SUCCESS [COPY]')
      expect(report).toContain('/source/test.jpg')
      expect(report).toContain('/target/test.jpg')
      expect(report).toContain('Speed: 10.00 KB/s') // Speed should be included
    })
  })

  describe('Utility functions', () => {
    beforeEach(() => {
      logger = new Logger('info')
    })

    it('should format bytes correctly', () => {
      expect(logger.formatBytes(0)).toBe('0 B')
      expect(logger.formatBytes(1024)).toBe('1 KB')
      expect(logger.formatBytes(1536)).toBe('1.5 KB')
      expect(logger.formatBytes(1048576)).toBe('1 MB')
      expect(logger.formatBytes(1073741824)).toBe('1 GB')
    })

    it('should format duration correctly', () => {
      expect(logger.formatDuration(500)).toBe('500ms')
      expect(logger.formatDuration(1500)).toBe('1.5s')
      expect(logger.formatDuration(65000)).toBe('1.1m')
    })

    it('should calculate transfer speed correctly', () => {
      // Test MB/s calculation (10MB in 1 second)
      const speed1 = logger.calculateTransferSpeed(10 * 1024 * 1024, 1000)
      expect(speed1).toBe('10.00 MB/s')

      // Test KB/s calculation (512KB in 1 second)
      const speed2 = logger.calculateTransferSpeed(512 * 1024, 1000)
      expect(speed2).toBe('512.00 KB/s')

      // Test very fast transfer (1MB in 100ms = 10 MB/s)
      const speed3 = logger.calculateTransferSpeed(1024 * 1024, 100)
      expect(speed3).toBe('10.00 MB/s')

      // Test zero duration
      const speed4 = logger.calculateTransferSpeed(1024, 0)
      expect(speed4).toBe('N/A')
    })

    it('should calculate average speed', () => {
      logger.reportData.summary.transferredSize = 1024000 // 1MB
      logger.reportData.summary.totalTime = 1000 // 1 second

      const speed = logger.calculateAverageSpeed()
      expect(speed).toBe('1000 KB/s')
    })

    it('should handle zero time for average speed', () => {
      logger.reportData.summary.transferredSize = 1024
      logger.reportData.summary.totalTime = 0

      const speed = logger.calculateAverageSpeed()
      expect(speed).toBe('N/A')
    })
  })

  describe('Profile integration', () => {
    it('should store profile information correctly', () => {
      logger = new Logger('info')
      const testProfile = {
        name: 'test-camera',
        sourcePath: '/Volumes/SD_CARD',
        destinationRoot: '/Users/test/Photos',
        cameraLabel: 'TestCam',
        transferMode: 'move',
        onCollision: 'replace',
      }

      logger.setProfile(testProfile)

      expect(logger.reportData.session.profile).toMatchObject(testProfile)
    })
  })
})
