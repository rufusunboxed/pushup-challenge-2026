/**
 * Date utility functions for UK timezone calculations
 */

export function getCurrentMonthRange() {
  const now = new Date();
  const ukDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  
  // Get first day of current month
  const monthStart = new Date(ukDate.getFullYear(), ukDate.getMonth(), 1);
  monthStart.setHours(0, 0, 0, 0);
  
  // Get last day of current month
  const monthEnd = new Date(ukDate.getFullYear(), ukDate.getMonth() + 1, 0);
  monthEnd.setHours(23, 59, 59, 999);
  
  return { monthStart, monthEnd };
}

export function getDaysInCurrentMonth(): number {
  const now = new Date();
  const ukDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  
  // Get last day of current month (day 0 of next month)
  const lastDay = new Date(ukDate.getFullYear(), ukDate.getMonth() + 1, 0);
  return lastDay.getDate();
}

export function formatMonthYear(): string {
  const now = new Date();
  const ukDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  
  const month = ukDate.toLocaleDateString('en-GB', { month: 'long' });
  const year = ukDate.getFullYear();
  
  return `${month} ${year}`;
}

export function formatDateLabel(date: Date): string {
  const ukDate = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  
  const day = ukDate.getDate();
  const month = ukDate.toLocaleDateString('en-GB', { month: 'long' });
  const year = ukDate.getFullYear();
  
  // Add ordinal suffix
  const getOrdinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  
  return `${getOrdinal(day)} ${month} ${year}`;
}

export function getCurrentDayRange() {
  const now = new Date();
  const ukDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  
  const dayStart = new Date(ukDate);
  dayStart.setHours(0, 0, 0, 0);
  
  const dayEnd = new Date(ukDate);
  dayEnd.setHours(23, 59, 59, 999);
  
  return { dayStart, dayEnd };
}

