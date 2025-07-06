# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`cardingest` is a CLI tool for importing raw media from SD cards into structured local footage libraries. It uses a profile-based system where each camera/workflow has its own configuration defining source paths, destination structure, and file handling preferences.

## Common Commands

```bash
# Install dependencies
bun install

# Run the CLI tool
bun start

# Run in development mode with file watching
bun run dev

# Test specific functionality
bun start --help
bun start --profile dji-drone --headless
```

## Architecture

### Core Components

**Entry Point (`src/index.js`)**: Simple shim that calls the main CLI function

**CLI Controller (`src/cli.js`)**: Main orchestration layer that handles:
- Command-line argument parsing (custom implementation, no external library)
- Profile selection flow (interactive vs headless modes)
- Profile override prompts
- Import execution coordination

**Configuration System (`src/config.js`)**: Manages profile storage and validation:
- Profiles stored as YAML files in `~/.cardingest/profiles/`
- Profile validation ensures required fields are present
- Automatic config directory creation

**File Processing (`src/fileProcessor.js`)**: Core file operations:
- Recursive directory scanning with filtering
- EXIF date extraction using `exifr` library
- Target path generation with timestamp-based naming
- Collision avoidance through filename suffixes
- File copy/move operations

### Data Flow

1. **Profile Selection**: CLI loads all profiles from `~/.cardingest/profiles/`, presents selection UI
2. **Configuration**: Selected profile can be overridden via CLI flags or interactive prompts
3. **Validation**: Profile structure validated for required fields
4. **File Discovery**: Source directory recursively scanned, files filtered by extension rules
5. **Processing**: Each file processed with date extraction → target path generation → file operation

### Key Design Patterns

- **Modular Architecture**: Each major concern (CLI, config, file processing) in separate modules
- **Profile-Based Configuration**: Reusable YAML configs eliminate repetitive setup
- **Dual Mode Operation**: Interactive prompts for ease of use, headless flags for automation
- **Error Resilience**: File processing continues on individual file errors, with summary reporting

## Profile System

Profiles define complete import workflows and are stored in `~/.cardingest/profiles/` as YAML files. Each profile specifies:

- Source/destination paths
- Camera label for filename generation
- File extension filtering (include/exclude)
- Folder exclusions
- Copy vs move operation
- EXIF date preference

Sample profiles are included for common camera types (DJI, Canon R5, GoPro).

## Output Structure

Files are organized as `YYYY-MM-DD/HH_MM_SS_CameraLabel.ext` where date comes from EXIF `DateTimeOriginal` or file modification time as fallback.

## Dependencies

- **Bun**: Runtime and package manager
- **prompts**: Interactive CLI prompts
- **yaml**: YAML configuration parsing
- **exifr**: EXIF metadata extraction