export function getWorkstationId(): string {
  let workstationId = localStorage.getItem('workstation_id');
  
  if (!workstationId) {
    workstationId = `ws_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem('workstation_id', workstationId);
  }
  
  return workstationId;
}
