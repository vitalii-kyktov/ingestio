# ingestio

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful, intelligent command-line utility for importing and organizing raw media from SD cards and storage devices into structured local libraries. Built for photographers, videographers, and content creators who need reliable, automated media management workflows.

## Why ingestio?

**The Problem**: Modern cameras and drones generate thousands of files across multiple formats (RAW, JPEG, video, subtitles, metadata), but importing them manually is time-consuming and error-prone. Traditional file copy tools don't understand media workflows, leading to:

- ❌ Inconsistent file organization
- ❌ Lost companion files (like SRT subtitles)
- ❌ Timestamp mismatches between file pairs
- ❌ Missing or invalid GPS metadata
- ❌ Filename collisions and overwrites

**The Solution**: ingestio provides profile-based automation that understands media workflows, preserves file relationships, validates metadata, and organizes everything consistently.

## Key Features

### 🎯 **Profile-Based Workflows**
- Create reusable import profiles for different cameras and workflows
- Store configurations as portable YAML files
- Switch between profiles instantly for different projects

### 📁 **Intelligent File Organization**
- Automatic date-based folder structure (`YYYY-MM-DD/`)
- Configurable filename formats with template placeholders
- Preserves relationships between companion files (video + SRT subtitles)
- Smart collision handling (rename or replace)

### 🗓️ **Smart Date Handling**
- Extracts EXIF `DateTimeOriginal` from images and videos
- Falls back to file modification time when EXIF unavailable
- Handles timezone edge cases and corrupted metadata
- Special handling for problematic formats (DNG files)

### 🌍 **GPS Location Enhancement**
- Validates GPS coordinates (filters out invalid 0,0 placeholders)
- Interactive GPS input with multiple coordinate formats
- Automatic GPS embedding for files missing location data
- Support for decimal degrees and cardinal directions

### 🔧 **Flexible Operation Modes**
- **Interactive mode**: Guided prompts for profile selection and overrides
- **Headless mode**: Full automation for scripts and workflows
- **Copy or move**: Choose whether to copy files or move them from source
- **Comprehensive logging**: Detailed reports with transfer speeds and error tracking

### 🔗 **File Relationship Preservation**
- Groups related files by basename (e.g., `video.mp4` + `video.srt`)
- Applies consistent naming to entire file groups
- Perfect for DJI drones, professional cameras, and multi-format workflows

## Installation

