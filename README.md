# cardingest

An intelligent, interactive command-line utility for importing raw media from SD cards into structured local footage libraries.

## Features

- **Profile-based imports**: Create reusable import profiles for different cameras/workflows
- **Interactive CLI**: Guided prompts for selecting profiles and overriding settings
- **Headless mode**: Scriptable automation with command-line flags
- **Smart date handling**: Uses EXIF `DateTimeOriginal` with fallback to file modification time
- **Collision prevention**: Automatically handles filename conflicts
- **Flexible file filtering**: Include/exclude by extension or folder
- **Copy or move operations**: Choose whether to copy files or move them

## Installation

```bash
bun install
```

## Usage

### Interactive Mode

```bash
# Start interactive import
bun start

# Use specific profile
bun start --profile dji-drone
```

### Headless Mode

```bash
# Run with profile in headless mode
bun start --profile dji-drone --headless

# Override settings
bun start --profile dji-drone --source /Volumes/SD_CARD --destination ~/MyFootage --headless
```

### Command Line Options

- `-h, --help`: Show help message
- `-p, --profile <name>`: Use specific profile
- `-s, --source <path>`: Override source path
- `-d, --destination <path>`: Override destination path
- `-c, --camera <label>`: Override camera label
- `--headless`: Run without interactive prompts

## Profiles

Profiles are stored in `~/.cardingest/profiles/` as YAML files.

### Profile Structure

```yaml
sourcePath: /Volumes/DJI_SD
destinationRoot: ~/Footage
cameraLabel: DJI
includeExtensions:
  - .jpg
  - .jpeg
  - .dng
  - .mp4
  - .mov
excludeExtensions: []
excludeFolders:
  - DCIM/.thumbnails
  - System Volume Information
copyFiles: true
useExifDate: true
```

### Profile Fields

- `sourcePath`: Path to SD card or source directory
- `destinationRoot`: Root directory for organized footage
- `cameraLabel`: Label used in filenames (e.g., "DJI", "CanonR5")
- `includeExtensions`: File extensions to import
- `excludeExtensions`: File extensions to skip
- `excludeFolders`: Folder names to skip
- `copyFiles`: `true` to copy files, `false` to move them
- `useExifDate`: `true` to use EXIF date, `false` to use file modification time

## Output Structure

Files are organized as:
```
~/Footage/
├── 2024-01-15/
│   ├── 09_30_45_DJI.jpg
│   ├── 09_30_47_DJI.jpg
│   └── 09_31_12_DJI.mp4
└── 2024-01-16/
    ├── 14_22_33_DJI.jpg
    └── 14_22_35_DJI.jpg
```

## Sample Profiles

The tool includes sample profiles for:
- DJI Drones (`dji-drone.yaml`)
- Canon R5 (`canon-r5.yaml`)
- GoPro (`gopro.yaml`)

## Dependencies

- **prompts**: Interactive CLI prompts
- **yaml**: YAML configuration parsing
- **exifr**: EXIF data extraction
- **Bun**: JavaScript runtime and package manager