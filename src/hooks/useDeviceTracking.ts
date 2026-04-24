import { supabaseApi } from '@/lib/supabaseApi';

/**
 * Generate a simple device fingerprint from browser data
 */
const generateFingerprint = (): string => {
  const data = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.platform
  ].join('|');
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};

/**
 * Parse user agent to extract browser and OS names
 */
const parseUserAgent = (ua: string) => {
  // Detect browser
  let browser = 'Unknown Browser';
  if (ua.includes('Chrome') && !ua.includes('Edg')) {
    const match = ua.match(/Chrome\/(\d+)/);
    browser = match ? `Chrome ${match[1]}` : 'Chrome';
  } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
    const match = ua.match(/Version\/(\d+)/);
    browser = match ? `Safari ${match[1]}` : 'Safari';
  } else if (ua.includes('Firefox')) {
    const match = ua.match(/Firefox\/(\d+)/);
    browser = match ? `Firefox ${match[1]}` : 'Firefox';
  } else if (ua.includes('Edg')) {
    const match = ua.match(/Edg\/(\d+)/);
    browser = match ? `Edge ${match[1]}` : 'Edge';
  }

  // Detect OS
  let os = 'Unknown OS';
  if (ua.includes('Mac OS X')) {
    os = 'macOS';
  } else if (ua.includes('Windows NT 10')) {
    os = 'Windows';
  } else if (ua.includes('Windows')) {
    os = 'Windows';
  } else if (ua.includes('Linux') && !ua.includes('Android')) {
    os = 'Linux';
  } else if (ua.includes('Android')) {
    os = 'Android';
  } else if (ua.includes('iPhone')) {
    os = 'iOS';
  } else if (ua.includes('iPad')) {
    os = 'iPadOS';
  }

  // Detect device type
  let type = 'desktop';
  if (ua.includes('Mobile') || ua.includes('Android') && !ua.includes('Tablet')) {
    type = 'mobile';
  } else if (ua.includes('iPad') || ua.includes('Tablet')) {
    type = 'tablet';
  }

  return { browser, os, type };
};

/**
 * Get device information from browser
 */
const getDeviceInfo = () => {
  const { browser, os, type } = parseUserAgent(navigator.userAgent);
  return {
    browser,
    os,
    type,
    platform: navigator.platform,
    language: navigator.language,
    screen: `${window.screen.width}x${window.screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
};

/**
 * Track device login - uses REST API to avoid deadlocks
 */
export const trackDeviceLogin = async (userId: string, accessToken: string) => {
  try {
    const fingerprintHash = generateFingerprint();
    const deviceInfo = getDeviceInfo();
    const now = new Date().toISOString();
    
    // Use REST API for both operations in parallel
    await Promise.all([
      supabaseApi.rpc('record_device_fingerprint', accessToken, {
        _user_id: userId,
        _fingerprint_hash: fingerprintHash,
        _device_info: deviceInfo
      }),
      supabaseApi.patch(
        `profiles?user_id=eq.${userId}`,
        accessToken,
        { last_login: now }
      )
    ]);
    
  } catch {
    // Don't throw - tracking shouldn't break login flow
  }
};
