import { describe, it, expect } from 'vitest';
import { formatDate } from './dateUtils';

describe('formatDate', () => {
  it('formats a known timestamp correctly (01/01/2023 08:05)', () => {
    // Using a fixed date: 1st January 2023, 08:05:00
    const fixedTimestamp = new Date(2023, 0, 1, 8, 5, 0).getTime(); // Month is 0-indexed
    const expected = '01/01/2023 08:05';
    expect(formatDate(fixedTimestamp)).toBe(expected);
  });

  it('pads single digit day and month (05/03/2024 07:09)', () => {
    // March 5th, 2024, 07:09
    const timestamp = new Date(2024, 2, 5, 7, 9).getTime(); // Month 2 is March
    const expected = '05/03/2024 07:09';
    expect(formatDate(timestamp)).toBe(expected);
  });

  it('pads single digit hour and minute (15/11/2022 03:04)', () => {
    // November 15th, 2022, 03:04
    const timestamp = new Date(2022, 10, 15, 3, 4).getTime(); // Month 10 is November
    const expected = '15/11/2022 03:04';
    expect(formatDate(timestamp)).toBe(expected);
  });

  it('formats another known timestamp correctly (22/05/2025 12:30)', () => {
    // May 22nd, 2025, 12:30:00
    const timestamp = new Date(2025, 4, 22, 12, 30, 0).getTime(); // Month 4 is May
    const expected = '22/05/2025 12:30';
    expect(formatDate(timestamp)).toBe(expected);
  });

  it('correctly formats a specific timestamp (e.g., 1748303472398) based on local timezone', () => {
    // This timestamp corresponds to May 22, 2025 10:11:12.398 AM GMT
    // The formatDate function uses local time methods (getDate, getMonth, getHours, etc.).
    // The output will vary depending on the timezone of the environment running the test.
    // This test makes sure that for a given timestamp, the function consistently applies local time conversion.
    const specificTimestamp = 1748303472398;

    // Determine the expected output based on the local timezone interpretation of the timestamp
    const date = new Date(specificTimestamp);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const expectedLocalFormattedDate = `${day}/${month}/${year} ${hours}:${minutes}`;

    expect(formatDate(specificTimestamp)).toBe(expectedLocalFormattedDate);
  });
});
