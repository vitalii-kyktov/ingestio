import { promises as fs } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

class Logger {
  constructor(level = 'info', reportFile = null) {
    this.level = level
    this.reportFile = reportFile
    this.reportData = {
      session: {
        startTime: new Date().toISOString(),
        endTime: null,
        profile: null,
        logLevel: level,
      },
      files: [],
      summary: {
        totalFiles: 0,
        processedFiles: 0,
        errorFiles: 0,
        totalSize: 0,
        transferredSize: 0,
        totalTime: 0,
      },
      errors: [],
    }
  }

  shouldLog(level) {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level]
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString()
    const levelStr = level.toUpperCase().padEnd(5)
    let logMessage = `[${timestamp}] ${levelStr} ${message}`

    if (data) {
      logMessage += ` ${JSON.stringify(data)}`
    }

    return logMessage
  }

  log(level, message, data = null) {
    if (!this.shouldLog(level)) return

    const formattedMessage = this.formatMessage(level, message, data)

    // Output to console with appropriate method
    switch (level) {
      case 'error':
        console.error(formattedMessage)
        break
      case 'warn':
        console.warn(formattedMessage)
        break
      case 'debug':
        if (this.level === 'debug') {
          console.debug(formattedMessage)
        }
        break
      default:
        console.log(formattedMessage)
    }
  }

  debug(message, data = null) {
    this.log('debug', message, data)
  }

  info(message, data = null) {
    this.log('info', message, data)
  }

  warn(message, data = null) {
    this.log('warn', message, data)
  }

  error(message, data = null) {
    this.log('error', message, data)

    // Add to report errors
    this.reportData.errors.push({
      timestamp: new Date().toISOString(),
      message,
      data,
    })
  }

  setProfile(profile) {
    this.reportData.session.profile = {
      name: profile.name,
      sourcePath: profile.sourcePath,
      destinationRoot: profile.destinationRoot,
      cameraLabel: profile.cameraLabel,
      transferMode: profile.transferMode,
      onCollision: profile.onCollision,
    }
  }

  startFileProcessing(totalFiles) {
    this.reportData.summary.totalFiles = totalFiles
    this.info(`Starting file processing`, { totalFiles })
  }

  logFileTransfer(sourceFile, targetFile, operation, fileSize, duration, success = true, isCompanion = false) {
    const transferData = {
      timestamp: new Date().toISOString(),
      sourceFile,
      targetFile,
      operation, // 'copy' or 'move'
      fileSize,
      duration,
      success,
      isCompanion,
    }

    this.reportData.files.push(transferData)

    if (success) {
      this.reportData.summary.processedFiles++
      this.reportData.summary.transferredSize += fileSize
      this.reportData.summary.totalTime += duration

      const speed = this.calculateTransferSpeed(fileSize, duration)
      const fileType = isCompanion ? ' (companion)' : ''

      this.info(`${operation.toUpperCase()} ${sourceFile} → ${targetFile}${fileType}`, {
        size: this.formatBytes(fileSize),
        duration: `${duration}ms`,
        speed: speed,
      })
    } else {
      this.reportData.summary.errorFiles++
      this.error(`Failed to ${operation} ${sourceFile}`, transferData)
    }
  }

  updateTotalSize(size) {
    this.reportData.summary.totalSize += size
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B'

    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  async generateReport() {
    this.reportData.session.endTime = new Date().toISOString()

    const sessionStart = new Date(this.reportData.session.startTime)
    const sessionEnd = new Date(this.reportData.session.endTime)
    const totalSessionTime = sessionEnd - sessionStart

    const report = this.generateTextReport(totalSessionTime)

    if (this.reportFile) {
      await this.saveReport(report)
    }

    return report
  }

  generateTextReport(totalSessionTime) {
    const { session, files, summary, errors } = this.reportData

    let report = []

    // Header
    report.push('='.repeat(80))
    report.push('CARDINGEST IMPORT REPORT')
    report.push('='.repeat(80))
    report.push('')

    // Session Info
    report.push('SESSION INFORMATION')
    report.push('-'.repeat(40))
    report.push(`Start Time: ${session.startTime}`)
    report.push(`End Time: ${session.endTime}`)
    report.push(`Duration: ${this.formatDuration(totalSessionTime)}`)
    report.push(`Log Level: ${session.logLevel}`)
    report.push('')

    // Profile Info
    if (session.profile) {
      report.push('PROFILE CONFIGURATION')
      report.push('-'.repeat(40))
      report.push(`Name: ${session.profile.name || 'Custom'}`)
      report.push(`Source: ${session.profile.sourcePath}`)
      report.push(`Destination: ${session.profile.destinationRoot}`)
      report.push(`Camera Label: ${session.profile.cameraLabel}`)
      report.push(`Transfer Mode: ${session.profile.transferMode}`)
      report.push(`Collision Handling: ${session.profile.onCollision}`)
      report.push('')
    }

    // Summary
    report.push('TRANSFER SUMMARY')
    report.push('-'.repeat(40))
    report.push(`Total Files Found: ${summary.totalFiles}`)
    report.push(`Successfully Processed: ${summary.processedFiles}`)
    report.push(`Failed: ${summary.errorFiles}`)
    report.push(`Total Size: ${this.formatBytes(summary.totalSize)}`)
    report.push(`Transferred Size: ${this.formatBytes(summary.transferredSize)}`)
    report.push(`Average Transfer Speed: ${this.calculateAverageSpeed()}`)
    report.push(`Total Transfer Time: ${this.formatDuration(summary.totalTime)}`)
    report.push('')

    // File Details (if debug level)
    if (this.level === 'debug' && files.length > 0) {
      report.push('FILE TRANSFER DETAILS')
      report.push('-'.repeat(40))
      files.forEach((file, index) => {
        const status = file.success ? 'SUCCESS' : 'FAILED'
        const size = this.formatBytes(file.fileSize)
        const duration = this.formatDuration(file.duration)
        const speed = this.calculateTransferSpeed(file.fileSize, file.duration)

        report.push(`${index + 1}. ${status} [${file.operation.toUpperCase()}]`)
        report.push(`   Source: ${file.sourceFile}`)
        report.push(`   Target: ${file.targetFile}`)
        report.push(`   Size: ${size}, Duration: ${duration}, Speed: ${speed}`)
        report.push('')
      })
    }

    // Errors
    if (errors.length > 0) {
      report.push('ERRORS')
      report.push('-'.repeat(40))
      errors.forEach((error, index) => {
        report.push(`${index + 1}. ${error.message}`)
        if (error.data) {
          report.push(`   Details: ${JSON.stringify(error.data, null, 2)}`)
        }
        report.push('')
      })
    }

    // Footer
    report.push('='.repeat(80))
    report.push(`Report generated at: ${new Date().toISOString()}`)
    report.push('='.repeat(80))

    return report.join('\n')
  }

  calculateTransferSpeed(fileSize, duration) {
    if (duration === 0) return 'N/A'

    const bytesPerMs = fileSize / duration
    const bytesPerSecond = bytesPerMs * 1000
    const mbPerSecond = bytesPerSecond / (1024 * 1024)

    if (mbPerSecond >= 1) {
      return `${mbPerSecond.toFixed(2)} MB/s`
    } else {
      const kbPerSecond = bytesPerSecond / 1024
      return `${kbPerSecond.toFixed(2)} KB/s`
    }
  }

  calculateAverageSpeed() {
    if (this.reportData.summary.totalTime === 0) return 'N/A'

    const bytesPerMs = this.reportData.summary.transferredSize / this.reportData.summary.totalTime
    const bytesPerSecond = bytesPerMs * 1000

    return `${this.formatBytes(bytesPerSecond)}/s`
  }

  async saveReport(report) {
    try {
      const reportsDir = join(homedir(), '.cardingest', 'reports')
      await fs.mkdir(reportsDir, { recursive: true })

      const filename = this.reportFile || `import-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
      const filepath = join(reportsDir, filename)

      await fs.writeFile(filepath, report)
      this.info(`Report saved to: ${filepath}`)
    } catch (error) {
      this.error(`Failed to save report: ${error.message}`)
    }
  }
}

export default Logger
