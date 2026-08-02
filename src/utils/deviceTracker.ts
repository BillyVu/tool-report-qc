export function getDeviceMacAddress(): string {
  try {
    let mac = localStorage.getItem('qc_device_mac_v1');
    if (!mac) {
      // Generate a realistic MAC Address format: MAC-XX:XX:XX:XX:XX:XX
      const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
      mac = `MAC-${hex()}:${hex()}:${hex()}:${hex()}:${hex()}:${hex()}`;
      localStorage.setItem('qc_device_mac_v1', mac);
    }
    return mac;
  } catch (e) {
    return 'MAC-7C:D1:C3:A4:E5:F6';
  }
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
