# File Collision Handling Implementation

## Problem

The cardingest CLI tool only had one behavior when destination files already existed: it would automatically rename the new file by adding a numeric suffix (e.g., `filename_1.jpg`, `filename_2.jpg`). Users needed the ability to choose between two collision handling strategies:

1. **Rename** (existing behavior): Add numeric suffixes to avoid overwriting
2. **Replace**: Overwrite the existing file with the new one

This flexibility was needed for different workflow scenarios:
- **Rename**: Useful for incremental imports where you want to preserve all files
- **Replace**: Useful for syncing workflows where newer files should replace older ones

## Root Cause

The file collision handling logic was hardcoded in the `runImport` function in `src/cli.js`. The `findAvailableFilename` function was always called to generate a unique filename, and there was no configuration option to control this behavior.

## Solution

### 1. Profile Schema Extension

Added `onCollision` field to profile configuration:
- **Type**: String enum (`'rename'` | `'replace'`)
- **Default**: `'rename'` (preserves existing behavior)
- **Validation**: Config validation ensures only valid values are accepted

### 2. CLI Option Addition

Added `--on-collision` CLI flag:
- **Usage**: `--on-collision <action>`
- **Values**: `rename` or `replace`
- **Override**: CLI option overrides profile setting in headless mode

### 3. Core Logic Implementation

Modified the import logic in `src/cli.js`:
- **Rename mode**: Uses `findAvailableFilename()` to generate unique names
- **Replace mode**: Uses the base filename directly, allowing overwrites
- **Validation**: Rejects invalid collision values with clear error messages

### 4. User Experience Improvements

- **Profile Creation**: Added collision handling prompt in interactive profile creation
- **Help Documentation**: Updated CLI help text with collision handling examples
- **Error Handling**: Clear validation messages for invalid collision values

## Code Changes

### src/config.js
- Added `onCollision` validation in `validateProfile()`
- Set default value to `'rename'` to maintain backward compatibility

### src/cli.js
- Added `--on-collision` argument parsing
- Added collision handling prompt in profile creation
- Modified import logic to respect collision setting
- Updated help text with new option

### Profile Files
- Added `onCollision: replace` to existing profiles as needed

## Testing

### Functional Tests
- ✅ Rename mode: Files get numeric suffixes when collisions occur
- ✅ Replace mode: Existing files are overwritten
- ✅ CLI override: `--on-collision` flag overrides profile setting
- ✅ Profile setting: `onCollision` field in YAML profiles works correctly
- ✅ Validation: Invalid collision values rejected with clear error messages

### Edge Cases
- ✅ Backward compatibility: Existing profiles without `onCollision` default to rename
- ✅ Case sensitivity: CLI validation is case-sensitive
- ✅ Interactive mode: Profile creation includes collision handling prompt

## Usage Examples

### Profile Configuration
```yaml
# ~/.cardingest/profiles/my-camera.yaml
sourcePath: /Volumes/SD_CARD
destinationRoot: /Users/me/Photos
cameraLabel: MyCamera
onCollision: replace  # or 'rename'
```

### CLI Usage
```bash
# Use profile's collision setting
cardingest --profile my-camera --headless

# Override with CLI flag
cardingest --profile my-camera --on-collision replace --headless
cardingest --profile my-camera --on-collision rename --headless
```

## Impact

This implementation provides users with flexible file collision handling while maintaining backward compatibility. The default behavior remains unchanged, ensuring existing workflows continue to work without modification. Users can now choose the collision strategy that best fits their specific import workflow needs.