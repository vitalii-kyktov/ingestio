import exifr from 'exifr';
import { spawn } from 'child_process';

/**
 * Check if a file already has valid GPS coordinates
 * @param {string} filePath - Path to the image file
 * @returns {Promise<boolean>} - True if valid GPS data exists
 */
export async function hasGpsData(filePath) {
  try {
    // First try with exifr
    const exifData = await exifr.parse(filePath, { gps: true });
    if (exifData?.latitude && exifData?.longitude) {
      // Check if coordinates are valid (not 0,0 or other invalid values)
      if (isValidGpsCoordinates(exifData.latitude, exifData.longitude)) {
        return true;
      }
    }
    
    // Fallback to exiftool for more comprehensive GPS check
    const gpsInfo = await getGpsDataFromExiftool(filePath);
    return gpsInfo.hasGps && isValidGpsCoordinates(gpsInfo.latitude, gpsInfo.longitude);
  } catch (error) {
    return false;
  }
}

/**
 * Check if GPS coordinates are valid (not placeholder values)
 * @param {number} latitude - Latitude coordinate
 * @param {number} longitude - Longitude coordinate
 * @returns {boolean} - True if coordinates are valid
 */
function isValidGpsCoordinates(latitude, longitude) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return false;
  }
  
  if (isNaN(latitude) || isNaN(longitude)) {
    return false;
  }
  
  // Check for common invalid/placeholder coordinates
  if (latitude === 0 && longitude === 0) {
    return false; // Null Island - almost certainly a placeholder
  }
  
  // Additional checks for obviously invalid coordinates
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return false;
  }
  
  return true;
}

/**
 * Extract GPS data using exiftool
 * @param {string} filePath - Path to the image file
 * @returns {Promise<{hasGps: boolean, latitude?: number, longitude?: number}>}
 */
async function getGpsDataFromExiftool(filePath) {
  try {
    const result = await new Promise((resolve, reject) => {
      const process = spawn('exiftool', [
        '-GPSLatitude', '-GPSLongitude', '-GPSLatitudeRef', '-GPSLongitudeRef',
        '-s3', '-n', filePath
      ]);
      
      let output = '';
      let error = '';
      
      process.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        error += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(error || 'exiftool failed'));
        }
      });
    });
    
    const lines = result.split('\n').filter(line => line.trim());
    if (lines.length >= 2 && lines[0] && lines[1]) {
      const latitude = parseFloat(lines[0]);
      const longitude = parseFloat(lines[1]);
      return {
        hasGps: true,
        latitude,
        longitude
      };
    }
    
    return { hasGps: false };
  } catch (error) {
    return { hasGps: false };
  }
}

/**
 * Validate GPS coordinates
 * @param {number} latitude - Latitude in decimal degrees
 * @param {number} longitude - Longitude in decimal degrees
 * @returns {{valid: boolean, error?: string}}
 */
export function validateCoordinates(latitude, longitude) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return { valid: false, error: 'Coordinates must be numbers' };
  }
  
  if (isNaN(latitude) || isNaN(longitude)) {
    return { valid: false, error: 'Coordinates cannot be NaN' };
  }
  
  if (latitude < -90 || latitude > 90) {
    return { valid: false, error: 'Latitude must be between -90 and 90 degrees' };
  }
  
  if (longitude < -180 || longitude > 180) {
    return { valid: false, error: 'Longitude must be between -180 and 180 degrees' };
  }
  
  return { valid: true };
}

/**
 * Parse coordinates from various string formats
 * @param {string} coordString - Coordinate string (e.g., "40.7128, -74.0060", "40.7128 N, 74.0060 W")
 * @returns {{latitude?: number, longitude?: number, error?: string}}
 */
export function parseCoordinateString(coordString) {
  if (!coordString || typeof coordString !== 'string') {
    return { error: 'Coordinate string is required' };
  }
  
  // Remove extra whitespace and normalize
  const cleaned = coordString.trim().replace(/\s+/g, ' ');
  
  // Pattern for decimal degrees: "40.7128, -74.0060" or "40.7128 -74.0060"
  const decimalPattern = /^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/;
  const decimalMatch = cleaned.match(decimalPattern);
  
  if (decimalMatch) {
    const latitude = parseFloat(decimalMatch[1]);
    const longitude = parseFloat(decimalMatch[2]);
    const validation = validateCoordinates(latitude, longitude);
    
    if (validation.valid) {
      return { latitude, longitude };
    } else {
      return { error: validation.error };
    }
  }
  
  // Pattern for degrees with cardinal directions: "40.7128 N, 74.0060 W"
  const cardinalPattern = /^(\d+\.?\d*)\s*([NS])[,\s]+(\d+\.?\d*)\s*([EW])$/i;
  const cardinalMatch = cleaned.match(cardinalPattern);
  
  if (cardinalMatch) {
    let latitude = parseFloat(cardinalMatch[1]);
    let longitude = parseFloat(cardinalMatch[3]);
    
    // Apply cardinal direction signs
    if (cardinalMatch[2].toLowerCase() === 's') latitude = -latitude;
    if (cardinalMatch[4].toLowerCase() === 'w') longitude = -longitude;
    
    const validation = validateCoordinates(latitude, longitude);
    
    if (validation.valid) {
      return { latitude, longitude };
    } else {
      return { error: validation.error };
    }
  }
  
  return { error: 'Invalid coordinate format. Use "latitude, longitude" (e.g., "40.7128, -74.0060")' };
}

/**
 * Write GPS coordinates to image file using exiftool
 * @param {string} filePath - Path to the image file
 * @param {number} latitude - Latitude in decimal degrees
 * @param {number} longitude - Longitude in decimal degrees
 * @returns {Promise<boolean>} - Success status
 */
export async function writeGpsData(filePath, latitude, longitude) {
  const validation = validateCoordinates(latitude, longitude);
  if (!validation.valid) {
    throw new Error(`Invalid coordinates: ${validation.error}`);
  }
  
  try {
    await new Promise((resolve, reject) => {
      const args = [
        '-overwrite_original',
        `-GPSLatitude=${Math.abs(latitude)}`,
        `-GPSLongitude=${Math.abs(longitude)}`,
        `-GPSLatitudeRef=${latitude >= 0 ? 'N' : 'S'}`,
        `-GPSLongitudeRef=${longitude >= 0 ? 'E' : 'W'}`,
        filePath
      ];
      
      const process = spawn('exiftool', args);
      let error = '';
      
      process.stderr.on('data', (data) => {
        error += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`exiftool failed: ${error || 'Unknown error'}`));
        }
      });
    });
    
    return true;
  } catch (error) {
    throw new Error(`Failed to write GPS data: ${error.message}`);
  }
}

/**
 * Get formatted coordinate string for display
 * @param {number} latitude - Latitude in decimal degrees
 * @param {number} longitude - Longitude in decimal degrees
 * @returns {string} - Formatted coordinate string
 */
export function formatCoordinates(latitude, longitude) {
  const latDir = latitude >= 0 ? 'N' : 'S';
  const lonDir = longitude >= 0 ? 'E' : 'W';
  
  return `${Math.abs(latitude).toFixed(6)}° ${latDir}, ${Math.abs(longitude).toFixed(6)}° ${lonDir}`;
}