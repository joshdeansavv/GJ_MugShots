import { Arrestee } from '../types';

export async function fetchArrestees(): Promise<Arrestee[]> {
  // CLEAR ANY EXISTING CACHE
  localStorage.removeItem('gj_mugshots_arrestees_cache');
  
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };
  
  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
  
  try {
    const response = await fetch(`/api/arrestees?t=${Date.now()}&force=true`, {
      signal: controller.signal,
      headers
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data: Arrestee[] = await response.json();
    
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export async function forceRefreshData(): Promise<Arrestee[]> {
  localStorage.removeItem('gj_mugshots_arrestees_cache');
  
  try {
    // Force refresh API cache
    await fetch(`/api/refresh-cache`, { method: 'POST' });
  } catch (error) {
    // Silently handle cache refresh failure
  }
  
  // Fetch fresh data
  return await fetchArrestees();
}

export function clearCache(): void {
  localStorage.removeItem('gj_mugshots_arrestees_cache');
}

export function getCacheStatus(): any {
  return {
    clientCache: 'DISABLED - FORCE FRESH DATA MODE',
    timestamp: new Date().toISOString()
  };
}