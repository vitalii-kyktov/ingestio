# TransferMode Refactoring and Enhanced Configuration

## Overview

This document details the comprehensive refactoring of the file transfer system in cardingest, which introduced more intuitive configuration options and enhanced functionality for file collision handling and cross-device operations.

## Problems Addressed

### 1. **Unintuitive Configuration**
The original `copyFiles: true/false` boolean was unclear and didn't explicitly convey the operation being performed.

### 2. **Lack of Collision Handling Options**
Users had no control over what happens when destination files already exist - the system always renamed with numeric suffixes.

### 3. **Cross-Device Move Limitations**
Move operations failed when crossing filesystem boundaries (e.g., from SD card to external drive) due to `fs.rename()` limitations.

### 4. **Resource Fork Pollution**
macOS resource fork files (`._*`) were being processed as media files, leading to incorrect file counts and unnecessary transfers.

## Solutions Implemented

### 1. **TransferMode Enum Refactoring**

**Before:**
```yaml
copyFiles: true  # Unclear what this means
```

**After:**
```yaml
transferMode: copy  # or 'move' - clear intent
```

**Implementation:**
- Replaced boolean `copyFiles` with descriptive `transferMode` enum
- Added backward compatibility to automatically convert old profiles
- Enhanced profile creation UI with descriptive choices

### 2. **Collision Handling System**

**New Configuration:**
```yaml
onCollision: rename  # or 'replace'
```

**CLI Override:**
```bash
cardingest --on-collision replace --headless
```

**Features:**
- **Rename Mode**: Adds numeric suffixes (`file_1.jpg`, `file_2.jpg`) to avoid overwriting
- **Replace Mode**: Overwrites existing files with newer ones
- **Profile-based**: Set default behavior per camera/workflow
- **CLI Override**: Override profile setting on demand

### 3. **Cross-Device Move Support**

**Enhanced processFile Function:**
```javascript
// Try rename first (fast for same filesystem)
await fs.rename(sourcePath, targetPath);
```

**Fallback for Cross-Device:**
```javascript
if (error.code === 'EXDEV') {
  // Cross-device move: copy then delete
  await fs.copyFile(sourcePath, targetPath);
  await fs.unlink(sourcePath);
}
```

**Benefits:**
- Seamless moves between different volumes/filesystems
- Maintains performance for same-device operations
- Proper error handling for non-EXDEV errors

### 4. **Resource Fork Filtering**

**Implementation:**
```javascript
// Skip macOS resource fork files
if (entry.name.startsWith('._')) {
  continue;
}
```

**Impact:**
- Accurate file counts matching Finder display
- No unnecessary processing of metadata files
- Cleaner import operations

## Code Changes Summary

### Core Files Modified

**`src/config.js`:**
- Added `transferMode` validation with enum checking
- Implemented backward compatibility for `copyFiles`
- Added `onCollision` validation
- Enhanced error messages for invalid values

**`src/cli.js`:**
- Updated profile creation prompts with descriptive choices
- Added `--on-collision` CLI argument parsing
- Modified import logic to respect collision settings
- Updated output messages to use new transferMode

**`src/fileProcessor.js`:**
- Enhanced `processFile()` with cross-device move support
- Added resource fork filtering in `scanFiles()`
- Implemented EXDEV error handling with copy-then-delete fallback

**Profile Files:**
- Updated existing profiles to use new `transferMode` format
- Maintained backward compatibility for old format

## Testing Coverage

### New Test Suites Added

**Configuration Tests (`config.test.js`):**
- TransferMode validation (valid/invalid values, defaults)
- Backward compatibility (`copyFiles` → `transferMode` conversion)
- Collision handling validation
- Updated existing tests for new schema

**File Processor Tests (`fileProcessor.test.js`):**
- Resource fork filtering functionality
- Cross-device move with EXDEV fallback
- Same-device move preservation
- Error propagation for non-EXDEV errors

**CLI Tests (`cli.test.js`):**
- `--on-collision` argument parsing
- Combined flag parsing scenarios

**Integration Tests (`integration.test.js`):**
- End-to-end transfer mode operations
- Collision handling workflows
- Resource fork filtering in realistic scenarios
- Cross-device move integration

**Test Results:**
- ✅ 61 tests passing (0 failures)
- ✅ 151 expectations verified
- ✅ Comprehensive coverage of all new features

## Usage Examples

### Profile Configuration
```yaml
# Modern format (recommended)
sourcePath: /Volumes/SD_CARD
destinationRoot: /Users/me/Photos
cameraLabel: DJI_Osmo4
transferMode: copy      # or 'move'
onCollision: rename     # or 'replace'
```

### CLI Usage
```bash
# Use profile defaults
cardingest --profile my-camera --headless

# Override collision handling
cardingest --profile my-camera --on-collision replace --headless

# Interactive mode includes new options
cardingest  # Shows transfer mode and collision prompts
```

### Profile Creation Flow
```
File transfer mode:
❯ Copy (preserve originals)
  Move (remove from source)

File collision handling:
❯ Rename (add suffix)
  Replace existing file
```

## Backward Compatibility

### Automatic Migration
- Old profiles with `copyFiles: true` → `transferMode: copy`
- Old profiles with `copyFiles: false` → `transferMode: move`
- No manual migration required
- Existing workflows continue unchanged

### Validation
- Clear error messages for invalid values
- Graceful handling of missing fields
- Preference for new format over legacy format

## Performance Impact

### Positive Improvements
- ✅ **Resource Fork Filtering**: Reduces unnecessary file processing
- ✅ **Cross-Device Optimization**: Faster same-device moves, reliable cross-device moves
- ✅ **Collision Control**: Users can choose performance vs safety trade-offs

### No Performance Degradation
- ✅ Backward compatibility adds minimal overhead
- ✅ Default behavior unchanged for existing users
- ✅ New features are opt-in

## Migration Guide

### For Existing Users
1. **No Action Required**: Old profiles continue working
2. **Optional**: Update profiles to use new `transferMode` format
3. **Enhanced**: Set `onCollision` preference for each profile

### For New Users
1. **Profile Creation**: Use enhanced interactive prompts
2. **Configuration**: Set transfer mode and collision handling preferences
3. **CLI Usage**: Use `--on-collision` for ad-hoc overrides

## Future Considerations

### Potential Enhancements
- **Sync Mode**: Compare timestamps and only transfer newer files
- **Verification Mode**: Verify file integrity after transfer
- **Batch Operations**: Optimize for large file sets
- **Progress Tracking**: Enhanced progress reporting for long operations

### Technical Debt
- **Profile Format**: Eventually deprecate `copyFiles` support (v2.0)
- **CLI Consistency**: Consider adding `--transfer-mode` CLI override
- **Configuration Validation**: Add schema validation for YAML files

## Impact Assessment

### User Experience
- ✅ **Clarity**: More intuitive configuration options
- ✅ **Control**: Fine-grained collision handling
- ✅ **Reliability**: Cross-device moves work consistently
- ✅ **Accuracy**: File counts match user expectations

### Developer Experience
- ✅ **Maintainability**: Cleaner, more descriptive code
- ✅ **Testability**: Comprehensive test coverage
- ✅ **Extensibility**: Foundation for future enhancements
- ✅ **Documentation**: Clear development logs and examples

This refactoring represents a significant improvement in both user experience and code quality, providing a solid foundation for future feature development while maintaining full backward compatibility.