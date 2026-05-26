import os from 'os';

export class NetworkService {
  /**
   * Automatically detects the active local IPv4 address (e.g. Wi-Fi or Ethernet).
   * It prioritizes standard interfaces over virtual ones (like WSL, Docker, or VirtualBox).
   */
  public static getLocalIp(): string {
    const interfaces = os.networkInterfaces();
    const primaryCandidates: string[] = [];
    const virtualCandidates: string[] = [];
    
    for (const interfaceName of Object.keys(interfaces)) {
      const networkInterface = interfaces[interfaceName];
      if (!networkInterface) continue;
      
      for (const config of networkInterface) {
        // Skip loopback and non-IPv4 addresses
        if (config.internal || config.family !== 'IPv4') {
          continue;
        }
        
        const ip = config.address;
        const nameLower = interfaceName.toLowerCase();
        
        // Identify virtual adapters commonly added by virtualization software
        const isVirtual = nameLower.includes('docker') || 
                          nameLower.includes('vbox') || 
                          nameLower.includes('virtual') || 
                          nameLower.includes('wsl') || 
                          nameLower.includes('hyper-v') || 
                          nameLower.includes('vmware') || 
                          nameLower.includes('npcap');
                          
        if (isVirtual) {
          virtualCandidates.push(ip);
        } else {
          primaryCandidates.push(ip);
        }
      }
    }
    
    // Return first primary candidate, or fallback to virtual candidate, or localhost
    if (primaryCandidates.length > 0) {
      return primaryCandidates[0];
    }
    if (virtualCandidates.length > 0) {
      return virtualCandidates[0];
    }
    return '127.0.0.1';
  }
}
