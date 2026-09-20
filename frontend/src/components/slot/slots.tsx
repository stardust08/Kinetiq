import { apiClient } from '../../api/client'; 

/**
 * Fetch available time slots for a service on a specific date
 * @param serviceId - UUID of the service
 * @param date - Date string in YYYY-MM-DD format
 * @returns Available slots data
 */
export const getAvailableSlots = async (serviceId: string, date: string) => {
  const response = await apiClient.get(`/api/slots/${serviceId}/available`, {
    params: { date }
  });
  return response.data;
};

/**
 * Lock a time slot for 5 minutes during checkout
 * @param serviceId - UUID of the service
 * @param slotTime - ISO datetime string of the slot to lock
 * @returns Lock details including lockId and expiration time
 */
export const lockSlot = async (serviceId: string, slotTime: string) => {
  const response = await apiClient.post(`/api/slots/lock`, {
    serviceId,
    slotTime
  });
  return response.data;
};

/**
 * Release a locked slot
 * @param lockId - UUID of the lock to release
 * @returns Success message
 */
export const releaseSlot = async (lockId: string) => {
  const response = await apiClient.delete(`/api/slots/${lockId}`);
  return response.data;
};