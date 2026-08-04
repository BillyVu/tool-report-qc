let sessionDeviceId = '';

export function getDeviceMacAddress(): string {
  if (sessionDeviceId) return sessionDeviceId;
  const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
  sessionDeviceId = `SESSION-${hex()}${hex()}-${hex()}${hex()}-${hex()}${hex()}`;
  return sessionDeviceId;
}

export function getDeviceInfo(): string {
  if (typeof navigator === 'undefined') return 'Standard Web Client';

  const ua = navigator.userAgent;
  let browser = 'Chrome';
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Edg')) browser = 'Edge';

  let os = 'Windows';
  if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Linux')) os = 'Linux';

  return `${browser} (${os})`;
}
