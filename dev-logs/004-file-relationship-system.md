# File Relationship System Implementation

**Date:** 2025-07-07  
**Problem:** DJI Mini Pro 4 SRT subtitle files and other companion files need to maintain their association with primary files during import, even after timestamp-based renaming.

## Problem Statement

The user wanted to import SRT subtitle files from DJI Mini Pro 4 drone that don't have EXIF data but are "related" to video files. The original files share the same basename (e.g., `DJI_20250706141254_0019.MP4` and `DJI_20250706141254_0019.SRT`), but during the import process, cardingest renames files based on EXIF timestamps and camera labels, potentially breaking the relationship between companion files and their primary files.

## Root Cause Analysis

The original cardingest system processed files individually without considering relationships between files. This approach worked for standalone files but failed when dealing with:

1. **Companion files without EXIF data** (like SRT subtitles)
2. **File groups that need consistent naming** (like RAW+JPEG pairs)
3. **Cross-file dependencies** where one file's metadata depends on another

## Solution Design

### Core Concepts

1. **File Grouping**: Group files by their basename (filename without extension)
2. **Primary vs Companion Classification**: 
   - Primary files: Have EXIF data and determine the timestamp (MP4, JPG, etc.)
   - Companion files: Lack EXIF data but need to follow primary file naming (SRT, XMP, etc.)
3. **Group-Based Processing**: Process entire groups together using the primary file's timestamp

### Implementation Architecture

#### 1. Configuration System Enhancement (`src/config.js`)
Added new profile options:
- `maintainFileRelationships`: Enable/disable the relationship system (default: true)
- `primaryExtensions`: File types that can serve as primary files
- `companionExtensions`: File types that are always companions

#### 2. File Scanning Refactor (`src/fileProcessor.js`)
- Modified `scanFiles()` to return file groups instead of individual files
- Added `groupRelatedFiles()` function for basename-based grouping
- Added `processFileGroup()` function for consistent group processing

#### 3. CLI Integration (`src/cli.js`)
- Updated import workflow to process file groups
- Enhanced progress reporting for grouped files
- Modified error handling to account for group processing

#### 4. Logging Enhancement (`src/logger.js`)
- Added companion file tracking in transfer logs
- Enhanced reporting to distinguish between primary and companion files

## Technical Implementation Details

### File Grouping Algorithm
```javascript
// Group files by basename (without extension)
const groupKey = join(dir, baseName);
// Where baseName = filename.slice(0, filename.length - ext.length)
```

### Group Processing Logic
1. Extract timestamp from primary file's EXIF data
2. Generate target path based on primary file
3. Apply consistent naming to all files in group
4. Handle collisions at the group level

### Edge Cases Handled
- **No primary files**: Companion files become standalone groups
- **Multiple primary files**: Create separate groups for each primary
- **Mixed file types**: Proper classification based on extension lists

## Critical Bug Fix

During testing, discovered a critical bug in the `groupRelatedFiles()` function:

**Problem**: Used `basename(filename, ext)` incorrectly, which didn't properly remove extensions
**Solution**: Changed to `filename.slice(0, filename.length - ext.length)` for correct basename calculation

This bug was causing files with the same basename to be grouped separately instead of together.

## Test Coverage

Added comprehensive tests covering:
- File grouping by basename
- Primary vs companion file classification
- Group processing with consistent naming
- Edge cases (no primary files, multiple primaries)
- Integration with existing file processing pipeline

## Performance Considerations

- **Memory**: Minimal overhead from grouping logic
- **Processing**: Slight increase due to grouping phase, but negligible for typical import volumes
- **Compatibility**: Backward compatible - can be disabled via configuration

## Future Enhancements

1. **Resume Functionality**: File groups could enable better resume capabilities for interrupted imports
2. **Advanced Relationships**: Support for more complex file relationships beyond basename matching
3. **Metadata Propagation**: Copy metadata from primary files to companion files during processing

## Usage Example

```yaml
# Profile configuration
maintainFileRelationships: true
primaryExtensions: ['.mp4', '.mov', '.jpg', '.jpeg', '.raw']
companionExtensions: ['.srt', '.lrf', '.xmp']
```

When importing DJI Mini Pro 4 files:
- Input: `DJI_20250706141254_0019.MP4`, `DJI_20250706141254_0019.SRT`
- Output: `14_12_54_DJI_Mini4Pro.MP4`, `14_12_54_DJI_Mini4Pro.SRT`

Both files maintain their relationship with consistent timestamp-based naming.

## Lessons Learned

1. **Basename calculation**: Be careful with path manipulation functions - test edge cases thoroughly
2. **API design**: Returning groups instead of individual files required updating all consumers
3. **Test-driven development**: The comprehensive test suite caught the grouping bug early
4. **Backward compatibility**: Always provide fallback behavior for existing functionality