### Prerequisites
- [Bun](https://bun.sh) (JavaScript runtime)
- [exiftool](https://exiftool.org) (for GPS metadata writing)

## Installation

### Method 1: Global Installation (Recommended)
```bash
# Install directly from GitHub  
bun install -g git+https://github.com/vitalii-kyktov/ingestio.git

# Verify installation
ingestio --help
```

### Method 2: Clone and Install
```bash
# Clone the repository
git clone https://github.com/vitalii-kyktov/ingestio.git
cd ingestio

# Install globally
bun install -g .

# Verify installation
ingestio --help
```

### Method 3: Development Setup
```bash
# Clone for development
git clone https://github.com/vitalii-kyktov/ingestio.git
cd ingestio

# Install dependencies
bun install

# Run directly with Bun
bun start
```

> **Note**: If you don't have Bun installed, you can use npm as a fallback:
> ```bash
> npm install -g git+https://github.com/vitalii-kyktov/ingestio.git
> ```

### Install exiftool (for GPS features)
```bash
# macOS
brew install exiftool

# Ubuntu/Debian
sudo apt install exiftool

# Windows
# Download from https://exiftool.org
```

## Quick Start

### 1. Create Your First Profile
```bash
ingestio
# → Select "Create new profile"
# → Follow the guided setup
```

### 2. Import with Interactive Mode
```bash
# Use any existing profile
ingestio --profile dji-drone

# The tool will:
# ✓ Show profile settings
# ✓ Allow overrides
# ✓ Confirm before processing
# ✓ Display progress and results
```

### 3. Automated/Headless Mode
```bash
# Fully automated import
ingestio --profile dji-drone --headless

# With GPS coordinates
ingestio --profile dji-drone --gps "40.7128,-74.0060" --headless

# Override source and destination
ingestio --profile travel-cam --source /Volumes/SD_CARD --destination ~/Vacation2024 --headless
```

## Usage Examples

### Basic Interactive Import
```bash
# Start with profile selection
ingestio

# Use specific profile with confirmation
ingestio --profile canon-r5
```

### Automated Workflows
```bash
# Copy files from SD card
ingestio --profile dji-drone --source /Volumes/DJI_SD --headless

# Move files (remove from source)
ingestio --profile gopro --source /Volumes/GOPRO --destination ~/ActionCam --headless

# Add GPS coordinates to files missing location data
ingestio --profile travel-photography --gps "48.8566,2.3522" --headless

# Skip GPS prompts in headless mode
ingestio --profile studio-photography --gps-skip --headless
```

### Advanced Options
```bash
# Generate detailed report
ingestio --profile dji-drone --log-level debug --report detailed-import.txt

# Handle file collisions by replacing
ingestio --profile backup-import --on-collision replace --headless

# Override multiple settings
ingestio --profile base-profile \\
  --source /custom/source \\
  --destination /custom/dest \\
  --camera "CustomCam" \\
  --log-level info \\
  --headless
```

## Configuration

### Profile Structure

Profiles are stored as YAML files in `~/.ingestio/profiles/`. Here's a complete example:

```yaml
# ~/.ingestio/profiles/dji-mini-pro-4.yaml
sourcePath: /Volumes/DJI_SD
destinationRoot: ~/Aerial_Footage
cameraLabel: DJI_Mini4Pro

# File filtering
includeExtensions:
  - .mp4    # Videos
  - .mov    # Videos  
  - .jpg    # Photos
  - .jpeg   # Photos
  - .dng    # RAW photos
  - .srt    # Subtitles
excludeExtensions:
  - .lrf    # Log files (optional)
excludeFolders:
  - System Volume Information
  - .thumbnails
  - .Trashes

# Operation settings  
transferMode: copy              # or 'move' to delete from source
useExifDate: true              # Extract dates from EXIF metadata
onCollision: rename            # or 'replace' to overwrite
logLevel: info                 # debug, info, warn, error

# File relationships
maintainFileRelationships: true
primaryExtensions: ['.mp4', '.mov', '.jpg', '.jpeg', '.dng']
companionExtensions: ['.srt', '.lrf', '.xmp']

# Filename format (NEW!)
filenameFormat: '{date}_{time}_{camera}'  # YYYY-MM-DD_HH-MM-SS_Camera.ext

# GPS settings (NEW!)
addGpsData: false              # Prompt for GPS coordinates
```

### Available Filename Format Placeholders

- `{date}`: ISO date (YYYY-MM-DD)
- `{time}`: Time with dashes (HH-MM-SS)  
- `{camera}`: Camera label from profile

Examples:
- `'{date}_{time}_{camera}'` → `2024-07-13_14-30-45_DJI.mp4`
- `'{camera}_{date}_{time}'` → `DJI_2024-07-13_14-30-45.mp4`
- `'{time}_{camera}_{date}'` → `14-30-45_DJI_2024-07-13.mp4`

### GPS Coordinate Formats

ingestio accepts GPS coordinates in multiple formats:

```bash
# Decimal degrees
--gps "40.7128,-74.0060"
--gps "40.7128, -74.0060"

# Cardinal directions
--gps "40.7128 N, 74.0060 W"  
--gps "40.7128N, 74.0060W"

# Mixed positive/negative
--gps "-33.8688, 151.2093"    # Sydney
```

## Output Structure

Files are organized in a clean, date-based hierarchy:

```
~/Footage/
├── 2024-07-13/
│   ├── 2024-07-13_14-30-45_DJI_Mini4Pro.MP4
│   ├── 2024-07-13_14-30-45_DJI_Mini4Pro.SRT
│   ├── 2024-07-13_14-31-12_DJI_Mini4Pro.JPG
│   └── 2024-07-13_14-31-12_DJI_Mini4Pro.DNG
├── 2024-07-14/
│   ├── 2024-07-14_09-15-33_DJI_Mini4Pro.MP4
│   └── 2024-07-14_09-15-33_DJI_Mini4Pro.SRT
└── reports/
    ├── import-2024-07-13T14-30-45-123Z.txt
    └── custom-report-name.txt
```

## Command Line Reference

```bash
ingestio [options]

Options:
  -h, --help                    Show help message
  -p, --profile <name>          Use specific profile
  -s, --source <path>           Override source path
  -d, --destination <path>      Override destination path  
  -c, --camera <label>          Override camera label
  --headless                    Run without interactive prompts
  --on-collision <mode>         Handle file collisions: 'rename' or 'replace'
  -l, --log-level <level>       Set log level: debug, info, warn, error
  -r, --report [filename]       Generate import report (optional custom name)
  -g, --gps <coordinates>       Set GPS coordinates for session
  --gps-skip                    Skip GPS prompts in headless mode

Examples:
  ingestio                                    # Interactive mode
  ingestio --profile dji-drone                # Use profile with confirmation  
  ingestio --profile dji-drone --headless     # Fully automated
  ingestio --profile dji-drone --gps "40.7128,-74.0060" --headless
  ingestio --profile dji-drone --source /Volumes/SD --headless
```

## Sample Profiles

ingestio works great with these camera systems:

### DJI Drones (Mini, Air, Mavic series)
```yaml
sourcePath: /Volumes/DJI_SD  
destinationRoot: ~/Aerial_Footage
cameraLabel: DJI_Mini4Pro
includeExtensions: ['.mp4', '.mov', '.jpg', '.dng', '.srt']
filenameFormat: '{date}_{time}_{camera}'
maintainFileRelationships: true
```

### Canon Mirrorless (R5, R6, etc.)
```yaml
sourcePath: /Volumes/CANON_SD
destinationRoot: ~/Photography  
cameraLabel: CanonR5
includeExtensions: ['.cr3', '.cr2', '.jpg', '.mp4']
filenameFormat: '{camera}_{date}_{time}'
useExifDate: true
```

### Sony Alpha Series
```yaml
sourcePath: /Volumes/SONY_SD
destinationRoot: ~/Sony_Shoots
cameraLabel: A7IV
includeExtensions: ['.arw', '.jpg', '.mp4', '.xavc']
filenameFormat: '{date}_{time}_{camera}'
```

### GoPro Action Cameras  
```yaml
sourcePath: /Volumes/GOPRO
destinationRoot: ~/Action_Footage
cameraLabel: GoPro12
includeExtensions: ['.mp4', '.jpg', '.gpr']
excludeFolders: ['MISC', '100GOPRO/THUMBNAILS']
```

## Logging and Reports

### Log Levels
- **debug**: Verbose output with file-by-file details
- **info**: Standard progress updates (default)
- **warn**: Warnings and non-critical issues
- **error**: Error conditions only

### Report Generation
```bash
# Generate report with default timestamped name
ingestio --profile dji-drone --report

# Generate report with custom name  
ingestio --profile dji-drone --report "vacation-import-2024.txt"

# Debug-level report with detailed file transfer logs
ingestio --profile dji-drone --log-level debug --report
```

Reports include:
- Session information and timing
- Profile configuration used
- Transfer summary with speeds and totals
- Individual file transfer details (debug mode)
- Complete error log with context

Reports are saved to `~/.ingestio/reports/` and can be used for:
- Progress auditing and verification
- Performance analysis  
- Future resume functionality
- Workflow documentation

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Development Setup
```bash
git clone https://github.com/your-username/ingestio.git
cd ingestio
bun install

# Run tests
bun test

# Run tests in watch mode  
bun test --watch

# Format code
bunx prettier --write "src/**/*.js" "test/**/*.js"
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/your-username/ingestio/issues)
- 💡 **Feature Requests**: [GitHub Discussions](https://github.com/your-username/ingestio/discussions)  
- 📖 **Documentation**: [Wiki](https://github.com/your-username/ingestio/wiki)

---

**Built for creators, by creators.** ingestio handles the tedious parts of media management so you can focus on what matters: creating amazing content.