# DNG EXIF Timestamp Mismatch Issue

**Date**: 2025-07-06  
**Severity**: Medium  
**Status**: ✅ Resolved  

## Problem Description

During import of media files from a DJI Osmo 4 SD card, JPG and DNG file pairs that were captured simultaneously showed different timestamps in the organized output:

- **JPG file**: `14_12_54_DJI_Osmo4.JPG` (correct time)
- **DNG file**: `15_12_55_DJI_Osmo4.DNG` (1 hour + 1 second ahead)

Original filename: `DJI_20250705141254_0019_D.DNG` (indicating 14:12:54 capture time)

## Root Cause Analysis

### Investigation Steps

1. **EXIF Data Comparison**: Used `exiftool` to examine both files
   ```bash
   exiftool DJI_20250705141254_0019_D.JPG | grep -i "date\|time"
   exiftool DJI_20250705141254_0019_D.DNG | grep -i "date\|time"
   ```
   
   **Result**: Both files had identical EXIF `DateTimeOriginal: 2025:07:05 14:12:54`

2. **Library Behavior Testing**: Created debug script to test `exifr` library
   ```javascript
   const jpgExif = await exifr.parse(jpgFile);
   const dngExif = await exifr.parse(dngFile);
   ```
   
   **Result**: 
   - JPG: `exifr` successfully extracted `DateTimeOriginal`
   - DNG: `exifr` returned `undefined` for both `DateTimeOriginal` and `DateTime`

3. **Fallback Behavior**: When EXIF extraction fails, the code falls back to file modification time (`mtime`)
   - DNG file `mtime`: `2025-07-05T13:12:55.340Z` (15:12:55 local time)
   - This caused the 1-hour discrepancy due to timezone handling

### Root Cause

The `exifr` JavaScript library cannot properly parse EXIF metadata from DJI Osmo 4 DNG files, causing the import tool to fall back to filesystem timestamps instead of the actual capture time.

## Solution Implemented

### Code Changes

Enhanced the `extractFileDate` function in `src/fileProcessor.js` to implement a **two-stage EXIF extraction fallback**:

1. **Primary**: Try `exifr` library (handles most formats including JPG)
2. **Fallback**: Try `exiftool` command-line tool (handles DNG and other problematic formats)
3. **Last Resort**: Use file modification time

```javascript
export async function extractFileDate(filePath, useExifDate) {
  if (useExifDate) {
    // Try exifr first
    try {
      const exifData = await exifr.parse(filePath);
      if (exifData?.DateTimeOriginal) {
        return new Date(exifData.DateTimeOriginal);
      }
      if (exifData?.DateTime) {
        return new Date(exifData.DateTime);
      }
    } catch (error) {
      // Continue to exiftool fallback
    }
    
    // Try exiftool as fallback for DNG files
    try {
      const result = await new Promise((resolve, reject) => {
        const process = spawn('exiftool', ['-DateTimeOriginal', '-s3', filePath]);
        // ... process handling
      });
      
      if (result) {
        const dateStr = result.replace(/(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    } catch (error) {
      // Continue to mtime fallback
    }
  }
  
  // Final fallback to file modification time
  const stats = await fs.stat(filePath);
  return stats.mtime;
}
```

### Verification

1. **Before Fix**:
   ```
   JPG: 14_12_54_DJI_Osmo4.JPG ✓ (correct)
   DNG: 15_12_55_DJI_Osmo4.DNG ✗ (incorrect)
   ```

2. **After Fix**:
   ```
   JPG: 14_12_54_DJI_Osmo4.JPG ✓ (correct)
   DNG: 14_12_54_DJI_Osmo4.DNG ✓ (correct)
   ```

3. **Test Results**: All existing tests pass, no regressions introduced

## Impact

- **Fixed**: DNG files now have correct timestamps matching their JPG counterparts
- **Improved**: Better EXIF handling for various camera formats beyond DJI
- **Maintained**: Backward compatibility with existing functionality
- **Enhanced**: More robust metadata extraction with graceful fallbacks

## Dependencies

- Requires `exiftool` to be installed on the system (typically available on macOS by default)
- No additional npm dependencies required

## Lessons Learned

1. **Library Limitations**: Popular JavaScript EXIF libraries may not handle all camera-specific formats
2. **Fallback Strategy**: Having multiple extraction methods improves reliability
3. **Testing Importance**: Real-world files can expose edge cases not covered by synthetic test data
4. **Command-line Tools**: Sometimes native tools (`exiftool`) are more reliable than JavaScript libraries for specialized formats

## Future Considerations

- Monitor for similar issues with other camera brands/formats
- Consider adding configuration option to prefer `exiftool` over `exifr` for specific file types
- Add logging to track which extraction method was used for debugging purposes